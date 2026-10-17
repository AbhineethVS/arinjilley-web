import type { Hackathon, Mode } from "./types";

export const MODE_LABEL: Record<Mode, string> = { online: "Online", offline: "Offline", hybrid: "Hybrid" };

/** "Solo", "2–4", "Up to 6", "Solo or team", "Any size" */
export function teamText(h: Pick<Hackathon, "teamMin" | "teamMax">): string {
  const { teamMin: a, teamMax: b } = h;
  if (a == null && b == null) return "Any size";
  if (a === 1 && b === 1) return "Solo";
  if (a === 1 && b == null) return "Solo or team";
  if (a != null && b != null) return `${a}–${b}`;
  if (b != null) return `Up to ${b}`;
  return `${a}+`;
}

/** Host without "www.", e.g. "colossus3.tech". Null for missing or invalid URLs. */
export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** URL-safe slug: "Odoo × Make-A-Ton 9.0" → "odoo-make-a-ton-9-0" */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "hackathon"
  );
}
