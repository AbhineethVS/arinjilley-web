// Background work. Telegram needs a fast reply, so slow steps (reading pages, the AI, rendering posters) run as
// separate "jobs": the Worker calls itself through the SELF service binding, answers 202 straight away, and does
// the work in waitUntil. Each job gets its own time budget. A cron sweep every minute retries anything missed.
import { cleanMessage, extractUrls, substantiveLength } from "@arinjilley/core";
import { InlineKeyboard } from "grammy";
import { extractListing, extractWithRules } from "./extract";
import { fetchPageInfo } from "./extract/page";
import { renderPosterJob, showPreview } from "./preview";
import {
  claimBatch,
  createDraft,
  db,
  findByUrls,
  overdueBatches,
  pendingPosters,
  updateBatch,
} from "./store";
import { api, esc, ignoreNotModified } from "./telegram";

/** How long to wait after the last message before reading a batch (so a link + its text become one listing). */
export const QUIET_MS = 12_000;

export type Job = { type: "batch"; id: string; now?: boolean } | { type: "poster"; id: string };

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
    if (job.type === "batch") await processBatch(env, job.id, job.now ?? false);
    else await renderPosterJob(env, job.id);
  } catch (err) {
    console.error(`job ${job.type} ${job.id} failed`, err);
  }
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

/** Batch → draft listing → preview card (+ poster job). */
export async function processBatch(env: Env, id: string, now: boolean): Promise<void> {
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

    await editAck(
      env,
      batch.chatId,
      batch.ackMessageId,
      "Reading it… <i>(the AI usually takes 5–15 seconds)</i>",
    );

    const extraction = text
      ? await extractListing(env, {
          text,
          urls,
          sentAt: batch.firstMessageAt,
          page: substantiveLength(text) < 280 && urls[0] ? await fetchPageInfo(urls[0]) : null,
        })
      : {
          ...extractWithRules("", [], batch.firstMessageAt),
          warnings: ["Image only: fill in the details with Edit."],
        };

    if (!extraction.isHackathon && !batch.force && !batch.photoFileId) {
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

    const h = await createDraft(d, {
      fields: extraction.fields,
      createdBy: batch.adminId,
      sourceText: text,
      extractedBy: extraction.source,
      posterKind: batch.photoFileId ? "custom" : "generated",
      posterFileId: batch.photoFileId,
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
}
