import {
  type AdminStateRow,
  adminState,
  hackathons,
  type InboxBatchRow,
  inboxBatches,
  rowToHackathon,
} from "@arinjilley/core/db";
import { and, desc, eq, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export type DB = ReturnType<typeof db>;
export const db = (env: Env) => drizzle(env.DB);

// Listing helpers shared with the admin page live in @arinjilley/core/db (repo.ts).
export {
  createListing,
  findByUrls,
  getHackathon,
  getHackathonRow,
  newId,
  updateFields,
  updateHackathon,
} from "@arinjilley/core/db";

/** Which listing a preview message (text or poster) belongs to, for replies like "reply with a photo". */
export async function findByPreviewMessage(d: DB, chatId: number, messageId: number) {
  const row = await d
    .select()
    .from(hackathons)
    .where(
      and(
        eq(hackathons.previewChatId, chatId),
        or(eq(hackathons.previewTextMessageId, messageId), eq(hackathons.previewPhotoMessageId, messageId)),
      ),
    )
    .get();
  return row ? rowToHackathon(row) : null;
}

export async function recentListings(d: DB, limit = 15) {
  return d
    .select()
    .from(hackathons)
    .where(ne(hackathons.status, "discarded"))
    .orderBy(sql`CASE ${hackathons.status} WHEN 'draft' THEN 0 ELSE 1 END`, desc(hackathons.updatedAt))
    .limit(limit)
    .all();
}

export async function pendingPosters(d: DB, olderThan: number) {
  return d
    .select({ id: hackathons.id })
    .from(hackathons)
    .where(
      and(
        eq(hackathons.posterStatus, "pending"),
        ne(hackathons.status, "discarded"),
        lte(hackathons.updatedAt, olderThan),
      ),
    )
    .limit(5)
    .all();
}

// ── Inbox batches ──

export async function getBatch(d: DB, id: string): Promise<InboxBatchRow | undefined> {
  return d.select().from(inboxBatches).where(eq(inboxBatches.id, id)).get();
}

export async function openBatchFor(d: DB, adminId: number, since: number) {
  return d
    .select()
    .from(inboxBatches)
    .where(
      and(
        eq(inboxBatches.adminId, adminId),
        eq(inboxBatches.status, "collecting"),
        sql`${inboxBatches.lastMessageAt} >= ${since}`,
      ),
    )
    .orderBy(desc(inboxBatches.lastMessageAt))
    .get();
}

/** Atomically moves a batch from collecting to processing. Returns null if someone else claimed it. */
export async function claimBatch(d: DB, id: string, quietSince: number) {
  return d
    .update(inboxBatches)
    .set({ status: "processing", attempts: sql`${inboxBatches.attempts} + 1`, updatedAt: Date.now() })
    .where(
      and(
        eq(inboxBatches.id, id),
        eq(inboxBatches.status, "collecting"),
        lte(inboxBatches.lastMessageAt, quietSince),
      ),
    )
    .returning()
    .get();
}

export async function updateBatch(d: DB, id: string, values: Partial<InboxBatchRow>) {
  await d
    .update(inboxBatches)
    .set({ ...values, updatedAt: Date.now() })
    .where(eq(inboxBatches.id, id));
}

/** Batches that should have been processed already (missed kicks) or got stuck mid-way. */
export async function overdueBatches(d: DB, now: number) {
  return d
    .select()
    .from(inboxBatches)
    .where(
      or(
        and(eq(inboxBatches.status, "collecting"), lte(inboxBatches.lastMessageAt, now - 30_000)),
        and(
          eq(inboxBatches.status, "processing"),
          lte(inboxBatches.updatedAt, now - 120_000),
          sql`${inboxBatches.attempts} < 3`,
        ),
      ),
    )
    .limit(5)
    .all();
}

// ── Admin conversation state ──

export async function getState(d: DB, telegramId: number): Promise<AdminStateRow | undefined> {
  const row = await d.select().from(adminState).where(eq(adminState.telegramId, telegramId)).get();
  // Pending prompts expire after 30 minutes so a stray message later doesn't get treated as an edit.
  if (row && row.updatedAt < Date.now() - 30 * 60_000) {
    await clearState(d, telegramId);
    return undefined;
  }
  return row;
}

export async function setState(d: DB, s: Omit<AdminStateRow, "updatedAt">) {
  await d
    .insert(adminState)
    .values({ ...s, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: adminState.telegramId, set: { ...s, updatedAt: Date.now() } });
}

export async function clearState(d: DB, telegramId: number) {
  await d.delete(adminState).where(eq(adminState.telegramId, telegramId));
}
