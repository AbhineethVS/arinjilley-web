import type { DateField } from "./time";

export type Mode = "online" | "offline" | "hybrid";
export type ListingStatus = "draft" | "live" | "discarded";
export type PosterKind = "generated" | "custom" | "organiser";

/** One hackathon listing, as the app works with it (the database row is mapped to this). */
export interface Hackathon {
  id: string;
  slug: string;
  status: ListingStatus;

  title: string;
  organiser: string | null;
  summary: string | null;
  howItWorks: string[];

  mode: Mode;
  city: string | null;
  venue: string | null;

  deadline: DateField | null; // null = rolling (no fixed deadline)
  start: DateField | null;
  end: DateField | null;

  teamMin: number | null;
  teamMax: number | null;
  eligibility: string | null;
  feeText: string | null;
  isFree: boolean;
  prizeText: string | null;
  prizeShort: string | null; // e.g. "₹1L+", used on posters and cards
  themes: string[];

  registerUrl: string | null;
  moreInfoUrl: string | null;
  brochureUrl: string | null;

  posterKind: PosterKind;
  posterStyle: number;
  posterFileId: string | null; // Telegram file ID of the rendered or uploaded poster

  createdBy: number | null; // Telegram user ID of the admin
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
}
