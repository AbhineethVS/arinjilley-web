import type { UserFromGetMe } from "grammy/types";
import { createBot } from "./bot";
import { isInternalJobRequest, type Job, runJob, sweep } from "./jobs";
import { api } from "./telegram";

// The bot's own Telegram profile, fetched once per Worker isolate.
let botInfo: { token: string; info: UserFromGetMe } | null = null;
async function getBotInfo(env: Env): Promise<UserFromGetMe> {
  if (!botInfo || botInfo.token !== env.TELEGRAM_BOT_TOKEN) {
    botInfo = { token: env.TELEGRAM_BOT_TOKEN, info: await api(env).getMe() };
  }
  return botInfo.info;
}

/** Constant-time comparison, so the secret can't be guessed from response timing. */
function sameSecret(a: string | null, b: string): boolean {
  if (!a) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}

async function handleTelegram(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const update = await request.json();
  const bot = createBot(env, ctx, await getBotInfo(env));
  try {
    // Handlers only do quick work; slow steps run in the background, so Telegram gets a fast reply.
    await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
  } catch (err) {
    console.error("update failed", err);
  }
  // Always 200: otherwise Telegram keeps re-sending the same update.
  return new Response("ok");
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/telegram" && request.method === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Bot is not configured yet", { status: 503 });
      }
      return handleTelegram(request, env, ctx);
    }

    // Background jobs, started by the Worker itself through the SELF binding (see jobs.ts).
    if (isInternalJobRequest(request, env)) {
      const job = (await request.json()) as Job;
      ctx.waitUntil(runJob(env, job));
      return new Response(null, { status: 202 });
    }

    if (url.pathname === "/") return new Response("arinjilley? bot is running.\n");
    return new Response("Not found\n", { status: 404 });
  },

  async scheduled(_event, env, ctx): Promise<void> {
    await sweep(env, ctx);
  },
} satisfies ExportedHandler<Env>;
