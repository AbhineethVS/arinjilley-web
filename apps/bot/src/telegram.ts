import { Api } from "grammy";

let cached: { token: string; api: Api } | null = null;

/** Telegram API client for use outside a message handler (background jobs, cron). */
export function api(env: Env): Api {
  if (!cached || cached.token !== env.TELEGRAM_BOT_TOKEN) {
    cached = { token: env.TELEGRAM_BOT_TOKEN, api: new Api(env.TELEGRAM_BOT_TOKEN) };
  }
  return cached.api;
}

/** Telegram keeps several sizes of every photo: the largest for posting, a ~320px one for website thumbnails. */
export function photoIds(
  sizes: { file_id: string; width: number }[] | undefined,
): { full: string; thumb: string } | null {
  if (!sizes?.length) return null;
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  const full = sorted.at(-1)!.file_id;
  const thumb = (sorted.find((s) => s.width >= 320) ?? sorted.at(-1)!).file_id;
  return { full, thumb };
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram complains when you "edit" a message to identical content; that's harmless, so ignore it. */
export function ignoreNotModified(err: unknown): void {
  if (err instanceof Error && /message is not modified/i.test(err.message)) return;
  throw err;
}
