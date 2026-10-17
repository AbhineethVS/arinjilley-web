// Converts between database rows (flat columns, epoch ms) and the app's Hackathon shape (DateField objects).
import type { DateField } from "../time";
import type { Hackathon } from "../types";
import type { HackathonRow, NewHackathonRow } from "./schema";

const field = (at: number | null, dateOnly: boolean): DateField | null =>
  at == null ? null : { at, dateOnly };

export function rowToHackathon(r: HackathonRow): Hackathon {
  return {
    id: r.id,
    slug: r.slug,
    status: r.status,
    title: r.title,
    organiser: r.organiser,
    summary: r.summary,
    howItWorks: r.howItWorks ?? [],
    mode: r.mode,
    city: r.city,
    venue: r.venue,
    deadline: field(r.deadlineAt, r.deadlineDateOnly),
    start: field(r.startAt, r.startDateOnly),
    end: field(r.endAt, r.endDateOnly),
    teamMin: r.teamMin,
    teamMax: r.teamMax,
    eligibility: r.eligibility,
    feeText: r.feeText,
    isFree: r.isFree,
    prizeText: r.prizeText,
    prizeShort: r.prizeShort,
    themes: r.themes ?? [],
    registerUrl: r.registerUrl,
    moreInfoUrl: r.moreInfoUrl,
    brochureUrl: r.brochureUrl,
    posterKind: r.posterKind,
    posterStyle: r.posterStyle,
    posterFileId: r.posterFileId,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    publishedAt: r.publishedAt,
  };
}

/** Listing fields an admin or the AI can set (everything except ids, status and bookkeeping). */
export type ListingFields = Omit<
  Hackathon,
  | "id"
  | "slug"
  | "status"
  | "posterKind"
  | "posterStyle"
  | "posterFileId"
  | "createdBy"
  | "createdAt"
  | "updatedAt"
  | "publishedAt"
>;

/** Converts (partial) listing fields to column values for an insert or update. */
export function listingToColumns(f: Partial<ListingFields>): Partial<NewHackathonRow> {
  const out: Partial<NewHackathonRow> = {};
  const set = <K extends keyof NewHackathonRow>(k: K, v: NewHackathonRow[K]) => {
    out[k] = v;
  };
  if ("title" in f) set("title", f.title!);
  if ("organiser" in f) set("organiser", f.organiser ?? null);
  if ("summary" in f) set("summary", f.summary ?? null);
  if ("howItWorks" in f) set("howItWorks", f.howItWorks ?? []);
  if ("mode" in f) set("mode", f.mode!);
  if ("city" in f) set("city", f.city ?? null);
  if ("venue" in f) set("venue", f.venue ?? null);
  if ("deadline" in f) {
    set("deadlineAt", f.deadline?.at ?? null);
    set("deadlineDateOnly", f.deadline?.dateOnly ?? false);
  }
  if ("start" in f) {
    set("startAt", f.start?.at ?? null);
    set("startDateOnly", f.start?.dateOnly ?? false);
  }
  if ("end" in f) {
    set("endAt", f.end?.at ?? null);
    set("endDateOnly", f.end?.dateOnly ?? false);
  }
  if ("teamMin" in f) set("teamMin", f.teamMin ?? null);
  if ("teamMax" in f) set("teamMax", f.teamMax ?? null);
  if ("eligibility" in f) set("eligibility", f.eligibility ?? null);
  if ("feeText" in f) set("feeText", f.feeText ?? null);
  if ("isFree" in f) set("isFree", f.isFree ?? false);
  if ("prizeText" in f) set("prizeText", f.prizeText ?? null);
  if ("prizeShort" in f) set("prizeShort", f.prizeShort ?? null);
  if ("themes" in f) set("themes", f.themes ?? []);
  if ("registerUrl" in f) set("registerUrl", f.registerUrl ?? null);
  if ("moreInfoUrl" in f) set("moreInfoUrl", f.moreInfoUrl ?? null);
  if ("brochureUrl" in f) set("brochureUrl", f.brochureUrl ?? null);
  return out;
}
