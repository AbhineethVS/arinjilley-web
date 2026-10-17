// Editing a listing from Telegram: pick a field from the menu, then type the new value (SPEC §3.3).
import {
  formatIstInput,
  type Hackathon,
  parseDateInput,
  parseList,
  parseTeamInput,
  parseUrlInput,
  shortPrize,
  stripEmoji,
} from "@arinjilley/core";
import type { ListingFields } from "@arinjilley/core/db";
import { InlineKeyboard } from "grammy";
import { esc } from "./telegram";

type Result = { fields: Partial<ListingFields> } | { error: string };

interface FieldDef {
  label: string;
  prompt: string;
  /** current value shown in the prompt */
  current: (h: Hackathon) => string;
  apply: (input: string, h: Hackathon) => Result;
  /** whether a change means the generated poster must be re-rendered */
  poster: boolean;
}

const CLEAR = /^\s*(none|clear|remove|-)\s*$/i;
const text =
  (key: keyof ListingFields, max: number, optional = true) =>
  (input: string): Result => {
    if (CLEAR.test(input))
      return optional ? { fields: { [key]: null } } : { error: "This one can't be empty." };
    const v = stripEmoji(input).replace(/\s+/g, " ").trim();
    if (!v) return { error: "That was empty. Send some text, or /cancel." };
    if (v.length > max) return { error: `Too long (max ${max} characters).` };
    return { fields: { [key]: v } };
  };

const date =
  (key: "deadline" | "start" | "end", label: string) =>
  (input: string): Result => {
    const d = parseDateInput(input);
    if (d === null) {
      return {
        error: `I couldn't read that ${label}. Try <code>25 Oct</code>, <code>25 Oct 11:59 PM</code> or <code>2026-10-25 23:59</code>.`,
      };
    }
    return { fields: { [key]: d === "clear" ? null : d } };
  };

const fmtDate = (f: Hackathon["deadline"]) => (f ? formatIstInput(f).replace("T", " ") : "not set");

export const FIELDS: Record<string, FieldDef> = {
  title: {
    label: "Title",
    prompt: "Send the new <b>title</b> (just the event name).",
    current: (h) => h.title,
    apply: text("title", 90, false),
    poster: true,
  },
  org: {
    label: "Organiser",
    prompt: "Send the <b>organiser</b>, e.g. <code>Techfest, IIT Bombay</code>.",
    current: (h) => h.organiser ?? "not set",
    apply: text("organiser", 80),
    poster: true,
  },
  deadline: {
    label: "Deadline",
    prompt:
      "Send the <b>registration deadline</b> (IST), e.g. <code>25 Oct 11:59 PM</code> or <code>2026-10-25 23:59</code>.\nSend <code>none</code> if there's no fixed deadline.",
    current: (h) => fmtDate(h.deadline),
    apply: date("deadline", "deadline"),
    poster: true,
  },
  start: {
    label: "Start date",
    prompt:
      "Send the <b>start date</b>, e.g. <code>13 Nov</code> or <code>24 Oct 5 PM</code>. <code>none</code> to clear.",
    current: (h) => fmtDate(h.start),
    apply: date("start", "start date"),
    poster: true,
  },
  end: {
    label: "End date",
    prompt: "Send the <b>end date</b>, e.g. <code>14 Nov</code>. <code>none</code> to clear.",
    current: (h) => fmtDate(h.end),
    apply: date("end", "end date"),
    poster: true,
  },
  city: {
    label: "City",
    prompt: "Send the <b>city</b>, e.g. <code>Kochi</code>. <code>none</code> to clear.",
    current: (h) => h.city ?? "not set",
    apply: text("city", 40),
    poster: true,
  },
  venue: {
    label: "Venue",
    prompt: "Send the <b>venue</b>, e.g. <code>CUSAT, Kochi</code>. <code>none</code> to clear.",
    current: (h) => h.venue ?? "not set",
    apply: text("venue", 80),
    poster: true,
  },
  team: {
    label: "Team size",
    prompt:
      "Send the <b>team size</b>: <code>solo</code>, <code>2-4</code>, <code>up to 6</code>, <code>1+</code> or <code>any</code>.",
    current: (h) =>
      h.teamMin == null && h.teamMax == null ? "not set" : `${h.teamMin ?? "?"}–${h.teamMax ?? "?"}`,
    apply: (input) => {
      const t = parseTeamInput(input);
      return t
        ? { fields: { teamMin: t.min, teamMax: t.max } }
        : { error: "Try <code>solo</code>, <code>2-4</code> or <code>up to 6</code>." };
    },
    poster: true,
  },
  elig: {
    label: "Who can join",
    prompt: "Send <b>who can join</b>, e.g. <code>UG/PG students with a college ID</code>.",
    current: (h) => h.eligibility ?? "not set",
    apply: text("eligibility", 120),
    poster: false,
  },
  fee: {
    label: "Fee",
    prompt: "Send the <b>fee</b>, e.g. <code>Free</code> or <code>₹200 per team</code>.",
    current: (h) => h.feeText ?? (h.isFree ? "Free" : "not set"),
    apply: (input) => {
      const r = text("feeText", 80)(input);
      if ("error" in r) return r;
      const v = (r.fields.feeText as string | null) ?? "";
      return { fields: { feeText: v || null, isFree: /^\s*free\b/i.test(v) } };
    },
    poster: true,
  },
  prize: {
    label: "Prize",
    prompt:
      "Send the <b>prize</b>, e.g. <code>₹1 Lakh prize pool</code>. The poster label is worked out from it.",
    current: (h) => h.prizeText ?? "not set",
    apply: (input, h) => {
      const r = text("prizeText", 120)(input);
      if ("error" in r) return r;
      const v = r.fields.prizeText as string | null;
      return { fields: { prizeText: v, prizeShort: shortPrize(v) ?? (v ? h.prizeShort : null) } };
    },
    poster: true,
  },
  label: {
    label: "Poster prize label",
    prompt:
      "Send the short <b>prize label</b> for the poster (max 8 characters), e.g. <code>₹1L+</code> or <code>PS5</code>.",
    current: (h) => h.prizeShort ?? "not set",
    apply: text("prizeShort", 8),
    poster: true,
  },
  themes: {
    label: "Themes",
    prompt: "Send the <b>themes</b>, separated by commas, e.g. <code>AI, FinTech, Hardware</code>.",
    current: (h) => h.themes.join(", ") || "not set",
    apply: (input) => ({ fields: { themes: CLEAR.test(input) ? [] : parseList(stripEmoji(input), 5) } }),
    poster: true,
  },
  link: {
    label: "Register link",
    prompt: "Send the <b>registration link</b>.",
    current: (h) => h.registerUrl ?? "not set",
    apply: (input) => {
      if (CLEAR.test(input)) return { fields: { registerUrl: null } };
      const url = parseUrlInput(input);
      return url ? { fields: { registerUrl: url } } : { error: "That doesn't look like a link." };
    },
    poster: true,
  },
  summary: {
    label: "About",
    prompt: "Send a 1–2 sentence <b>description</b>.",
    current: (h) => h.summary ?? "not set",
    apply: text("summary", 400),
    poster: false,
  },
  steps: {
    label: "How it works",
    prompt: "Send the <b>steps</b>, one per line (up to 4). <code>none</code> to clear.",
    current: (h) =>
      h.howItWorks.length ? h.howItWorks.map((s, i) => `${i + 1}. ${s}`).join("\n") : "not set",
    apply: (input) => ({
      fields: { howItWorks: CLEAR.test(input) ? [] : parseList(stripEmoji(input).replace(/;/g, "\n"), 4) },
    }),
    poster: false,
  },
};

export function editKeyboard(id: string): InlineKeyboard {
  const k = new InlineKeyboard();
  const keys = Object.keys(FIELDS);
  keys.forEach((key, i) => {
    k.text(FIELDS[key]!.label, `ef:${id}:${key}`);
    if (i % 3 === 2) k.row();
  });
  return k
    .row()
    .text("Mode: Online", `mode:${id}:online`)
    .text("Offline", `mode:${id}:offline`)
    .text("Hybrid", `mode:${id}:hybrid`)
    .row()
    .text("⬅️ Done editing", `back:${id}`);
}

export function promptFor(key: string, h: Hackathon): string {
  const f = FIELDS[key]!;
  return `${f.prompt}\n\nNow: <code>${esc(f.current(h))}</code>\n\n<i>Reply to this message, or send /cancel.</i>`;
}
