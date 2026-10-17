// The draft/live "card" an admin sees in Telegram: a details message with buttons, plus the poster below it.
import {
  boardStatus,
  countdown,
  dateRange,
  deadlineInstant,
  fullDate,
  type Hackathon,
  hostOf,
  MODE_LABEL,
  teamText,
  whatsappText,
} from "@arinjilley/core";
import { InlineKeyboard, InputFile } from "grammy";
import { RenderBusyError, renderPosterPng } from "./render";
import { type DB, db, getHackathon, getHackathonRow, updateHackathon } from "./store";
import { api, esc, ignoreNotModified } from "./telegram";

const dash = "<i>not set</i>";

/** Problems worth pointing out before publishing. */
export function listingWarnings(h: Hackathon, extractedBy?: string | null): string[] {
  const w: string[] = [];
  if (extractedBy === "rules")
    w.push("The AI was unavailable, so only the basics were filled in. Check every field.");
  if (h.title === "Untitled hackathon") w.push("Set a title.");
  if (!h.registerUrl) w.push("No registration link.");
  if (h.deadline && deadlineInstant(h.deadline) < Date.now()) w.push("The deadline has already passed.");
  if (!h.deadline && !h.start) w.push("No deadline or dates: it'll stay listed until you remove it.");
  return w;
}

export function previewText(h: Hackathon, extra: string[] = [], extractedBy?: string | null): string {
  const header =
    h.status === "live"
      ? "✅ <b>LIVE</b> on the site"
      : h.status === "discarded"
        ? "🗑 <b>DISCARDED</b>"
        : "📝 <b>DRAFT</b> · check the details, then Publish";

  const lines = [header, "", `<b>${esc(h.title)}</b>`];
  if (h.organiser) lines.push(`by ${esc(h.organiser)}`);
  lines.push("");

  if (h.deadline) {
    const closes = deadlineInstant(h.deadline);
    const left = closes - Date.now();
    lines.push(
      `<b>Registration closes:</b> ${fullDate({ at: closes, dateOnly: false })}${left > 0 ? ` <i>(in ${countdown(left)})</i>` : ""}`,
    );
  } else {
    lines.push("<b>Registration closes:</b> no fixed deadline (rolling)");
  }
  lines.push(`<b>Hackathon:</b> ${h.start ? esc(dateRange(h.start, h.end)) : dash}`);
  const place = [h.city, h.venue && h.venue !== h.city ? h.venue : null].filter(Boolean).join(" · ");
  lines.push(`<b>Where:</b> ${MODE_LABEL[h.mode]}${place ? ` · ${esc(place)}` : ""}`);
  lines.push(`<b>Team:</b> ${h.teamMin == null && h.teamMax == null ? dash : esc(teamText(h))}`);
  lines.push(`<b>Who can join:</b> ${h.eligibility ? esc(h.eligibility) : dash}`);
  lines.push(`<b>Fee:</b> ${h.feeText ? esc(h.feeText) : h.isFree ? "Free" : dash}`);
  lines.push(
    `<b>Prize:</b> ${h.prizeText ? esc(h.prizeText) : dash}${h.prizeShort ? ` <i>(poster: ${esc(h.prizeShort)})</i>` : ""}`,
  );
  lines.push(`<b>Themes:</b> ${h.themes.length ? esc(h.themes.join(", ")) : dash}`);
  lines.push(
    `<b>Register:</b> ${h.registerUrl ? `<a href="${esc(h.registerUrl)}">${esc(hostOf(h.registerUrl) ?? h.registerUrl)}</a>` : dash}`,
  );
  if (h.summary) lines.push("", `<b>About:</b> ${esc(h.summary)}`);
  if (h.howItWorks.length) {
    lines.push("", "<b>How it works:</b>", ...h.howItWorks.map((s, i) => `${i + 1}. ${esc(s)}`));
  }
  if (h.status === "live") {
    const s = boardStatus(h);
    if (s === "archived") lines.push("", "<i>This listing is now in the archive.</i>");
  }
  const warnings = [...extra, ...listingWarnings(h, extractedBy)];
  if (warnings.length && h.status !== "discarded") lines.push("", ...warnings.map((w) => `⚠️ ${esc(w)}`));
  return lines.join("\n");
}

export function mainKeyboard(h: Hackathon): InlineKeyboard {
  const k = new InlineKeyboard();
  if (h.status === "discarded") return k.text("↩️ Restore as draft", `res:${h.id}`);
  if (h.status === "draft") k.text("✅ Publish", `pub:${h.id}`).text("✏️ Edit", `edit:${h.id}`).row();
  else k.text("✏️ Edit", `edit:${h.id}`).text("💬 WhatsApp text", `wa:${h.id}`).row();
  if (h.posterKind === "generated") k.text("🎨 Shuffle style", `shuf:${h.id}`);
  else k.text("🎨 Use generated poster", `gen:${h.id}`);
  k.text("🖼 Use my image", `img:${h.id}`).row();
  if (h.status === "draft") k.text("🗑 Discard", `dis:${h.id}`);
  else k.text("⏸ Unpublish", `unp:${h.id}`);
  return k;
}

/** Sends a fresh preview card (or turns the "Got it" message into one). Remembers where it is. */
export async function showPreview(
  env: Env,
  h: Hackathon,
  chatId: number,
  opts: { replaceMessageId?: number | null; warnings?: string[] } = {},
): Promise<void> {
  const d = db(env);
  const tg = api(env);
  const row = await getHackathonRow(d, h.id);
  const text = previewText(h, opts.warnings, row?.extractedBy);
  const options = {
    parse_mode: "HTML" as const,
    reply_markup: mainKeyboard(h),
    link_preview_options: { is_disabled: true },
  };
  let messageId: number;
  if (opts.replaceMessageId) {
    await tg.editMessageText(chatId, opts.replaceMessageId, text, options).catch(ignoreNotModified);
    messageId = opts.replaceMessageId;
  } else {
    messageId = (await tg.sendMessage(chatId, text, options)).message_id;
  }
  await updateHackathon(d, h.id, {
    previewChatId: chatId,
    previewTextMessageId: messageId,
    previewPhotoMessageId: null,
  });
  if (h.posterFileId && (h.posterKind !== "generated" || row?.posterStatus === "ready")) {
    const photo = await tg.sendPhoto(chatId, h.posterFileId, {
      caption: posterCaption(h),
      reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
    });
    await updateHackathon(d, h.id, { previewPhotoMessageId: photo.message_id });
  }
}

/** Updates the existing preview card in place after an edit (or sends a new one if it's gone). */
export async function refreshPreview(env: Env, id: string): Promise<void> {
  const d = db(env);
  const row = await getHackathonRow(d, id);
  const h = await getHackathon(d, id);
  if (!row || !h || !row.previewChatId || !row.previewTextMessageId) return;
  try {
    await api(env)
      .editMessageText(row.previewChatId, row.previewTextMessageId, previewText(h, [], row.extractedBy), {
        parse_mode: "HTML",
        reply_markup: mainKeyboard(h),
        link_preview_options: { is_disabled: true },
      })
      .catch(ignoreNotModified);
  } catch (err) {
    console.error("refreshPreview failed; sending a new card", err);
    await showPreview(env, h, row.previewChatId);
  }
}

const posterCaption = (h: Hackathon) =>
  h.posterKind === "generated" ? `Poster · ${h.title}` : `Poster (your image) · ${h.title}`;

/**
 * Renders the generated poster with Browser Rendering and puts it under the preview card.
 * Leaves posterStatus "pending" if the browser is busy, so the cron retries it.
 */
export async function renderPosterJob(env: Env, id: string): Promise<void> {
  const d = db(env);
  const row = await getHackathonRow(d, id);
  const h = await getHackathon(d, id);
  if (!row || !h || h.status === "discarded" || h.posterKind !== "generated") return;

  let png: Uint8Array;
  try {
    png = await renderPosterPng(env, h);
  } catch (err) {
    if (err instanceof RenderBusyError) {
      console.log(`poster ${id}: browser busy, retrying later`);
      return;
    }
    await updateHackathon(d, id, { posterStatus: "failed" });
    throw err;
  }

  // If the listing changed while rendering (e.g. Shuffle pressed again), that change kicked its own render.
  const latest = await getHackathonRow(d, id);
  if (!latest || latest.posterStyle !== row.posterStyle || latest.updatedAt !== row.updatedAt) return;

  const tg = api(env);
  const file = new InputFile(png, `${h.slug}.png`);
  let fileId: string | undefined;
  let photoMessageId = row.previewPhotoMessageId;
  if (row.previewChatId && row.previewPhotoMessageId) {
    const edited = await tg
      .editMessageMedia(row.previewChatId, row.previewPhotoMessageId, {
        type: "photo",
        media: file,
        caption: posterCaption(h),
      })
      .catch((err) => {
        console.error("editMessageMedia failed; sending a new photo", err);
        return null;
      });
    if (edited && edited !== true) fileId = edited.photo?.at(-1)?.file_id;
    else photoMessageId = null;
  }
  if (!fileId && row.previewChatId) {
    const sent = await tg.sendPhoto(row.previewChatId, new InputFile(png, `${h.slug}.png`), {
      caption: posterCaption(h),
      reply_parameters: row.previewTextMessageId
        ? { message_id: row.previewTextMessageId, allow_sending_without_reply: true }
        : undefined,
    });
    fileId = sent.photo.at(-1)?.file_id;
    photoMessageId = sent.message_id;
  }
  await updateHackathon(d, id, {
    posterFileId: fileId ?? null,
    posterStatus: fileId ? "ready" : "failed",
    previewPhotoMessageId: photoMessageId,
  });
}

/** The WhatsApp post (and poster) sent after publishing, or on request. */
export async function sendWhatsAppPackage(env: Env, d: DB, id: string, chatId: number): Promise<void> {
  const h = await getHackathon(d, id);
  if (!h) return;
  const tg = api(env);
  const row = await getHackathonRow(d, id);
  if (h.posterFileId && row?.posterStatus === "ready") {
    await tg.sendPhoto(chatId, h.posterFileId, {
      caption: "Poster for WhatsApp (save it, then post it with the text below)",
    });
  } else {
    await tg.sendMessage(
      chatId,
      "The poster is still being made. It'll appear under the preview; save it from there.",
    );
  }
  await tg.sendMessage(chatId, whatsappText(h, { siteUrl: env.SITE_URL, groupUrl: env.GROUP_URL }), {
    link_preview_options: { is_disabled: true },
  });
}
