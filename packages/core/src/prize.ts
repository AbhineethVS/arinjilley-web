// Short prize labels for posters and cards: "INR 2,00,000 prize pool" → "₹2L", "Up to $25,000" → "$25K".

const UNITS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  l: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  lac: 1e5,
  lacs: 1e5,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
};

const trim = (n: number) => String(Math.round(n * 100) / 100);

function formatInr(amount: number): string {
  if (amount >= 1e7) return `₹${trim(amount / 1e7)}Cr`;
  if (amount >= 1e5) return `₹${trim(amount / 1e5)}L`;
  if (amount >= 1e3) return `₹${trim(amount / 1e3)}K`;
  return `₹${Math.round(amount)}`;
}

function formatUsd(amount: number): string {
  if (amount >= 1e6) return `$${trim(amount / 1e6)}M`;
  if (amount >= 1e3) return `$${trim(amount / 1e3)}K`;
  return `$${Math.round(amount)}`;
}

const AMOUNT =
  /(₹|rs\.?|inr|\$|usd)\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l|crores?|cr|million|mn|m)?\b(\s*\+)?|([\d,]+(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|crores?|cr|million|mn|m)?\s*(₹|rs\.?|inr|usd|dollars)\b/i;

/** Best-effort short label from a prize description; null if no amount is found. */
/** Max length of the stored prize text (one prize per line). */
export const PRIZE_MAX = 600;

/**
 * The prizes as separate points. Stored one per line; older listings used "; " between prizes on one line,
 * so a single line is split on semicolons too.
 */
export function prizeLines(text: string | null | undefined): string[] {
  if (!text) return [];
  const lines = text.includes("\n") ? text.split(/\r?\n/) : text.split(/\s*;\s+/);
  return lines
    .map((l) => l.replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

/** Tidies typed/pasted prize text: one prize per line, spaces collapsed, bullets removed, length capped. */
export function normalizePrizeText(text: string | null | undefined): string | null {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const out = lines.join("\n").slice(0, PRIZE_MAX).trim();
  return out || null;
}

export function shortPrize(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = AMOUNT.exec(text);
  if (!m) return null;
  const currency = (m[1] ?? m[7] ?? "").toLowerCase();
  const num = Number.parseFloat((m[2] ?? m[5] ?? "").replace(/,/g, ""));
  const unit = (m[3] ?? m[6] ?? "").toLowerCase();
  if (!Number.isFinite(num) || num <= 0) return null;
  const amount = num * (unit ? (UNITS[unit] ?? 1) : 1);
  const usd = currency === "$" || currency === "usd" || currency === "dollars";
  const plus = m[4] || /\d\s*(?:\+|plus)/i.test(text) ? "+" : "";
  return (usd ? formatUsd(amount) : formatInr(amount)) + plus;
}
