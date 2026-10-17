// Tells the owner on Telegram when something breaks, instead of failing silently. Shared by the bot and the
// website. The same kind of problem (same key) alerts at most once an hour; repeats are counted and mentioned.
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { alerts } from "./db/schema";

const QUIET_MS = 60 * 60_000;

export interface AlertTarget {
  TELEGRAM_BOT_TOKEN: string;
  OWNER_TELEGRAM_ID: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Never throws: an alert failing must not break the thing that was already failing. */
export async function alertOwner(
  env: AlertTarget,
  d: DrizzleD1Database,
  key: string,
  title: string,
  details?: string,
): Promise<void> {
  try {
    const now = Date.now();
    const row = await d.select().from(alerts).where(eq(alerts.key, key)).get();
    if (row && now - row.lastSentAt < QUIET_MS) {
      await d
        .update(alerts)
        .set({ suppressed: row.suppressed + 1 })
        .where(eq(alerts.key, key));
      return;
    }
    const repeats = row?.suppressed
      ? `\n<i>(+${row.suppressed} more like this since the last alert)</i>`
      : "";
    const text = `⚠️ <b>${esc(title)}</b>${details ? `\n\n<code>${esc(details.slice(0, 900))}</code>` : ""}${repeats}`;
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: Number(env.OWNER_TELEGRAM_ID), text, parse_mode: "HTML" }),
    });
    if (!res.ok) console.error("alert not delivered", res.status, await res.text().catch(() => ""));
    await d
      .insert(alerts)
      .values({ key, lastSentAt: now, suppressed: 0 })
      .onConflictDoUpdate({ target: alerts.key, set: { lastSentAt: now, suppressed: 0 } });
  } catch (err) {
    console.error("alertOwner failed", err);
  }
}

export const errorText = (err: unknown) =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);
