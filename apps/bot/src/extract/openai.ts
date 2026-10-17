// Turns a cleaned post (plus optional page data) into structured listing fields with OpenAI.
// Uses Structured Outputs (a strict JSON schema), so the reply always has exactly these keys.
import { dayMonth, istParts, WEEKDAYS } from "@arinjilley/core";
import type { PageInfo } from "./page";

export interface RawExtraction {
  is_hackathon: boolean;
  not_hackathon_reason: string | null;
  title: string | null;
  organiser: string | null;
  summary: string | null;
  how_it_works: string[];
  mode: "online" | "offline" | "hybrid";
  city: string | null;
  venue: string | null;
  registration_deadline: string | null;
  event_start: string | null;
  event_end: string | null;
  team_min: number | null;
  team_max: number | null;
  eligibility: string | null;
  fee_text: string | null;
  is_free: boolean;
  prize_text: string | null;
  prize_short: string | null;
  themes: string[];
  register_url: string | null;
  more_info_url: string | null;
}

const str = { type: ["string", "null"] } as const;
const int = { type: ["integer", "null"] } as const;
const strList = { type: "array", items: { type: "string" } } as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_hackathon: { type: "boolean" },
    not_hackathon_reason: str,
    title: str,
    organiser: str,
    summary: str,
    how_it_works: strList,
    mode: { type: "string", enum: ["online", "offline", "hybrid"] },
    city: str,
    venue: str,
    registration_deadline: str,
    event_start: str,
    event_end: str,
    team_min: int,
    team_max: int,
    eligibility: str,
    fee_text: str,
    is_free: { type: "boolean" },
    prize_text: str,
    prize_short: str,
    themes: strList,
    register_url: str,
    more_info_url: str,
  },
  required: [
    "is_hackathon",
    "not_hackathon_reason",
    "title",
    "organiser",
    "summary",
    "how_it_works",
    "mode",
    "city",
    "venue",
    "registration_deadline",
    "event_start",
    "event_end",
    "team_min",
    "team_max",
    "eligibility",
    "fee_text",
    "is_free",
    "prize_text",
    "prize_short",
    "themes",
    "register_url",
    "more_info_url",
  ],
} as const;

function instructions(sentAt: number): string {
  const p = istParts(sentAt);
  const today = `${WEEKDAYS[p.weekday]}, ${dayMonth(sentAt)} ${p.year}`;
  return `You extract hackathon listings from WhatsApp posts for a student club's hackathon board in India.
Use only facts stated in the post or the linked page data. Use null (or [] / false) when something isn't stated. Never invent dates, prizes, links or numbers.

The post was sent on ${today} (IST). Times are IST: convert 12-hour times carefully (12:30 AM = 00:30, 12 noon = 12:00, 11:59 PM = 23:59). Write every date as "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM" (24-hour, IST) when a time is given. If a date has no year, use the next occurrence on or after the post date; dates a few days before the post date are still this year.

Fields:
- is_hackathon: true for hackathons, buildathons, ideathons, coding or innovation challenges and similar competitions people can register for. False for chit-chat, stickers, bare reminders like "deadline today!!" with no event details, or unrelated messages. If false, give a short not_hackathon_reason.
- title: the official event name only, keeping edition numbers (e.g. "COLOSSUS 3.0", "Perceptron Hackathon 2026"). Drop emojis and any tagline after "|", "-", "–" or ":". If the post writes the name in ALL CAPS, use normal capitalisation ("AMAZON DEVELOPER HACKATHON 2026" → "Amazon Developer Hackathon 2026"), but keep stylised names like "COLOSSUS" or "HACK-ORBITAL" as written.
- organiser: who hosts it, short (e.g. "Techfest, IIT Bombay", "Meta × Cerebral Valley").
- summary: 1–2 plain, factual sentences on what participants do or build. No emojis, no hype words. Don't mention dates, deadlines, prizes or team sizes (those have their own fields).
- how_it_works: up to 4 short steps, only if the post describes distinct rounds or stages (e.g. "Round 1 online, Round 2 on campus"). Otherwise [].
- mode: "online", "offline", or "hybrid" (online rounds plus an in-person final counts as hybrid).
- city: city name only (e.g. "Kochi"); null if fully online. venue: the named venue (e.g. "CUSAT, Kochi"); null if it is "to be announced" or only revealed after selection.
- registration_deadline: the last moment to register, apply, or submit the first-round entry. If registration stays open until the event ends, use the event end. Use null if the post gives no deadline or says there isn't one (e.g. "no deadline announced", "until seats fill", "apply soon"). Never use the event start as a guessed deadline.
- event_start / event_end: when the hackathon itself happens. For multi-round events, start = first dated round, end = the finale's last day.
- team_min / team_max: "teams of up to 3" → null, 3; "solo or duo" → 1, 2; "solo" → 1, 1; "1–4" → 1, 4.
- fee_text: the fee as stated, short (e.g. "Free", "Round 1 free, ₹800 per team for finalists"); null if not mentioned. is_free: true only if the post says registration or the first round is free; false if a fee applies from the start or no fee information is given.
- prize_text: concise prize description (e.g. "₹1 Lakh+ prize pool", "Up to $25,000 per track"). prize_short: a label of at most 7 characters for a poster (e.g. "₹1L+", "₹2.25L", "$25K", "$1M", "PS5"), or null if there's no prize.
- themes: up to 5 short Title Case tags for tracks or domains (e.g. "AI", "FinTech", "Hardware").
- register_url: the registration or application link, chosen from the provided URLs only; null if none. more_info_url: another provided URL with more details, or null.
- eligibility: who can take part, short (e.g. "UG/PG students with a college ID").`;
}

function pageBlock(page: PageInfo | null): string {
  if (!page) return "";
  const parts = [
    `LINKED PAGE (${page.url})`,
    page.title ? `Title: ${page.title}` : "",
    page.description ? `Description: ${page.description}` : "",
    page.jsonLd ? `Structured data: ${page.jsonLd}` : "",
    page.text ? `Text excerpt:\n${page.text}` : "",
  ];
  return `\n\n${parts.filter(Boolean).join("\n")}`;
}

export async function extractWithOpenAI(
  env: Env,
  input: { text: string; urls: string[]; sentAt: number; page: PageInfo | null },
): Promise<RawExtraction> {
  const body = {
    model: env.OPENAI_MODEL,
    reasoning_effort: env.OPENAI_REASONING,
    max_completion_tokens: 2000,
    response_format: {
      type: "json_schema",
      json_schema: { name: "hackathon_listing", strict: true, schema: SCHEMA },
    },
    messages: [
      { role: "developer", content: instructions(input.sentAt) },
      {
        role: "user",
        content: `POST:\n"""\n${input.text}\n"""\n\nURLS:\n${input.urls.length ? input.urls.map((u) => `- ${u}`).join("\n") : "(none)"}${pageBlock(input.page)}`,
      },
    ],
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  };
  const choice = json.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`OpenAI refused: ${choice.message.refusal}`);
  const content = choice?.message?.content;
  if (!content) throw new Error(`OpenAI returned no content (finish_reason: ${choice?.finish_reason})`);
  return JSON.parse(content) as RawExtraction;
}
