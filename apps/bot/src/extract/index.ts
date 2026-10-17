// Extraction entry point: OpenAI first, then a simple rule-based fallback (SPEC §4).
// Every result is validated and normalised here, so a bad AI reply can't produce an invalid listing.
import {
  type DateField,
  type Mode,
  parseDateInput,
  parseIst,
  shortPrize,
  stripEmoji,
} from "@arinjilley/core";
import type { ListingFields } from "@arinjilley/core/db";
import { z } from "zod";
import { extractWithOpenAI, type RawExtraction } from "./openai";
import type { PageInfo } from "./page";

export interface Extraction {
  isHackathon: boolean;
  reason: string | null;
  fields: ListingFields;
  source: "openai" | "rules";
  warnings: string[];
}

const nullableText = z
  .string()
  .nullable()
  .transform((s) => {
    const t = s ? stripEmoji(s).trim() : "";
    return t ? t : null;
  });

const RawSchema = z.object({
  is_hackathon: z.boolean(),
  not_hackathon_reason: z.string().nullable(),
  title: nullableText,
  organiser: nullableText,
  summary: nullableText,
  how_it_works: z.array(z.string()).transform((a) =>
    a
      .map((s) => stripEmoji(s))
      .filter(Boolean)
      .slice(0, 4),
  ),
  mode: z.enum(["online", "offline", "hybrid"]),
  city: nullableText,
  venue: nullableText,
  registration_deadline: z.string().nullable(),
  event_start: z.string().nullable(),
  event_end: z.string().nullable(),
  team_min: z.number().int().min(1).max(50).nullable().catch(null),
  team_max: z.number().int().min(1).max(50).nullable().catch(null),
  eligibility: nullableText,
  fee_text: nullableText,
  is_free: z.boolean(),
  prize_text: nullableText,
  prize_short: nullableText,
  themes: z
    .array(z.string())
    .transform((a) => [...new Set(a.map((s) => stripEmoji(s)).filter(Boolean))].slice(0, 5)),
  register_url: z.string().nullable(),
  more_info_url: z.string().nullable(),
});

/** Only accept links that actually appeared in the post or the page (the AI must not invent URLs). */
function pickUrl(url: string | null, allowed: string[]): string | null {
  if (!url) return null;
  const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  return allowed.find((a) => norm(a) === norm(url)) ?? null;
}

function normalise(
  raw: RawExtraction,
  urls: string[],
  sentAt: number,
): { fields: ListingFields; warnings: string[] } {
  const r = RawSchema.parse(raw);
  const warnings: string[] = [];
  const date = (s: string | null, label: string): DateField | null => {
    if (!s) return null;
    const d = parseIst(s);
    if (!d) warnings.push(`Couldn't read the ${label} ("${s}"), please set it.`);
    return d;
  };
  const deadline = date(r.registration_deadline, "deadline");
  let start = date(r.event_start, "start date");
  let end = date(r.event_end, "end date");
  if (start && end && end.at < start.at) [start, end] = [end, start];
  if (deadline && deadline.at < sentAt - 2 * 86_400_000)
    warnings.push("The deadline looks like it's in the past. Check it.");

  let teamMin = r.team_min;
  let teamMax = r.team_max;
  if (teamMin != null && teamMax != null && teamMin > teamMax) [teamMin, teamMax] = [teamMax, teamMin];

  const registerUrl = pickUrl(r.register_url, urls) ?? urls[0] ?? null;
  if (!registerUrl) warnings.push("No registration link found.");
  const prizeShort = r.prize_short && r.prize_short.length <= 8 ? r.prize_short : shortPrize(r.prize_text);

  return {
    fields: {
      title: r.title ?? "Untitled hackathon",
      organiser: r.organiser,
      summary: r.summary,
      howItWorks: r.how_it_works,
      mode: r.mode,
      city: r.mode === "online" ? null : r.city,
      venue:
        r.venue && /to be announced|\btba\b|\btbd\b|after selection|shared later/i.test(r.venue)
          ? null
          : r.venue,
      deadline,
      start,
      end,
      teamMin,
      teamMax,
      eligibility: r.eligibility,
      feeText: r.fee_text,
      isFree: r.is_free,
      prizeText: r.prize_text,
      prizeShort,
      themes: r.themes,
      registerUrl,
      moreInfoUrl: pickUrl(r.more_info_url, urls),
      brochureUrl: null,
    },
    warnings,
  };
}

/** Very simple fallback when the AI is unavailable: fills what it safely can and leaves the rest for editing. */
export function extractWithRules(text: string, urls: string[], sentAt: number): Extraction {
  const lines = text
    .split("\n")
    .map((l) => stripEmoji(l).trim())
    .filter(Boolean);
  const titleLine = lines.find((l) => !/^https?:\/\//.test(l)) ?? "Untitled hackathon";
  const title = titleLine.split(/\s[|–-]\s/)[0]!.slice(0, 80);
  const lower = text.toLowerCase();
  const mode: Mode =
    /\bhybrid\b/.test(lower) ||
    (/\bonline\b/.test(lower) && /\b(offline|on campus|finale|venue)\b/.test(lower))
      ? "hybrid"
      : /\bonline\b|\bvirtual\b|\bremote\b/.test(lower)
        ? "online"
        : "offline";

  let deadline: DateField | null = null;
  const deadlineLine = lines.find((l) =>
    /deadline|closes|last date|register by|apply by|submissions? close/i.test(l),
  );
  const dateToken = deadlineLine?.match(/\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}(?:\s+\d{4})?/)?.[0];
  if (dateToken) {
    const d = parseDateInput(dateToken, sentAt);
    if (d && d !== "clear") deadline = d;
  }

  return {
    isHackathon: true,
    reason: null,
    source: "rules",
    warnings: ["The AI was unavailable, so I filled in only the basics. Please check every field."],
    fields: {
      title,
      organiser: null,
      summary: null,
      howItWorks: [],
      mode,
      city: null,
      venue: null,
      deadline,
      start: null,
      end: null,
      teamMin: null,
      teamMax: null,
      eligibility: null,
      feeText: /\bfree\b/.test(lower) ? "Free" : null,
      isFree: /\bfree\b/.test(lower),
      prizeText: null,
      prizeShort: shortPrize(text),
      themes: [],
      registerUrl: urls[0] ?? null,
      moreInfoUrl: null,
      brochureUrl: null,
    },
  };
}

export async function extractListing(
  env: Env,
  input: { text: string; urls: string[]; sentAt: number; page: PageInfo | null },
): Promise<Extraction> {
  const allUrls =
    input.page && !input.urls.includes(input.page.url) ? [...input.urls, input.page.url] : input.urls;
  try {
    const raw = await extractWithOpenAI(env, { ...input, urls: allUrls });
    const { fields, warnings } = normalise(raw, allUrls, input.sentAt);
    return {
      isHackathon: raw.is_hackathon,
      reason: raw.not_hackathon_reason,
      fields,
      source: "openai",
      warnings,
    };
  } catch (err) {
    console.error("OpenAI extraction failed, using rules", err);
    return extractWithRules(input.text, input.urls, input.sentAt);
  }
}
