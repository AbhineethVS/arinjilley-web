// AI rate limits and usage tracking, so the club's OpenAI credit can't be burned by accident.
// Limits are settings in wrangler.jsonc; the monthly budget set in the OpenAI dashboard is the final safety net.

import { and, count, eq, gte, min, sum } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { aiCalls } from "../db/schema";
import type { AiUsage } from "../extract/openai";
import { countdown, DAY, HOUR } from "../time";
import type { AiSettings } from "./settings";

type DB = DrizzleD1Database;

export interface Limits {
  perAdminPerHour: number;
  perDay: number;
}

export const limits = (env: AiSettings): Limits => ({
  perAdminPerHour: Number(env.AI_LIMIT_PER_ADMIN_PER_HOUR) || 15,
  perDay: Number(env.AI_LIMIT_PER_DAY) || 60,
});

export type LimitCheck = { ok: true } | { ok: false; message: string };

/** Rolling windows: at most N calls per admin in the last hour, and M calls overall in the last 24 hours. */
export async function checkAiLimit(
  env: AiSettings,
  d: DB,
  adminId: number,
  now = Date.now(),
): Promise<LimitCheck> {
  const l = limits(env);
  const mine = await d
    .select({ n: count(), oldest: min(aiCalls.createdAt) })
    .from(aiCalls)
    .where(and(eq(aiCalls.adminId, adminId), gte(aiCalls.createdAt, now - HOUR)))
    .get();
  if ((mine?.n ?? 0) >= l.perAdminPerHour) {
    const wait = (mine?.oldest ?? now) + HOUR - now;
    return {
      ok: false,
      message: `You've used the AI ${l.perAdminPerHour} times in the last hour (the limit). It frees up again in about ${countdown(wait)}.`,
    };
  }
  const all = await d
    .select({ n: count(), oldest: min(aiCalls.createdAt) })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, now - DAY))
    .get();
  if ((all?.n ?? 0) >= l.perDay) {
    const wait = (all?.oldest ?? now) + DAY - now;
    return {
      ok: false,
      message: `The club has used the AI ${l.perDay} times in the last 24 hours (the daily limit). It frees up again in about ${countdown(wait)}.`,
    };
  }
  return { ok: true };
}

export async function recordAiCall(env: AiSettings, d: DB, adminId: number, ok: boolean, usage: AiUsage) {
  await d.insert(aiCalls).values({
    adminId,
    model: env.OPENAI_MODEL,
    ok,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    createdAt: Date.now(),
  });
}

/** Estimated cost in USD from token counts (prices are settings; check OpenAI's dashboard for exact billing). */
export function estimateUsd(env: AiSettings, promptTokens: number, completionTokens: number): number {
  const inPrice = Number(env.AI_PRICE_INPUT_PER_M) || 0;
  const outPrice = Number(env.AI_PRICE_OUTPUT_PER_M) || 0;
  return (promptTokens * inPrice + completionTokens * outPrice) / 1_000_000;
}

async function totals(d: DB, since: number) {
  const r = await d
    .select({
      calls: count(),
      prompt: sum(aiCalls.promptTokens),
      completion: sum(aiCalls.completionTokens),
    })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, since))
    .get();
  return { calls: r?.calls ?? 0, prompt: Number(r?.prompt ?? 0), completion: Number(r?.completion ?? 0) };
}

export async function usageReport(env: AiSettings, d: DB, now = Date.now()): Promise<string> {
  const l = limits(env);
  const rows = [
    ["Last 24 hours", await totals(d, now - DAY)],
    ["Last 7 days", await totals(d, now - 7 * DAY)],
    ["Last 30 days", await totals(d, now - 30 * DAY)],
  ] as const;
  const fmt = (t: { calls: number; prompt: number; completion: number }) =>
    `${t.calls} calls · ${(t.prompt + t.completion).toLocaleString("en-IN")} tokens · ~$${estimateUsd(env, t.prompt, t.completion).toFixed(3)}`;
  return [
    "<b>AI usage</b>",
    ...rows.map(([label, t]) => `${label}: ${fmt(t)}`),
    "",
    `<b>Limits</b>: ${l.perAdminPerHour} per admin per hour · ${l.perDay} per day for everyone`,
    `Model: <code>${env.OPENAI_MODEL}</code>`,
    "",
    "<i>Costs are estimates from token counts. The exact bill is on platform.openai.com → Usage.</i>",
  ].join("\n");
}
