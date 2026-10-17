// Background work. Telegram needs a fast reply, so slow steps (reading pages, the AI, rendering posters) run as
// separate "jobs": the Worker calls itself through the SELF service binding, answers 202 straight away, and does
// the work in waitUntil. Each job gets its own time budget. A cron sweep every minute retries anything missed.
import { cleanMessage, extractUrls, substantiveLength } from "@arinjilley/core";
import {
  checkAiLimit,
  extractListing,
  extractWithRules,
  fetchPageInfo,
  recordAiCall,
} from "@arinjilley/core/ai";
import { alertOwner, errorText } from "@arinjilley/core/db";
import { InlineKeyboard } from "grammy";
import { refreshPreview, renderPosterJob, showPreview } from "./preview";
import {
  claimBatch,
  createListing,
  db,
  findByUrls,
  overdueBatches,
  pendingPosters,
  updateBatch,
} from "./store";
import { api, esc, ignoreNotModified } from "./telegram";

/** How long to wait after the last message before reading a batch (so a link + its text become one listing). */
export const QUIET_MS = 12_000;

export type Job =
  | { type: "batch"; id: string; now?: boolean; manual?: boolean }
  | { type: "poster"; id: string }
  // Sent by the admin page after an edit, so the Telegram preview card stays in sync.
  | { type: "refresh"; id: string };

const INTERNAL_PATH = "https://internal/_internal/job";

/** Starts a job in a fresh invocation of this Worker. */
export async function kick(env: Env, job: Job): Promise<void> {
  const res = await env.SELF.fetch(INTERNAL_PATH, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify(job),
  });
  if (res.status !== 202) console.error(`kick ${job.type} ${job.id} failed: ${res.status}`);
}

export function isInternalJobRequest(request: Request, env: Env): boolean {
  return (
    new URL(request.url).pathname === "/_internal/job" &&
    request.method === "POST" &&
    request.headers.get("x-internal-secret") === env.TELEGRAM_WEBHOOK_SECRET
  );
}

export async function runJob(env: Env, job: Job): Promise<void> {
  try {
    if (job.type === "batch") await processBatch(env, job.id, job.now ?? false, job.manual ?? false);
    else if (job.type === "poster") await renderPosterJob(env, job.id);
    else await refreshPreview(env, job.id);
  } catch (err) {
    console.error(`job ${job.type} ${job.id} failed`, err);
    const what = {
      batch: "Reading a forwarded post",
      poster: "Making a poster",
      refresh: "Updating a preview",
    }[job.type];
    await alertOwner(env, db(env), `job:${job.type}`, `${what} failed (it will be retried)`, errorText(err));
  }
}

/** Explains an OpenAI failure in plain words: out of credit, bad key, or a temporary problem. */
function openAiAlert(error = ""): { key: string; title: string } {
  if (/insufficient_quota|billing|exceeded your current quota/i.test(error)) {
    return {
      key: "openai:quota",
      title:
        "OpenAI credit has run out (or hit the monthly budget). Drafts are being filled with basic rules only. Top up or raise the limit at platform.openai.com → Billing.",
    };
  }
  if (/OpenAI 401|invalid_api_key|Incorrect API key/i.test(error)) {
    return {
      key: "openai:key",
      title:
        "The OpenAI API key isn't working (revoked or wrong). Drafts are being filled with basic rules only. Create a new key and update OPENAI_API_KEY.",
    };
  }
  return {
    key: "openai:other",
    title:
      "An OpenAI call failed, so a draft was filled with basic rules. Usually temporary; check it if this keeps happening.",
  };
}

async function editAck(
  env: Env,
  chatId: number,
  messageId: number | null,
  text: string,
  keyboard?: InlineKeyboard,
) {
  const tg = api(env);
  const options = {
    parse_mode: "HTML" as const,
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  };
  if (messageId) await tg.editMessageText(chatId, messageId, text, options).catch(ignoreNotModified);
  else await tg.sendMessage(chatId, text, options);
}

/** Batch → draft listing → preview card (+ poster job). `manual` creates the draft without the AI. */
export async function processBatch(env: Env, id: string, now: boolean, manual = false): Promise<void> {
  const d = db(env);
  const batch = await claimBatch(d, id, now ? Number.MAX_SAFE_INTEGER : Date.now() - QUIET_MS + 1000);
  if (!batch) return; // more messages arrived (a later kick will handle it), or already processed

  try {
    const text = cleanMessage(batch.text);
    const urls = extractUrls(batch.text);

    if (!text && !batch.photoFileId) {
      await updateBatch(d, id, { status: "done" });
      return;
    }

    if (!batch.force) {
      const dup = await findByUrls(d, urls);
      if (dup) {
        await updateBatch(d, id, { status: "done", hackathonId: dup.id });
        await editAck(
          env,
          batch.chatId,
          batch.ackMessageId,
          `This one's already ${dup.status === "live" ? "<b>live</b>" : "a <b>draft</b>"}: <b>${esc(dup.title)}</b>`,
          new InlineKeyboard().text("Open it", `open:${dup.id}`),
        );
        return;
      }
    }

    // "Fill it in manually" (or an image with no text) skips the AI entirely.
    const useAi = !!text && !manual;
    if (useAi) {
      const limit = await checkAiLimit(env, d, batch.adminId);
      if (!limit.ok) {
        await updateBatch(d, id, { status: "rejected" });
        await editAck(
          env,
          batch.chatId,
          batch.ackMessageId,
          `⏳ <b>AI limit reached.</b> ${esc(limit.message)}\n\nYou can try again later, or create the draft without the AI and fill in the details yourself.`,
          new InlineKeyboard().text("Try again", `go:${id}`).text("Fill it in manually", `manual:${id}`),
        );
        return;
      }
      await editAck(env, batch.chatId, batch.ackMessageId, "Reading it… <i>(usually takes 5–15 seconds)</i>");
    }

    const extraction = useAi
      ? await extractListing(env, {
          text,
          urls,
          sentAt: batch.firstMessageAt,
          page: substantiveLength(text) < 280 && urls[0] ? await fetchPageInfo(urls[0]) : null,
        })
      : {
          ...extractWithRules(text, urls, batch.firstMessageAt),
          warnings: [
            text
              ? "Created without the AI: fill in the details with Edit."
              : "Image only: fill in the details with Edit.",
          ],
        };
    if (extraction.ai) await recordAiCall(env, d, batch.adminId, extraction.ai.ok, extraction.ai.usage);
    if (extraction.ai && !extraction.ai.ok) {
      const a = openAiAlert(extraction.ai.error);
      await alertOwner(env, d, a.key, a.title, extraction.ai.error);
    }

    if (!extraction.isHackathon && !batch.force && !manual && !batch.photoFileId) {
      await updateBatch(d, id, { status: "rejected" });
      await editAck(
        env,
        batch.chatId,
        batch.ackMessageId,
        `That doesn't look like a hackathon${extraction.reason ? `: <i>${esc(extraction.reason)}</i>` : "."}`,
        new InlineKeyboard().text("Make it a listing anyway", `force:${id}`),
      );
      return;
    }

    const h = await createListing(d, {
      fields: extraction.fields,
      createdBy: batch.adminId,
      sourceText: text,
      extractedBy: extraction.source,
      posterKind: batch.photoFileId ? "custom" : "generated",
      posterFileId: batch.photoFileId,
      posterThumbFileId: batch.photoThumbFileId,
    });
    await updateBatch(d, id, { status: "done", hackathonId: h.id });
    await showPreview(env, h, batch.chatId, {
      replaceMessageId: batch.ackMessageId,
      warnings: extraction.warnings,
    });
    if (h.posterKind === "generated") await kick(env, { type: "poster", id: h.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const giveUp = batch.attempts >= 3;
    await updateBatch(d, id, { status: giveUp ? "failed" : "collecting", lastError: message.slice(0, 500) });
    if (giveUp) {
      await editAck(
        env,
        batch.chatId,
        batch.ackMessageId,
        `Sorry, I couldn't process that: <code>${esc(message.slice(0, 200))}</code>`,
      ).catch(() => {});
    }
    throw err;
  }
}

/** Cron safety net (every minute): retry batches and posters whose kick was missed or failed. */
export async function sweep(env: Env, ctx: ExecutionContext): Promise<void> {
  const d = db(env);
  const now = Date.now();
  for (const b of await overdueBatches(d, now)) {
    if (b.status === "processing") await updateBatch(d, b.id, { status: "collecting" });
    ctx.waitUntil(kick(env, { type: "batch", id: b.id, now: true }));
  }
  for (const p of await pendingPosters(d, now - 60_000)) {
    ctx.waitUntil(kick(env, { type: "poster", id: p.id }));
  }
  // Once an hour: warn about posters that have been waiting a long time, and tidy old rows.
  if (new Date(now).getUTCMinutes() === 7) {
    const stuck = await pendingPosters(d, now - 30 * 60_000);
    if (stuck.length) {
      await alertOwner(
        env,
        d,
        "posters:stuck",
        `${stuck.length} poster(s) have been waiting over 30 minutes. Browser Rendering's free 10 minutes/day may be used up; they'll keep retrying and usually go through after midnight UTC (5:30 AM IST).`,
      );
    }
    ctx.waitUntil(housekeeping(env, now));
  }
}

/** Deletes rows nothing needs any more, so the database stays small forever. */
async function housekeeping(env: Env, now: number): Promise<void> {
  try {
    const day = 86_400_000;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM admin_logins WHERE created_at < ?").bind(now - day),
      env.DB.prepare("DELETE FROM admin_state WHERE updated_at < ?").bind(now - day),
      env.DB.prepare(
        "DELETE FROM inbox_batches WHERE status IN ('done','rejected','failed') AND updated_at < ?",
      ).bind(now - 30 * day),
      // /usage reports the last 30 days; keep 120 for a little history.
      env.DB.prepare("DELETE FROM ai_calls WHERE created_at < ?").bind(now - 120 * day),
    ]);
  } catch (err) {
    console.error("housekeeping failed", err);
  }
}
