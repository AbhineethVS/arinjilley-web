import { hackathons, rowToHackathon } from "@arinjilley/core/db";
import { and, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { imageUrl, isKerala, type WebListing } from "../shared/listing";

type Row = typeof hackathons.$inferSelect;

function toWeb(row: Row): WebListing {
  const h = rowToHackathon(row);
  // A generated poster only counts once it's rendered; until then the site draws it from the listing data.
  const fileReady = row.posterStatus === "ready" ? row.posterFileId : null;
  return {
    slug: h.slug,
    title: h.title,
    organiser: h.organiser,
    summary: h.summary,
    howItWorks: h.howItWorks,
    mode: h.mode,
    city: h.city,
    venue: h.venue,
    deadline: h.deadline,
    start: h.start,
    end: h.end,
    teamMin: h.teamMin,
    teamMax: h.teamMax,
    eligibility: h.eligibility,
    feeText: h.feeText,
    isFree: h.isFree,
    prizeText: h.prizeText,
    prizeShort: h.prizeShort,
    themes: h.themes,
    registerUrl: h.registerUrl,
    posterKind: h.posterKind,
    posterStyle: h.posterStyle,
    posterUrl: imageUrl(fileReady),
    thumbUrl: imageUrl(row.posterStatus === "ready" ? (row.posterThumbFileId ?? row.posterFileId) : null),
    kerala: isKerala(h),
  };
}

export async function liveListings(env: Env): Promise<WebListing[]> {
  const rows = await drizzle(env.DB).select().from(hackathons).where(eq(hackathons.status, "live")).all();
  return rows.map(toWeb);
}

export async function liveListingBySlug(env: Env, slug: string): Promise<WebListing | null> {
  const row = await drizzle(env.DB)
    .select()
    .from(hackathons)
    .where(and(eq(hackathons.slug, slug), eq(hackathons.status, "live")))
    .get();
  return row ? toWeb(row) : null;
}

/** Only images that belong to a live listing can be fetched through /img (so it isn't an open proxy). */
export async function isPublicImage(env: Env, fileId: string): Promise<boolean> {
  const row = await drizzle(env.DB)
    .select({ id: hackathons.id })
    .from(hackathons)
    .where(
      and(
        eq(hackathons.status, "live"),
        or(eq(hackathons.posterFileId, fileId), eq(hackathons.posterThumbFileId, fileId)),
      ),
    )
    .get();
  return !!row;
}
