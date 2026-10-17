import { admins } from "@arinjilley/core/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Bot, type Context } from "grammy";

export type Role = "owner" | "admin" | null;
export interface BotContext extends Context {
  role: Role;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Commands in the owner's Telegram menu (everyone else gets the default menu set by set-webhook.mjs). */
const OWNER_COMMANDS = [
  { command: "start", description: "Start / what this bot does" },
  { command: "help", description: "What I can do" },
  { command: "whoami", description: "Show your Telegram ID and role" },
  { command: "admins", description: "List admins" },
  { command: "addadmin", description: "Add an admin: /addadmin <id> [name]" },
  { command: "removeadmin", description: "Remove an admin: /removeadmin <id>" },
];

export function createBot(env: Env): Bot<BotContext> {
  const db = drizzle(env.DB);
  const ownerId = Number(env.OWNER_TELEGRAM_ID);
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

  // Private chats only, and work out who is talking.
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== "private") return;
    const id = ctx.from?.id;
    if (!id) return;
    if (id === ownerId) ctx.role = "owner";
    else {
      const row = await db
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
      "<b>What I can do right now</b>",
      "/whoami: your Telegram ID and role",
      ...(role === "owner"
        ? [
            "",
            "<b>Owner only</b>",
            "/admins: list admins",
            "/addadmin &lt;id&gt; [name]: add an admin",
            "/removeadmin &lt;id&gt;: remove an admin",
          ]
        : []),
      "",
      "<b>Coming next</b>",
      "Send me a hackathon (text, link or poster) and I'll turn it into a listing with a poster and a ready-to-paste WhatsApp post.",
    ].join("\n");

  bot.command("start", async (ctx) => {
    const name = esc(ctx.from!.first_name);
    // The owner's command menu includes admin management. Telegram only allows a per-chat menu once the
    // person has messaged the bot, so it's set here rather than by scripts/set-webhook.mjs.
    if (ctx.role === "owner") {
      await ctx.api
        .setMyCommands(OWNER_COMMANDS, { scope: { type: "chat", chat_id: ctx.chat.id } })
        .catch((err) => console.error("setMyCommands failed", err));
    }
    await ctx.reply(
      `Hi ${name}! You're ${ctx.role === "owner" ? "the <b>owner</b>" : "an <b>admin</b>"} of arinjilley?.\n\n${helpText(ctx.role)}`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("help", (ctx) => ctx.reply(helpText(ctx.role), { parse_mode: "HTML" }));

  bot.command("whoami", (ctx) =>
    ctx.reply(`Your Telegram ID: <code>${ctx.from!.id}</code>\nRole: <b>${ctx.role}</b>`, {
      parse_mode: "HTML",
    }),
  );

  // ── Owner-only admin management ──
  const ownerOnly = bot.filter((ctx) => ctx.role === "owner");
  bot.command(["admins", "addadmin", "removeadmin"], async (ctx, next) => {
    if (ctx.role !== "owner") return ctx.reply("Only the owner can manage admins.");
    return next();
  });

  ownerOnly.command("admins", async (ctx) => {
    const rows = await db.select().from(admins).all();
    const lines = [
      `<b>Owner</b>: <code>${ownerId}</code>`,
      "",
      rows.length ? "<b>Admins</b>" : "No other admins yet. Add one with /addadmin &lt;id&gt; [name]",
      ...rows.map((r) => `• ${esc(r.name ?? "(no name)")}: <code>${r.telegramId}</code>`),
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  ownerOnly.command("addadmin", async (ctx) => {
    const [idText, ...nameParts] = ctx.match.trim().split(/\s+/);
    const id = Number(idText);
    if (!idText || !/^\d{5,15}$/.test(idText) || !Number.isSafeInteger(id)) {
      return ctx.reply(
        "Usage: /addadmin <id> [name]\nAsk them to message this bot first; it will show them their ID.",
      );
    }
    if (id === ownerId) return ctx.reply("That's you, the owner. You already have full access.");
    const name = nameParts.join(" ").slice(0, 60) || null;
    await db
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

  ownerOnly.command("removeadmin", async (ctx) => {
    const id = Number(ctx.match.trim());
    if (!Number.isSafeInteger(id) || id <= 0) return ctx.reply("Usage: /removeadmin <id>");
    if (id === ownerId) return ctx.reply("The owner can't be removed.");
    const removed = await db.delete(admins).where(eq(admins.telegramId, id)).returning().get();
    await ctx.reply(
      removed ? `Removed <code>${id}</code> from admins.` : `<code>${id}</code> wasn't an admin.`,
      { parse_mode: "HTML" },
    );
  });

  // Anything else from an admin: placeholder until listing creation lands in step 3.
  bot.on("message", (ctx) =>
    ctx.reply("Got it. Turning messages into listings is coming in the next update. For now, try /help."),
  );

  bot.catch((err) => console.error("bot error", err.error));
  return bot;
}
