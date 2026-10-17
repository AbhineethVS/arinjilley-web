// The public shape of a listing: what the server embeds in the page and the browser renders from.
// Only live listings, and never internal fields (source text, Telegram message ids, who created it).
import type { Hackathon } from "@arinjilley/core";

export type WebListing = Pick<
  Hackathon,
  | "slug"
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
  | "posterKind"
  | "posterStyle"
> & {
  /** Full-size poster image (/img/...), if one exists in Telegram. Used for custom posters and link previews. */
  posterUrl: string | null;
  /** Small version of the same image for cards. */
  thumbUrl: string | null;
  kerala: boolean;
};

const KERALA = [
  "kochi",
  "kozhikode",
  "thiruvananthapuram",
  "trivandrum",
  "thrissur",
  "kannur",
  "kollam",
  "malappuram",
  "palakkad",
  "kottayam",
  "alappuzha",
  "kerala",
  "kalamassery",
  "ernakulam",
];

export function isKerala(h: Pick<Hackathon, "city" | "venue">): boolean {
  const place = `${h.city ?? ""} ${h.venue ?? ""}`.toLowerCase();
  return KERALA.some((k) => place.includes(k));
}

export const imageUrl = (fileId: string | null) => (fileId ? `/img/${encodeURIComponent(fileId)}` : null);
