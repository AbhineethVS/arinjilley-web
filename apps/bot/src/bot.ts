import { boardStatus, dayMonth, deadlineInstant, type Mode } from "@arinjilley/core";
import { usageReport } from "@arinjilley/core/ai";
import { adminLogins, admins, inboxBatches, rowToHackathon } from "@arinjilley/core/db";
import { POSTER_STYLE_COUNT, shuffleStyle } from "@arinjilley/core/poster";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Bot, type Context, InlineKeyboard } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { editKeyboard, FIELDS, promptFor } from "./edit";
import { kick, QUIET_MS } from "./jobs";
import { mainKeyboard, refreshPreview, sendWhatsAppPackage, showPreview } from "./preview";
import {
  clearState,
  db,
  findByPreviewMessage,
  getBatch,
  getHackathon,
  getState,
  newId,
  openBatchFor,
  recentListings,
  setState,
  updateBatch,
  updateFields,
  updateHackathon,
} from "./store";
import { esc, ignoreNotModified, photoIds } from "./telegram";

export type Role = "owner" | "admin" | null;
export interface BotContext extends Context {
  role: Role;
}

/** Commands in the owner's Telegram menu (everyone else gets the default menu set by set-webhook.mjs). */
const OWNER_COMMANDS = [
  { command: "events", description: "Recent listings (open, edit, publish)" },
  { command: "help", description: "How to use this bot" },
  { command: "cancel", description: "Cancel the current edit" },
  { command: "whoami", description: "Show your Telegram ID and role" },
  { command: "admins", description: "List admins" },
  { command: "addadmin", description: "Add an admin: /addadmin <id> [name]" },
  { command: "removeadmin", description: "Remove an admin: /removeadmin <id>" },
  { command: "usage", description: "AI usage and estimated cost" },
];

/** Messages within this window of each other go into the same batch (one listing). */
const MERGE_WINDOW_MS = 60_000;

export function createBot(env: Env, exec: ExecutionContext, botInfo: UserFromGetMe): Bot<BotContext> {
  const d = db(env);
  const ownerId = Number(env.OWNER_TELEGRAM_ID);
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN, { botInfo });
  const later = (p: Promise<unknown>) =>
    exec.waitUntil(p.catch((err) => console.error("background task failed", err)));

  // Private chats only, and work out who is talking.
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== "private") return;
    const id = ctx.from?.id;
    if (!id) return;
    if (id === ownerId) ctx.role = "owner";
    else {
      const row = await d
        .select({ id: admins.telegramId })
        .from(admins)
        .where(eq(admins.telegramId, id))
        .get();
      ctx.role = row ? "admin" : null;
    }
    await next();
  });

  // Everyone else gets a polite "private bot" message with their ID, so they can ask the owner for access.
  bot.use(async (ctx, next) => {
    if (ctx.role) return next();
    if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: "This bot is private." });
    await ctx.reply(
      [
        "This bot is private to the <b>arinjilley?</b> admins.",
        "",
        `If you're one of them, send this ID to the owner: <code>${ctx.from!.id}</code>`,
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  const helpText = (role: Role) =>
    [
      "<b>Add a hackathon</b>",
      "Send or forward the post here: text, a link, a poster, or all of them one after another. I'll read it, fill in the details and show you a preview with a poster.",
      "Then: <b>Publish</b> to put it on the site (you get the poster and the WhatsApp text back), or <b>Edit</b> anything first.",
      "",
      "<b>Commands</b>",
      "/events: recent listings",
      "/cancel: cancel an edit",
      "/whoami: your Telegram ID and role",
      ...(role === "owner"
        ? [
            "",
            "<b>Owner only</b>",
            "/admins · /addadmin &lt;id&gt; [name] · /removeadmin &lt;id&gt;",
            "/usage: AI usage and estimated cost",
          ]
        : []),
      "",
      "<i>Tip: to use your own poster for a listing, reply to its preview with the image.</i>",
    ].join("\n");

  bot.command("start", async (ctx) => {
    // "Log in with Telegram" on the admin page opens t.me/<bot>?start=login_<id>: approve that login request.
    const payload = ctx.match.trim();
    if (payload.startsWith("login_")) {
      const id = payload.slice("login_".length);
      const approved = await d
        .update(adminLogins)
        .set({ telegramId: ctx.from!.id, approvedAt: Date.now() })
        .where(
          and(
            eq(adminLogins.id, id),
            isNull(adminLogins.approvedAt),
            isNull(adminLogins.usedAt),
            gt(adminLogins.expiresAt, Date.now()),
          ),
        )
        .returning({ id: adminLogins.id })
        .get();
      await ctx.reply(
        approved
          ? "✅ You're logged in to the admin page. Go back to your browser; it'll continue on its own."
          : "That login link has expired or was already used. Go back to the admin page and tap “Log in with Telegram” again.",
      );
      return;
    }
    // The owner's menu includes admin management. Telegram only allows a per-chat menu after the first message.
    if (ctx.role === "owner") {
      await ctx.api
        .setMyCommands(OWNER_COMMANDS, { scope: { type: "chat", chat_id: ctx.chat.id } })
        .catch((err) => console.error("setMyCommands failed", err));
    }
    await ctx.reply(
      `Hi ${esc(ctx.from!.first_name)}! You're ${ctx.role === "owner" ? "the <b>owner</b>" : "an <b>admin</b>"} of arinjilley?.\n\n${helpText(ctx.role)}`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("help", (ctx) => ctx.reply(helpText(ctx.role), { parse_mode: "HTML" }));

  bot.command("whoami", (ctx) =>
    ctx.reply(`Your Telegram ID: <code>${ctx.from!.id}</code>\nRole: <b>${ctx.role}</b>`, {
      parse_mode: "HTML",
    }),
  );

  bot.command("cancel", async (ctx) => {
    const state = await getState(d, ctx.from!.id);
    await clearState(d, ctx.from!.id);
    await ctx.reply(state ? "Cancelled." : "Nothing to cancel.");
  });

  bot.command("usage", async (ctx) => {
    if (ctx.role !== "owner") return ctx.reply("Only the owner can see AI usage.");
    await ctx.reply(await usageReport(env, d), { parse_mode: "HTML" });
  });

  bot.command("events", async (ctx) => {
    const rows = await recentListings(d, 15);
    if (!rows.length) return ctx.reply("No listings yet. Send me a hackathon post to create one.");
    const k = new InlineKeyboard();
    for (const r of rows) {
      const l = rowToHackathon(r);
      const tag = l.status === "draft" ? "📝" : boardStatus(l) === "archived" ? "🗄" : "✅";
      const when = l.deadline ? ` · ${dayMonth(deadlineInstant(l.deadline))}` : "";
      k.text(`${tag} ${l.title.slice(0, 40)}${when}`, `open:${l.id}`).row();
    }
    await ctx.reply("Recent listings (📝 draft · ✅ live · 🗄 archived). Tap one to open it:", {
      reply_markup: k,
    });
  });

  // ── Owner-only admin management ──
  bot.command(["admins", "addadmin", "removeadmin"], async (ctx, next) => {
    if (ctx.role !== "owner") return ctx.reply("Only the owner can manage admins.");
    return next();
  });

  bot.command("admins", async (ctx) => {
    const rows = await d.select().from(admins).all();
    const lines = [
      `<b>Owner</b>: <code>${ownerId}</code>`,
      "",
      rows.length ? "<b>Admins</b>" : "No other admins yet. Add one with /addadmin &lt;id&gt; [name]",
      ...rows.map((r) => `• ${esc(r.name ?? "(no name)")}: <code>${r.telegramId}</code>`),
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("addadmin", async (ctx) => {
    const [idText, ...nameParts] = ctx.match.trim().split(/\s+/);
    const id = Number(idText);
    if (!idText || !/^\d{5,15}$/.test(idText) || !Number.isSafeInteger(id)) {
      return ctx.reply(
        "Usage: /addadmin <id> [name]\nAsk them to message this bot first; it will show them their ID.",
      );
    }
    if (id === ownerId) return ctx.reply("That's you, the owner. You already have full access.");
    const name = nameParts.join(" ").slice(0, 60) || null;
    await d
      .insert(admins)
      .values({ telegramId: id, name, addedBy: ctx.from!.id })
      .onConflictDoUpdate({ target: admins.telegramId, set: { name } });
    let notified = true;
    await ctx.api
      .sendMessage(id, "You've been added as an admin of arinjilley?. Send /start to see what I can do.")
      .catch(() => {
        notified = false;
      });
    await ctx.reply(
      `Added <code>${id}</code>${name ? ` (${esc(name)})` : ""} as an admin.` +
        (notified
          ? " I've let them know."
          : " They haven't messaged the bot yet, so ask them to send /start."),
      { parse_mode: "HTML" },
    );
  });

  bot.command("removeadmin", async (ctx) => {
    const id = Number(ctx.match.trim());
    if (!Number.isSafeInteger(id) || id <= 0) return ctx.reply("Usage: /removeadmin <id>");
    if (id === ownerId) return ctx.reply("The owner can't be removed.");
    const removed = await d.delete(admins).where(eq(admins.telegramId, id)).returning().get();
    await ctx.reply(
      removed ? `Removed <code>${id}</code> from admins.` : `<code>${id}</code> wasn't an admin.`,
      {
        parse_mode: "HTML",
      },
    );
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return ctx.reply("I don't know that command. Try /help.");
    return next();
  });

  // ── Buttons ──
  bot.on("callback_query:data", async (ctx) => {
    const [action, id = "", arg] = ctx.callbackQuery.data.split(":");
    const chatId = ctx.chat!.id;
    const msgId = ctx.callbackQuery.message?.message_id;
    const answer = (text?: string) => ctx.answerCallbackQuery(text ? { text } : undefined).catch(() => {});

    // Batch actions
    if (action === "go" || action === "force" || action === "manual") {
      const batch = await getBatch(d, id);
      if (!batch) return answer("That message is no longer available.");
      if (batch.status === "done" || batch.status === "processing") return answer("Already on it.");
      // "Try again" after a limit, "make it a listing anyway", or "fill it in manually" reopen the batch.
      await updateBatch(d, id, { status: "collecting", ...(action === "force" ? { force: true } : {}) });
      await answer("On it…");
      later(kick(env, { type: "batch", id, now: true, manual: action === "manual" }));
      return;
    }

    const h = await getHackathon(d, id);
    if (!h) return answer("That listing no longer exists.");

    switch (action) {
      case "open":
        await answer();
        await showPreview(env, h, chatId);
        return;
      case "pub": {
        await updateHackathon(d, id, { status: "live", publishedAt: h.publishedAt ?? Date.now() });
        await answer("Published!");
        await refreshPreview(env, id);
        await sendWhatsAppPackage(env, d, id, chatId);
        return;
      }
      case "wa":
        await answer();
        await sendWhatsAppPackage(env, d, id, chatId);
        return;
      case "unp":
        await updateHackathon(d, id, { status: "draft" });
        await answer("Taken off the site. It's a draft again.");
        await refreshPreview(env, id);
        return;
      case "dis":
        await updateHackathon(d, id, { status: "discarded" });
        await answer("Discarded.");
        await refreshPreview(env, id);
        return;
      case "res":
        await updateHackathon(d, id, { status: "draft" });
        await answer("Restored as a draft.");
        await refreshPreview(env, id);
        return;
      case "edit":
        await answer();
        if (msgId)
          await ctx.editMessageReplyMarkup({ reply_markup: editKeyboard(id) }).catch(ignoreNotModified);
        return;
      case "back":
        await answer();
        if (msgId)
          await ctx.editMessageReplyMarkup({ reply_markup: mainKeyboard(h) }).catch(ignoreNotModified);
        return;
      case "ef": {
        if (!arg || !FIELDS[arg]) return answer();
        await answer();
        const prompt = await ctx.reply(promptFor(arg, h), {
          parse_mode: "HTML",
          reply_markup: { force_reply: true, input_field_placeholder: FIELDS[arg]!.label },
        });
        await setState(d, {
          telegramId: ctx.from.id,
          action: "edit_field",
          hackathonId: id,
          field: arg,
          promptMessageId: prompt.message_id,
        });
        return;
      }
      case "mode": {
        if (arg !== "online" && arg !== "offline" && arg !== "hybrid") return answer();
        await updateFields(d, id, { mode: arg as Mode });
        await answer(`Mode: ${arg}`);
        await afterEdit(id, true);
        return;
      }
      case "shuf": {
        await updateHackathon(d, id, {
          posterStyle: shuffleStyle(h.posterStyle % POSTER_STYLE_COUNT),
          posterStatus: "pending",
        });
        await answer("New style coming up (takes ~10 seconds)…");
        later(kick(env, { type: "poster", id }));
        return;
      }
      case "gen": {
        await updateHackathon(d, id, {
          posterKind: "generated",
          posterFileId: null,
          posterThumbFileId: null,
          posterStatus: "pending",
        });
        await answer("Making a generated poster (takes ~10 seconds)…");
        await refreshPreview(env, id);
        later(kick(env, { type: "poster", id }));
        return;
      }
      case "img": {
        await answer();
        const prompt = await ctx.reply("Send the poster image now (as a photo). /cancel to stop.", {
          reply_markup: { force_reply: true },
        });
        await setState(d, {
          telegramId: ctx.from.id,
          action: "await_image",
          hackathonId: id,
          field: null,
          promptMessageId: prompt.message_id,
        });
        return;
      }
      default:
        return answer();
    }
  });

  /** After a field changes: update the card, and re-render the poster if it shows that field. */
  async function afterEdit(id: string, posterChanged: boolean) {
    const h = await getHackathon(d, id);
    if (!h) return;
    if (posterChanged && h.posterKind === "generated") {
      await updateHackathon(d, id, { posterStatus: "pending" });
      later(kick(env, { type: "poster", id }));
    }
    await refreshPreview(env, id);
  }

  // ── Photos: a custom poster for a listing, or part of a new post ──
  bot.on("message:photo", async (ctx) => {
    const photo = photoIds(ctx.message.photo)!;
    const state = await getState(d, ctx.from.id);
    const replyTo = ctx.message.reply_to_message?.message_id;
    const target =
      state?.action === "await_image"
        ? await getHackathon(d, state.hackathonId)
        : replyTo
          ? await findByPreviewMessage(d, ctx.chat.id, replyTo)
          : null;
    if (target) {
      await clearState(d, ctx.from.id);
      await updateHackathon(d, target.id, {
        posterKind: "custom",
        posterFileId: photo.full,
        posterThumbFileId: photo.thumb,
        posterStatus: "ready",
        previewPhotoMessageId: ctx.message.message_id,
      });
      await refreshPreview(env, target.id);
      return ctx.reply(`Using this image as the poster for <b>${esc(target.title)}</b>.`, {
        parse_mode: "HTML",
      });
    }
    await addToInbox(ctx, ctx.message.caption ?? "", photo);
  });

  // ── Text: an edit value, or part of a new post ──
  bot.on("message:text", async (ctx) => {
    const state = await getState(d, ctx.from.id);
    if (state?.action === "edit_field" && state.field && FIELDS[state.field]) {
      const h = await getHackathon(d, state.hackathonId);
      if (!h) {
        await clearState(d, ctx.from.id);
        return ctx.reply("That listing no longer exists.");
      }
      const field = FIELDS[state.field]!;
      const result = field.apply(ctx.message.text, h);
      if ("error" in result)
        return ctx.reply(`${result.error}\n\n<i>Try again, or /cancel.</i>`, { parse_mode: "HTML" });
      try {
        await updateFields(d, h.id, result.fields);
      } catch (err) {
        if (String(err).includes("UNIQUE") && String(err).includes("register_url")) {
          return ctx.reply(
            "Another listing already uses that registration link. Send a different one, or /cancel.",
          );
        }
        throw err;
      }
      await clearState(d, ctx.from.id);
      await ctx.reply(`Updated <b>${field.label}</b>.`, { parse_mode: "HTML" });
      await afterEdit(h.id, field.poster);
      return;
    }
    if (state?.action === "await_image") {
      return ctx.reply("I'm waiting for an image. Send a photo, or /cancel.");
    }
    await addToInbox(ctx, ctx.message.text, null);
  });

  bot.on("message:document", (ctx) =>
    ctx.reply("I can't read files (like PDFs) yet. Paste the post text or the registration link instead."),
  );

  bot.on("message", (ctx) => ctx.reply("Send me a hackathon post (text, link or poster), or /help."));

  /** Adds a message to the admin's current batch (or starts one) and schedules processing after a quiet period. */
  async function addToInbox(ctx: BotContext, text: string, photo: { full: string; thumb: string } | null) {
    const adminId = ctx.from!.id;
    const now = Date.now();
    const open = await openBatchFor(d, adminId, now - MERGE_WINDOW_MS);
    let batchId: string;
    if (open) {
      batchId = open.id;
      await d
        .update(inboxBatches)
        .set({
          text: [open.text, text].filter(Boolean).join("\n\n"),
          photoFileId: photo?.full ?? open.photoFileId,
          photoThumbFileId: photo?.thumb ?? open.photoThumbFileId,
          lastMessageAt: now,
          updatedAt: now,
        })
        .where(and(eq(inboxBatches.id, open.id), eq(inboxBatches.status, "collecting")));
    } else {
      batchId = newId();
      const ack = await ctx.reply(
        "Got it ✓ I'll read this in a few seconds.\n<i>Sending its link or poster too? Send it now and I'll combine them.</i>",
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Read it now", `go:${batchId}`) },
      );
      await d.insert(inboxBatches).values({
        id: batchId,
        adminId,
        chatId: ctx.chat!.id,
        text,
        photoFileId: photo?.full ?? null,
        photoThumbFileId: photo?.thumb ?? null,
        ackMessageId: ack.message_id,
        firstMessageAt: now,
        lastMessageAt: now,
      });
    }
    // Wait for the quiet period, then try to process. Later messages push this back (the claim checks timing).
    later(
      (async () => {
        await new Promise((r) => setTimeout(r, QUIET_MS));
        await kick(env, { type: "batch", id: batchId });
      })(),
    );
  }

  // Only used in long-polling mode; webhook errors are handled (and alerted) in index.ts.
  bot.catch((err) => console.error("bot error", err.error));
  return bot;
}
