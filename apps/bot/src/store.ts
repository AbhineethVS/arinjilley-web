import { type Hackathon, slugify } from "@arinjilley/core";
import {
  type AdminStateRow,
  adminState,
  hackathons,
  type InboxBatchRow,
  inboxBatches,
  type ListingFields,
  listingToColumns,
  type NewHackathonRow,
  rowToHackathon,
} from "@arinjilley/core/db";
import { and, desc, eq, inArray, like, lte, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export type DB = ReturnType<typeof db>;
export const db = (env: Env) => drizzle(env.DB);

/** Short random id, e.g. "k3x9q2m7a1bz" (fits in Telegram callback data). */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-3);
}

// ── Hackathons ──

export async function getHackathon(d: DB, id: string): Promise<Hackathon | null> {
  const row = await d.select().from(hackathons).where(eq(hackathons.id, id)).get();
  return row ? rowToHackathon(row) : null;
}

export async function getHackathonRow(d: DB, id: string) {
  return d.select().from(hackathons).where(eq(hackathons.id, id)).get();
}

/** A unique slug for a title: "colossus-3-0", then "colossus-3-0-2", … */
async function uniqueSlug(d: DB, title: string, exceptId?: string): Promise<string> {
  const base = slugify(title);
  const rows = await d
    .select({ slug: hackathons.slug, id: hackathons.id })
    .from(hackathons)
    .where(or(eq(hackathons.slug, base), like(hackathons.slug, `${base}-%`)))
    .all();
  const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function createDraft(
  d: DB,
  input: {
    fields: ListingFields;
    createdBy: number;
    sourceText: string;
    extractedBy: NonNullable<NewHackathonRow["extractedBy"]>;
    posterKind: "generated" | "custom";
    posterFileId: string | null;
  },
): Promise<Hackathon> {
  const id = newId();
  const now = Date.now();
  await d.insert(hackathons).values({
    ...listingToColumns(input.fields),
    id,
    slug: await uniqueSlug(d, input.fields.title),
    title: input.fields.title,
    status: "draft",
    posterKind: input.posterKind,
    posterFileId: input.posterFileId,
    posterStyle: Math.floor(Math.random() * 24),
    posterStatus: input.posterKind === "custom" ? "ready" : "pending",
    extractedBy: input.extractedBy,
    sourceText: input.sourceText,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return (await getHackathon(d, id))!;
}

export async function updateHackathon(d: DB, id: string, values: Partial<NewHackathonRow>) {
  if ("title" in values && values.title) {
    const row = await getHackathonRow(d, id);
    // Keep the slug stable once live (shared links must keep working); drafts follow the title.
    if (row && row.status === "draft") values = { ...values, slug: await uniqueSlug(d, values.title, id) };
  }
  await d
    .update(hackathons)
    .set({ ...values, updatedAt: Date.now() })
    .where(eq(hackathons.id, id));
}

export async function updateFields(d: DB, id: string, fields: Partial<ListingFields>) {
  await updateHackathon(d, id, listingToColumns(fields));
}

/** Existing (non-discarded) listing with the same registration link, if any. */
export async function findByUrls(d: DB, urls: string[]): Promise<Hackathon | null> {
  if (!urls.length) return null;
  const variants = urls.flatMap((u) => [u, u.replace(/\/+$/, ""), `${u.replace(/\/+$/, "")}/`]);
  const row = await d
    .select()
    .from(hackathons)
    .where(and(inArray(hackathons.registerUrl, variants), ne(hackathons.status, "discarded")))
    .get();
  return row ? rowToHackathon(row) : null;
}

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
