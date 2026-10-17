// JSON endpoints behind the admin page. Every handler gets an already-authenticated admin.
import {
  cleanMessage,
  extractUrls,
  type Hackathon,
  parseUrlInput,
  shortPrize,
  stripEmoji,
  substantiveLength,
} from "@arinjilley/core";
import { checkAiLimit, extractListing, fetchPageInfo, recordAiCall } from "@arinjilley/core/ai";
import {
  admins,
  createListing,
  findByUrls,
  getHackathon,
  getHackathonRow,
  type ListingFields,
  updateFields,
  updateHackathon,
} from "@arinjilley/core/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { fromParts, listingToForm } from "../../shared/form";
import type { Admin } from "./session";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ error, ...extra }, status);

// ── Validation: form → listing fields ──

const text = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((s) => stripEmoji(s).replace(/\s+/g, " ").trim().slice(0, max));
const parts = z.object({
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  time: z.string().regex(/^(\d{2}:\d{2})?$/),
});
const int = z
  .string()
  .regex(/^\d{0,2}$/)
  .transform((s) => (s ? Number(s) : null));

const FormSchema = z.object({
  title: text(90).refine((s) => s.length > 0, "Title is required"),
  organiser: text(80),
  summary: z
    .string()
    .max(2000)
    .transform((s) => stripEmoji(s).trim().slice(0, 500)),
  howItWorks: z.string().max(2000),
  mode: z.enum(["online", "offline", "hybrid"]),
  city: text(40),
  venue: text(80),
  deadline: parts,
  start: parts,
  end: parts,
  teamMin: int,
  teamMax: int,
  eligibility: text(120),
  feeText: text(80),
  isFree: z.boolean(),
  prizeText: text(120),
  prizeShort: text(8),
  themes: z.string().max(500),
  registerUrl: z.string().max(500),
  moreInfoUrl: z.string().max(500),
  poster: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("generated"), style: z.number().int().min(0).max(1000) }),
    z.object({
      kind: z.literal("custom"),
      fileId: z.string().regex(/^[\w-]{10,200}$/),
      thumbId: z
        .string()
        .regex(/^[\w-]{10,200}$/)
        .nullable(),
    }),
  ]),
  extractedBy: z.enum(["openai", "rules", "manual"]).optional(),
  sourceText: z.string().max(20_000).optional(),
});

type Parsed = z.infer<typeof FormSchema>;

function toFields(f: Parsed): { fields: ListingFields } | { error: string } {
  const url = (s: string, label: string) => {
    if (!s.trim()) return { ok: true as const, value: null };
    const u = parseUrlInput(s);
    return u
      ? { ok: true as const, value: u }
      : { ok: false as const, error: `${label} isn't a valid link.` };
  };
  const reg = url(f.registerUrl, "Register link");
  if (!reg.ok) return { error: reg.error };
  const more = url(f.moreInfoUrl, "More info link");
  if (!more.ok) return { error: more.error };
  const deadline = fromParts(f.deadline);
  const start = fromParts(f.start);
  const end = fromParts(f.end);
  if ((f.deadline.date && !deadline) || (f.start.date && !start) || (f.end.date && !end))
    return { error: "One of the dates isn't valid." };
  if (start && end && end.at < start.at) return { error: "The end date is before the start date." };
  if (f.teamMin != null && f.teamMax != null && f.teamMin > f.teamMax)
    return { error: "Team size: the minimum is bigger than the maximum." };
  // One step per line (commas are allowed inside a step).
  const steps = (s: string) =>
    s
      .split(/\r?\n/)
      .map((x) =>
        stripEmoji(x)
          .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "")
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 4);
  const list = (s: string, max: number) =>
    [
      ...new Set(
        s
          .split(/[,\n]+/)
          .map((x) => stripEmoji(x).trim())
          .filter(Boolean),
      ),
    ].slice(0, max);
  return {
    fields: {
      title: f.title,
      organiser: f.organiser || null,
      summary: f.summary || null,
      howItWorks: steps(f.howItWorks),
      mode: f.mode,
      city: f.mode === "online" ? null : f.city || null,
      venue: f.venue || null,
      deadline,
      start,
      end,
      teamMin: f.teamMin,
      teamMax: f.teamMax,
      eligibility: f.eligibility || null,
      feeText: f.feeText || null,
      isFree: f.isFree,
      prizeText: f.prizeText || null,
      prizeShort: f.prizeShort || shortPrize(f.prizeText) || null,
      themes: list(f.themes, 5),
      registerUrl: reg.value,
      moreInfoUrl: more.value,
      brochureUrl: null,
    },
  };
}

async function readForm(request: Request): Promise<{ form: Parsed } | { error: string }> {
  const body = await request.json().catch(() => null);
  const parsed = FormSchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Some fields aren't valid." };
  return { form: parsed.data };
}

/** Fields shown on the generated poster: if any of these change, the poster PNG is re-rendered. */
const POSTER_KEYS = [
  "title",
  "organiser",
  "mode",
  "city",
  "venue",
  "deadline",
  "start",
  "end",
  "teamMin",
  "teamMax",
  "isFree",
  "feeText",
  "prizeShort",
  "themes",
  "registerUrl",
] as const;
const posterSignature = (h: Partial<Hackathon>) => JSON.stringify(POSTER_KEYS.map((k) => h[k] ?? null));

/** Asks the bot (via the service binding) to render the poster or refresh its Telegram preview card. */
async function botJob(env: Env, job: { type: "poster" | "refresh"; id: string }) {
  try {
    const res = await env.BOT.fetch("https://internal/_internal/job", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": env.TELEGRAM_WEBHOOK_SECRET },
      body: JSON.stringify(job),
    });
    if (res.status !== 202) console.error(`bot job ${job.type} failed: ${res.status}`);
  } catch (err) {
    console.error(`bot job ${job.type} failed`, err);
  }
}

// ── Handlers ──

export async function extractHandler(request: Request, env: Env, admin: Admin): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const raw = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  const text = cleanMessage(raw);
  if (!text) return fail("Paste the post text or a link first.");
  const d = drizzle(env.DB);
  const limit = await checkAiLimit(env, d, admin.id);
  if (!limit.ok) return fail(limit.message, 429);
  const urls = extractUrls(raw);
  const page = substantiveLength(text) < 280 && urls[0] ? await fetchPageInfo(urls[0]) : null;
  const ex = await extractListing(env, { text, urls, sentAt: Date.now(), page });
  if (ex.ai) await recordAiCall(env, d, admin.id, ex.ai.ok, ex.ai.usage);
  const dup = await findByUrls(d, ex.fields.registerUrl ? [ex.fields.registerUrl] : urls);
  return json({
    isHackathon: ex.isHackathon,
    reason: ex.reason,
    source: ex.source,
    warnings: ex.warnings,
    form: listingToForm(
      { ...ex.fields, moreInfoUrl: ex.fields.moreInfoUrl },
      { kind: "generated", style: 0 },
    ),
    duplicate: dup ? { id: dup.id, title: dup.title, status: dup.status } : null,
    sourceText: text,
  });
}

export async function createHandler(request: Request, env: Env, admin: Admin): Promise<Response> {
  const r = await readForm(request);
  if ("error" in r) return fail(r.error);
  const conv = toFields(r.form);
  if ("error" in conv) return fail(conv.error);
  const d = drizzle(env.DB);
  if (conv.fields.registerUrl) {
    const dup = await findByUrls(d, [conv.fields.registerUrl]);
    if (dup) return fail(`Already listed: “${dup.title}” (${dup.status}).`, 409, { id: dup.id });
  }
  const p = r.form.poster;
  const h = await createListing(d, {
    fields: conv.fields,
    createdBy: admin.id,
    sourceText: r.form.sourceText ? cleanMessage(r.form.sourceText) : null,
    extractedBy: r.form.extractedBy ?? "manual",
    posterKind: p.kind,
    posterFileId: p.kind === "custom" ? p.fileId : null,
    posterThumbFileId: p.kind === "custom" ? p.thumbId : null,
    posterStyle: p.kind === "generated" ? p.style : undefined,
    previewChatId: admin.id, // the rendered poster is sent to this admin's chat with the bot
  });
  if (h.posterKind === "generated") await botJob(env, { type: "poster", id: h.id });
  return json({ id: h.id, slug: h.slug, status: h.status });
}

export async function updateHandler(request: Request, env: Env, admin: Admin, id: string): Promise<Response> {
  const d = drizzle(env.DB);
  const before = await getHackathon(d, id);
  const row = await getHackathonRow(d, id);
  if (!before || !row) return fail("That listing no longer exists.", 404);
  const r = await readForm(request);
  if ("error" in r) return fail(r.error);
  const conv = toFields(r.form);
  if ("error" in conv) return fail(conv.error);
  if (conv.fields.registerUrl) {
    const dup = await findByUrls(d, [conv.fields.registerUrl], id);
    if (dup)
      return fail(`Another listing already uses that register link: “${dup.title}”.`, 409, { id: dup.id });
  }

  await updateFields(d, id, conv.fields);
  const p = r.form.poster;
  let renderPoster = false;
  if (p.kind === "custom") {
    if (row.posterKind !== "custom" || row.posterFileId !== p.fileId) {
      await updateHackathon(d, id, {
        posterKind: "custom",
        posterFileId: p.fileId,
        posterThumbFileId: p.thumbId,
        posterStatus: "ready",
      });
    }
  } else {
    const changed =
      row.posterKind !== "generated" ||
      row.posterStyle !== p.style ||
      row.posterStatus !== "ready" ||
      posterSignature(before) !== posterSignature({ ...before, ...conv.fields });
    if (changed) {
      await updateHackathon(d, id, {
        posterKind: "generated",
        posterStyle: p.style,
        posterStatus: "pending",
        ...(row.posterKind !== "generated" ? { posterFileId: null, posterThumbFileId: null } : {}),
      });
      renderPoster = true;
    }
  }
  if (!row.previewChatId) await updateHackathon(d, id, { previewChatId: admin.id });
  if (renderPoster) await botJob(env, { type: "poster", id });
  await botJob(env, { type: "refresh", id });
  const after = await getHackathon(d, id);
  return json({ id, slug: after?.slug, status: after?.status });
}

export async function statusHandler(request: Request, env: Env, id: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status;
  if (status !== "live" && status !== "draft" && status !== "discarded") return fail("Unknown status.");
  const d = drizzle(env.DB);
  const row = await getHackathonRow(d, id);
  if (!row) return fail("That listing no longer exists.", 404);
  if (status === "live" && row.title === "Untitled hackathon")
    return fail("Give it a title before publishing.");
  await updateHackathon(d, id, {
    status,
    ...(status === "live" && !row.publishedAt ? { publishedAt: Date.now() } : {}),
  });
  await botJob(env, { type: "refresh", id });
  return json({ id, status, slug: row.slug });
}

const MAX_UPLOAD = 10 * 1024 * 1024; // Telegram's limit for photos

/** Uploads a poster image to Telegram (into the admin's chat with the bot) and returns its file IDs. */
export async function uploadHandler(request: Request, env: Env, admin: Admin): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return fail("Choose an image first.");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return fail("Use a JPG, PNG or WebP image.");
  if (file.size > MAX_UPLOAD) return fail("That image is over 10 MB.");

  const upload = new FormData();
  upload.set("chat_id", String(admin.id));
  upload.set("caption", "Poster uploaded from the admin page");
  upload.set("disable_notification", "true");
  upload.set("photo", file, file.name || "poster.jpg");
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: upload,
  });
  const out = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
    result?: { photo?: { file_id: string; width: number }[] };
  } | null;
  const sizes = out?.result?.photo;
  if (!out?.ok || !sizes?.length)
    return fail(`Telegram didn't accept the image: ${out?.description ?? "unknown error"}`, 502);
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  const fileId = sorted.at(-1)!.file_id;
  const thumbId = (sorted.find((s) => s.width >= 320) ?? sorted.at(-1)!).file_id;
  return json({ fileId, thumbId, url: `/admin/img/${encodeURIComponent(thumbId)}` });
}

export async function addAdminHandler(request: Request, env: Env, admin: Admin): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { id?: unknown; name?: unknown } | null;
  const idText = String(body?.id ?? "").trim();
  if (!/^\d{5,15}$/.test(idText))
    return fail("Enter their numeric Telegram ID (they get it by messaging the bot).");
  const id = Number(idText);
  if (id === Number(env.OWNER_TELEGRAM_ID)) return fail("That's the owner.");
  const name = typeof body?.name === "string" ? stripEmoji(body.name).trim().slice(0, 60) || null : null;
  await drizzle(env.DB)
    .insert(admins)
    .values({ telegramId: id, name, addedBy: admin.id })
    .onConflictDoUpdate({ target: admins.telegramId, set: { name } });
  return json({ ok: true });
}

export async function removeAdminHandler(env: Env, id: number): Promise<Response> {
  if (id === Number(env.OWNER_TELEGRAM_ID)) return fail("The owner can't be removed.");
  await drizzle(env.DB).delete(admins).where(eq(admins.telegramId, id));
  return json({ ok: true });
}
