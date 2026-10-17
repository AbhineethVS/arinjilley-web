// The ready-to-paste WhatsApp post for a listing (SPEC §6): no emojis, WhatsApp *bold* only,
// lines with no data left out, always ending with the details link and the group link.
import { stripEmoji } from "./clean";
import { teamText } from "./format";
import { dateRange, deadlineInstant, fullDate } from "./time";
import type { Hackathon } from "./types";

export interface WhatsAppLinks {
  siteUrl: string; // e.g. https://arinjilley.example
  groupUrl: string; // WhatsApp group invite link
}

const clean = (s: string | null | undefined) => (s ? stripEmoji(s).replace(/\*/g, "") : "");

function whereText(h: Hackathon): string {
  const place = clean(h.venue) || clean(h.city);
  if (h.mode === "online") return "online";
  if (h.mode === "hybrid") return place ? `hybrid, ${place}` : "hybrid";
  return place ? `offline at ${place}` : "offline";
}

export function whatsappText(h: Hackathon, links: WhatsAppLinks): string {
  const lines: string[] = [];
  const title = clean(h.title);
  lines.push(`*${title}*`);
  if (h.organiser) lines.push(clean(h.organiser));
  if (h.summary) lines.push("", clean(h.summary));

  const facts: string[] = [];
  if (h.deadline) {
    const closes = { at: deadlineInstant(h.deadline), dateOnly: false };
    facts.push(`*Registration closes:* ${fullDate(closes)}`);
  } else {
    facts.push("*Registration:* open until seats fill, so apply early");
  }
  const when = h.start ? dateRange(h.start, h.end) : "";
  facts.push(`*Hackathon:* ${when ? `${when}, ` : ""}${whereText(h)}`);
  if (h.teamMin != null || h.teamMax != null) facts.push(`*Team:* ${teamText(h)}`);
  if (h.eligibility) facts.push(`*Who can join:* ${clean(h.eligibility)}`);
  if (h.feeText || h.isFree) facts.push(`*Fee:* ${clean(h.feeText) || "Free"}`);
  if (h.prizeText) facts.push(`*Prize pool:* ${clean(h.prizeText)}`);
  if (h.themes.length) facts.push(`*Tracks:* ${h.themes.map(clean).join(", ")}`);
  lines.push("", ...facts);

  if (h.howItWorks.length) {
    lines.push("", "*How it works*", ...h.howItWorks.map((step, i) => `${i + 1}. ${clean(step)}`));
  }

  lines.push("");
  if (h.registerUrl) lines.push(`Register: ${h.registerUrl}`);
  lines.push(`Details: ${links.siteUrl.replace(/\/+$/, "")}/h/${h.slug}`);
  lines.push(`Join our group: ${links.groupUrl}`);
  return lines.join("\n");
}
