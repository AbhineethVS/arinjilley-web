import { type Bot, webhookCallback } from "grammy";
import { type BotContext, createBot } from "./bot";
import { RenderBusyError, renderPosterPng } from "./render";
import { SAMPLES } from "./samples";

// One bot instance per Worker isolate (grammY fetches the bot's info once, then reuses it).
let cached: { token: string; bot: Bot<BotContext> } | null = null;
function getBot(env: Env): Bot<BotContext> {
  if (!cached || cached.token !== env.TELEGRAM_BOT_TOKEN) {
    cached = { token: env.TELEGRAM_BOT_TOKEN, bot: createBot(env) };
  }
  return cached.bot;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/telegram" && request.method === "POST") {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Bot is not configured yet", { status: 503 });
      }
      // grammY rejects requests without Telegram's secret header, so only Telegram can call this.
      return webhookCallback(getBot(env), "cloudflare-mod", { secretToken: env.TELEGRAM_WEBHOOK_SECRET })(
        request,
      );
    }

    // Temporary route for the step-2 poster CPU check. Disabled by setting ENABLE_TEST_ROUTES to "0".
    if (url.pathname === "/_test/poster" && env.ENABLE_TEST_ROUTES === "1") {
      const sample = SAMPLES[url.searchParams.get("sample") ?? "colossus"] ?? SAMPLES.colossus!;
      const style = url.searchParams.has("style")
        ? Number(url.searchParams.get("style"))
        : sample.posterStyle;
      try {
        const png = await renderPosterPng(env, { ...sample, posterStyle: style });
        return new Response(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
      } catch (err) {
        if (err instanceof RenderBusyError) return new Response(err.message, { status: 429 });
        throw err;
      }
    }

    if (url.pathname === "/") return new Response("arinjilley? bot is running.\n");
    return new Response("Not found\n", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
