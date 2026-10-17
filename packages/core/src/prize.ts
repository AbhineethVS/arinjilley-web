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
