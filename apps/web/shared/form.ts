// The admin form's data: what the browser sends when saving, and how listings are turned into form values.
// Dates travel as IST date + time strings ("2026-10-25" + "23:59"), matching <input type="date"/"time">.
import { type DateField, formatIstInput, type Hackathon, type Mode, parseIst } from "@arinjilley/core";

export interface DateParts {
  date: string; // "YYYY-MM-DD" or ""
  time: string; // "HH:MM" or "" (date only)
}

export type PosterChoice =
  | { kind: "generated"; style: number }
  | { kind: "custom"; fileId: string; thumbId: string | null };

export interface ListingForm {
  title: string;
  organiser: string;
  summary: string;
  howItWorks: string; // one step per line
  mode: Mode;
  city: string;
  venue: string;
  deadline: DateParts; // empty date = no fixed deadline
  start: DateParts;
  end: DateParts;
  teamMin: string;
  teamMax: string;
  eligibility: string;
  feeText: string;
  isFree: boolean;
  prizeText: string;
  prizeShort: string;
  themes: string; // comma separated
  registerUrl: string;
  moreInfoUrl: string;
  poster: PosterChoice;
  /** set by "Fill with AI" so the listing records where its data came from */
  extractedBy?: "openai" | "rules" | "manual";
  sourceText?: string;
}

export function toParts(f: DateField | null): DateParts {
  if (!f) return { date: "", time: "" };
  const [date = "", time = ""] = formatIstInput(f).split("T");
  return { date, time };
}

export function fromParts(p: DateParts | undefined): DateField | null {
  if (!p?.date) return null;
  return parseIst(p.time ? `${p.date}T${p.time}` : p.date);
}

type FormSource = Pick<
  Hackathon,
  | "title"
  | "organiser"
  | "summary"
  | "howItWorks"
  | "mode"
  | "city"
  | "venue"
  | "deadline"
  | "start"
  | "end"
  | "teamMin"
  | "teamMax"
  | "eligibility"
  | "feeText"
  | "isFree"
  | "prizeText"
  | "prizeShort"
  | "themes"
  | "registerUrl"
  | "moreInfoUrl"
>;

export function listingToForm(h: FormSource, poster: PosterChoice): ListingForm {
  return {
    title: h.title === "Untitled hackathon" ? "" : h.title,
    organiser: h.organiser ?? "",
    summary: h.summary ?? "",
    howItWorks: h.howItWorks.join("\n"),
    mode: h.mode,
    city: h.city ?? "",
    venue: h.venue ?? "",
    deadline: toParts(h.deadline),
    start: toParts(h.start),
    end: toParts(h.end),
    teamMin: h.teamMin == null ? "" : String(h.teamMin),
    teamMax: h.teamMax == null ? "" : String(h.teamMax),
    eligibility: h.eligibility ?? "",
    feeText: h.feeText ?? "",
    isFree: h.isFree,
    prizeText: h.prizeText ?? "",
    prizeShort: h.prizeShort ?? "",
    themes: h.themes.join(", "),
    registerUrl: h.registerUrl ?? "",
    moreInfoUrl: h.moreInfoUrl ?? "",
    poster,
  };
}

export const emptyForm = (): ListingForm => ({
  title: "",
  organiser: "",
  summary: "",
  howItWorks: "",
  mode: "offline",
  city: "",
  venue: "",
  deadline: { date: "", time: "" },
  start: { date: "", time: "" },
  end: { date: "", time: "" },
  teamMin: "",
  teamMax: "",
  eligibility: "",
  feeText: "",
  isFree: false,
  prizeText: "",
  prizeShort: "",
  themes: "",
  registerUrl: "",
  moreInfoUrl: "",
  poster: { kind: "generated", style: Math.floor(Math.random() * 24) },
});
