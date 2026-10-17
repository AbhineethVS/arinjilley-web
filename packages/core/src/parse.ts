// Parsers for values an admin types when editing a field in the bot.
import { DAY, type DateField, istParts, parseIst } from "./time";

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "Oct", "october", "Sept." → month index, or undefined. Rejects non-month words like "octopus". */
function monthOf(word: string): number | undefined {
  const w = word.toLowerCase().replace(/\.$/, "");
  const full = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const i = full.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
  return i >= 0 ? i : MONTH_INDEX[w];
}

/** Words that clear a field. */
export const CLEAR_WORDS = /^\s*(none|no|null|clear|remove|-|—|tba|rolling|n\/a)\s*$/i;

function parseTime(s: string): { h: number; m: number } | null | undefined {
  const t = s.trim();
  if (!t) return undefined; // no time given
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(t.replace(/\s+/g, " "));
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && !m[2]) return null; // a bare number like "6" is ambiguous
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/**
 * Parses an admin-typed date (IST). Accepts "2026-10-25", "2026-10-25 23:59", "25 Oct", "25 Oct 2026",
 * "25 Oct 11:59 PM", "Oct 25 6pm", "25/10", "25/10/2026 18:00".
 * Without a year, picks the next occurrence on or after `ref` (allowing dates up to 60 days in the past).
 * Returns "clear" for words like "none", or null if it can't be understood.
 */
export function parseDateInput(input: string, ref: number = Date.now()): DateField | "clear" | null {
  const s = input.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (CLEAR_WORDS.test(s)) return "clear";

  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?$/.exec(s);
  if (iso) return parseIst(iso[2] ? `${iso[1]}T${iso[2].padStart(5, "0")}` : iso[1]!);

  let day: number | undefined;
  let month: number | undefined;
  let year: number | undefined;
  let rest = "";

  const dmy = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?(?:\s+(.*))?$/i.exec(s);
  const mdy = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?(?:\s+(.*))?$/i.exec(s);
  const num = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?:\s+(.*))?$/.exec(s);
  if (dmy && monthOf(dmy[2]!) !== undefined) {
    day = Number(dmy[1]);
    month = monthOf(dmy[2]!);
    year = dmy[3] ? Number(dmy[3]) : undefined;
    rest = dmy[4] ?? "";
  } else if (mdy && monthOf(mdy[1]!) !== undefined) {
    month = monthOf(mdy[1]!);
    day = Number(mdy[2]);
    year = mdy[3] ? Number(mdy[3]) : undefined;
    rest = mdy[4] ?? "";
  } else if (num) {
    day = Number(num[1]);
    month = Number(num[2]) - 1;
    year = num[3] ? Number(num[3].length === 2 ? `20${num[3]}` : num[3]) : undefined;
    rest = num[4] ?? "";
  } else {
    return null;
  }
  if (month === undefined || month < 0 || month > 11 || !day) return null;

  const time = parseTime(rest.replace(/^at\s+/i, ""));
  if (time === null) return null;

  const build = (y: number) =>
    parseIst(`${y}-${pad(month! + 1)}-${pad(day!)}${time ? `T${pad(time.h)}:${pad(time.m)}` : ""}`);

  if (year) return build(year);
  const refYear = istParts(ref).year;
  const candidate = build(refYear);
  if (candidate && candidate.at < ref - 60 * DAY) return build(refYear + 1);
  return candidate;
}

/** "solo", "2-4", "2 to 4", "up to 6", "max 5", "1+", "any", "3" → team size bounds. */
export function parseTeamInput(input: string): { min: number | null; max: number | null } | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/members?|people|persons?|per team|team of/g, "")
    .trim();
  if (/^(any|any size|open|clear|none|-)$/.test(s)) return { min: null, max: null };
  if (/^(solo|individual|1)$/.test(s)) return { min: 1, max: 1 };
  let m = /^(\d+)\s*(?:-|–|to)\s*(\d+)$/.exec(s);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a <= b && b <= 50 ? { min: a, max: b } : null;
  }
  m = /^(?:up to|upto|max|maximum|≤)\s*(\d+)$/.exec(s);
  if (m) return { min: null, max: Number(m[1]) };
  m = /^(\d+)\s*\+$/.exec(s);
  if (m) return { min: Number(m[1]), max: null };
  m = /^(?:solo or (?:team|teams)|individual or team)(?: up to (\d+))?$/.exec(s);
  if (m) return { min: 1, max: m[1] ? Number(m[1]) : null };
  m = /^(\d+)$/.exec(s);
  if (m) return { min: Number(m[1]), max: Number(m[1]) };
  return null;
}

/** Comma/newline separated list → trimmed, de-duplicated items. */
export function parseList(input: string, max = 8): string[] {
  const items = input
    .split(/[,\n;•]+/)
    .map((x) => x.replace(/^\s*[-*\d.)]+\s+/, "").trim())
    .filter(Boolean);
  return [...new Set(items)].slice(0, max);
}

/** Accepts a full URL or a bare domain ("colossus3.tech"). Returns null if it isn't a plausible URL. */
export function parseUrlInput(input: string): string | null {
  const s = input.trim();
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}
