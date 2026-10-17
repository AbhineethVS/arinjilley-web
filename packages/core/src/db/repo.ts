// Listing reads and writes shared by the bot and the admin page.
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { slugify } from "../format";
import type { Hackathon } from "../types";
import { type ListingFields, listingToColumns, rowToHackathon } from "./map";
import { hackathons, type NewHackathonRow } from "./schema";

export type DB = DrizzleD1Database;

/** Short random id, e.g. "k3x9q2m7a1bz" (fits in Telegram callback data). */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-3);
}

export async function getHackathon(d: DB, id: string): Promise<Hackathon | null> {
  const row = await d.select().from(hackathons).where(eq(hackathons.id, id)).get();
  return row ? rowToHackathon(row) : null;
}

export async function getHackathonRow(d: DB, id: string) {
  return d.select().from(hackathons).where(eq(hackathons.id, id)).get();
}

/** A unique slug for a title: "colossus-3-0", then "colossus-3-0-2", … */
export async function uniqueSlug(d: DB, title: string, exceptId?: string): Promise<string> {
  const base = slugify(title);
  // `base` itself and every "base-…" slug, as an alphabetical range ("." sorts right after "-"). Not LIKE:
  // D1 rejects LIKE patterns over 50 bytes, which long titles exceed.
  const rows = await d
    .select({ slug: hackathons.slug, id: hackathons.id })
    .from(hackathons)
    .where(and(gte(hackathons.slug, base), lt(hackathons.slug, `${base}.`)))
    .all();
  const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export interface NewListing {
  fields: ListingFields;
  createdBy: number;
  sourceText: string | null;
  extractedBy: NonNullable<NewHackathonRow["extractedBy"]>;
  posterKind: "generated" | "custom";
  posterFileId: string | null;
  posterThumbFileId: string | null;
  posterStyle?: number;
  status?: "draft" | "live";
  /** Where the bot should send the rendered poster (the admin's own chat). */
  previewChatId?: number | null;
}

export async function createListing(d: DB, input: NewListing): Promise<Hackathon> {
  const id = newId();
  const now = Date.now();
  const status = input.status ?? "draft";
  await d.insert(hackathons).values({
    ...listingToColumns(input.fields),
    id,
    slug: await uniqueSlug(d, input.fields.title),
    title: input.fields.title,
    status,
    posterKind: input.posterKind,
    posterFileId: input.posterFileId,
    posterThumbFileId: input.posterThumbFileId,
    posterStyle: input.posterStyle ?? Math.floor(Math.random() * 24),
    posterStatus: input.posterKind === "custom" ? "ready" : "pending",
    previewChatId: input.previewChatId ?? null,
    extractedBy: input.extractedBy,
    sourceText: input.sourceText,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === "live" ? now : null,
  });
  return (await getHackathon(d, id))!;
}

export async function updateHackathon(d: DB, id: string, values: Partial<NewHackathonRow>) {
  if ("title" in values && values.title) {
    const row = await getHackathonRow(d, id);
    // Keep the slug stable once live (shared links must keep working); drafts follow the title.
    if (row && row.status === "draft" && !row.publishedAt) {
      values = { ...values, slug: await uniqueSlug(d, values.title, id) };
    }
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
export async function findByUrls(d: DB, urls: string[], exceptId?: string): Promise<Hackathon | null> {
  if (!urls.length) return null;
  const variants = urls.flatMap((u) => [u, u.replace(/\/+$/, ""), `${u.replace(/\/+$/, "")}/`]);
  const rows = await d
    .select()
    .from(hackathons)
    .where(and(inArray(hackathons.registerUrl, variants), ne(hackathons.status, "discarded")))
    .all();
  const row = rows.find((r) => r.id !== exceptId);
  return row ? rowToHackathon(row) : null;
}
