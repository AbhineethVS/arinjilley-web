// The boarding-pass poster as a standalone HTML page (1080×1350), screenshotted by Cloudflare Browser Rendering.
// Same markup and CSS as the approved mock-up. Sizes use container query units (1cqw = 10.8px here), so the
// same CSS can later render small previews on the website.
import { hostOf, MODE_LABEL, teamText } from "../format";
import { dateRange, dayMonth, deadlineInstant } from "../time";
import type { Hackathon } from "../types";
import { resolveStyle } from "./themes";

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

export type PosterData = Pick<
  Hackathon,
  | "title"
  | "organiser"
  | "mode"
  | "city"
  | "venue"
  | "deadline"
  | "start"
  | "end"
  | "teamMin"
  | "teamMax"
  | "isFree"
  | "feeText"
  | "prizeShort"
  | "themes"
  | "registerUrl"
  | "posterStyle"
>;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Fonts are loaded from Fontshare's and Google's CDNs inside the rendering browser. */
export const POSTER_FONT_LINKS = [
  "https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=block",
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&display=block",
];

export const POSTER_CSS = `
.poster{container-type:inline-size;width:100%;aspect-ratio:4/5;position:relative;overflow:hidden;background:var(--p-bg);color:var(--p-ink);font-family:"General Sans",system-ui,sans-serif;isolation:isolate;-webkit-font-smoothing:antialiased}
.poster::before{content:"";position:absolute;inset:0;z-index:-1;opacity:.5}
.poster.art0::before{background-image:radial-gradient(color-mix(in srgb,var(--p-ink) 22%,transparent) .22cqw,transparent .3cqw);background-size:3cqw 3cqw}
.poster.art1::before{background-image:repeating-linear-gradient(-45deg,color-mix(in srgb,var(--p-ink) 9%,transparent) 0 .25cqw,transparent .25cqw 3.2cqw)}
.poster.art2::before{background-image:repeating-radial-gradient(circle at 105% -5%,color-mix(in srgb,var(--p-ink) 12%,transparent) 0 .3cqw,transparent .3cqw 4.5cqw);opacity:.65}
.pz{position:absolute;inset:0;padding:7cqw 7cqw 6.5cqw;display:flex;flex-direction:column}
.pz .m{font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:500;letter-spacing:.08em;text-transform:uppercase}
.p-top{display:flex;justify-content:space-between;align-items:flex-start;gap:4cqw}
.p-org{font-size:2.3cqw;color:var(--p-accent);max-width:52cqw;line-height:1.3}
.p-board{font-size:2cqw;text-align:right;line-height:1.55;opacity:.9}
.p-tag{display:inline-block;margin-top:.8cqw;background:var(--p-accent);color:var(--p-bg);padding:.4cqw 1.2cqw;font-weight:600}
.p-title{font-weight:700;letter-spacing:-.045em;line-height:.93;margin-top:4.5cqw;max-width:61cqw}
.p-title .acc{color:var(--p-accent)}
.p-stamp{position:absolute;right:6cqw;top:27cqw;width:23cqw;height:23cqw;border-radius:50%;border:.45cqw solid var(--p-accent);outline:.3cqw dashed color-mix(in srgb,var(--p-accent) 70%,transparent);outline-offset:-2.6cqw;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(9deg);color:var(--p-accent);text-align:center;line-height:1.15}
.p-stamp .s1,.p-stamp .s3{font-family:"JetBrains Mono",monospace;font-size:1.6cqw;letter-spacing:.12em}
.p-stamp .s2{font-size:4.4cqw;font-weight:700;letter-spacing:-.03em;margin:.4cqw 0}
.p-ticket{margin-top:auto;display:flex;background:var(--p-paper);color:var(--p-paper-ink);border-radius:2.2cqw;transform:rotate(-2deg);position:relative;box-shadow:0 2cqw 5cqw rgba(0,0,0,.35)}
.p-ticket::before,.p-ticket::after{content:"";position:absolute;left:calc(74% - 2.2cqw);width:4.4cqw;height:4.4cqw;border-radius:50%;background:var(--p-bg)}
.p-ticket::before{top:-2.2cqw}.p-ticket::after{bottom:-2.2cqw}
.p-main{width:74%;padding:3.6cqw 3.6cqw 3cqw}
.p-stub{width:26%;padding:3.6cqw 3cqw 3cqw;border-left:.3cqw dashed color-mix(in srgb,var(--p-paper-ink) 40%,transparent);display:flex;flex-direction:column}
.p-lbl{font-size:1.55cqw;opacity:.6}
.p-row{display:flex;justify-content:space-between}
.p-route{display:flex;align-items:center;gap:2cqw;margin:1.2cqw 0 2.4cqw;font-weight:700;font-size:6.6cqw;letter-spacing:-.04em;line-height:1}
.p-route svg{width:4cqw;height:4cqw;opacity:.75;flex:none}
.p-route .dots{flex:1;border-top:.35cqw dotted currentColor;opacity:.5}
.p-hr{border-top:.3cqw solid currentColor;opacity:.85;margin-bottom:2.2cqw}
.p-fields{display:flex;justify-content:space-between;gap:2cqw}
.p-fields b{display:block;font-size:var(--fs,3cqw);letter-spacing:-.02em;margin-top:.5cqw;white-space:nowrap}
.p-fields .hl b{background:var(--p-accent);color:var(--p-hl-ink,#111);padding:0 .8cqw;margin-left:-.8cqw}
.p-prize{font-weight:700;font-size:4.6cqw;letter-spacing:-.04em;line-height:1;margin:1cqw 0 2.4cqw;white-space:nowrap}.p-prize.sm{font-size:3.3cqw;letter-spacing:-.03em}.p-prize.xs{font-size:2.6cqw;letter-spacing:-.02em;line-height:1.1;white-space:normal;overflow-wrap:anywhere}
.p-due{font-weight:700;font-size:2.9cqw;margin-top:.6cqw}
.p-bars{margin-top:auto;height:10cqw;background:repeating-linear-gradient(90deg,var(--p-paper-ink) 0 .35cqw,transparent .35cqw .7cqw,var(--p-paper-ink) .7cqw 1.4cqw,transparent 1.4cqw 1.75cqw,var(--p-paper-ink) 1.75cqw 1.95cqw,transparent 1.95cqw 2.6cqw)}
.p-chips{display:flex;flex-wrap:wrap;gap:1.6cqw;margin-top:5cqw}
.p-chips span{border:.32cqw solid var(--p-accent);color:var(--p-accent);border-radius:9cqw;padding:1cqw 2.6cqw;font-size:2.5cqw;font-weight:600;white-space:nowrap}
.p-chips span:first-child{background:var(--p-accent);color:var(--p-bg)}
.p-foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:4.2cqw;gap:3cqw}
.p-foot .p-lbl{color:var(--p-accent);opacity:1;font-size:1.9cqw}
.p-url{font-weight:700;font-size:4.6cqw;letter-spacing:-.03em;line-height:1.1;margin-top:.8cqw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62cqw}
.p-venue{font-size:2cqw;text-align:right;opacity:.85;line-height:1.4;max-width:28cqw}
`;

const PLANE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path transform="rotate(90 12 12)" fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';

/** The poster element (no <html> wrapper), sized by its container. */
/** The prize label is up to 16 characters; longer ones get a smaller size so they fit the ticket stub. */
const prizeSize = (label: string | null | undefined) =>
  !label || label.length <= 8 ? "" : label.length <= 11 ? " sm" : " xs";

export function posterMarkup(d: PosterData): string {
  const { theme: t, artwork } = resolveStyle(d.posterStyle);
  const words = d.title.trim().split(/\s+/);
  const l1 = words.length > 1 ? words.slice(0, -1).join(" ") : d.title.trim();
  let l2 = words.length > 1 ? words[words.length - 1]! : "";
  if (/[a-z]$/i.test(l2)) l2 += ".";
  const len = d.title.length;
  const longest = Math.max(...words.map((w) => w.length));
  const fs = Math.min(len <= 12 ? 14 : len <= 18 ? 12 : len <= 26 ? 10 : 8.4, 60 / (0.66 * longest));

  const modeLabel = MODE_LABEL[d.mode];
  const city = (d.city ?? "").toUpperCase();
  const tag = d.isFree ? "FREE ENTRY" : d.themes[0] ? `THEME: ${d.themes[0].toUpperCase()}` : "NOW OPEN";
  const sub = d.mode === "online" || !city ? "BUILDERS · ONLINE" : `BUILDERS · ${city}`;
  const closes = d.deadline ? deadlineInstant(d.deadline) : null;
  const stamp = closes
    ? ["CLOSES BY", dayMonth(closes).toUpperCase(), "REGISTRATION"]
    : ["STARTS", d.start ? dayMonth(d.start.at).toUpperCase() : "SOON", "SEATS LIMITED"];
  const fare = d.isFree ? "Free" : d.feeText ? d.feeText.split(/[\s·,(]/)[0]! : "TBA";
  const team = teamText(d) === "Solo or team" ? "Solo/team" : teamText(d);
  const date = d.start ? dateRange(d.start, d.end) : "Rolling";
  // Shrink the ticket fields when they're long, so they never overlap.
  const fieldChars = date.length + modeLabel.length + team.length + Math.min(fare.length, 9);
  const fieldSize = fieldChars > 30 ? 2.5 : fieldChars > 26 ? 2.75 : 3;
  const host = hostOf(d.registerUrl);
  const url = host
    ? host === "luma.com" || host === "lu.ma"
      ? `${host}${new URL(d.registerUrl!).pathname}`
      : host
    : "see listing";
  const to = ["DEMO", "SHIP", "PITCH"][artwork]!;

  return `<div class="poster art${artwork}" style="--p-bg:${t.bg};--p-ink:${t.ink};--p-accent:${t.accent};--p-paper:${t.paper};--p-paper-ink:${t.paperInk};--p-hl-ink:${t.highlightInk}"><div class="pz">
  <div class="p-top"><div class="p-org m">${esc(d.organiser ?? "arinjilley?")} presents</div><div class="p-board m">NOW BOARDING<br>${esc(sub)}<br><span class="p-tag">${esc(tag)}</span></div></div>
  <div class="p-title" style="font-size:${fs}cqw">${esc(l1)}${l2 ? `<br><span class="acc">${esc(l2)}</span>` : ""}</div>
  <div class="p-stamp"><span class="s1">${stamp[0]}</span><span class="s2">${esc(stamp[1]!)}</span><span class="s3">${stamp[2]}</span></div>
  <div class="p-ticket">
    <div class="p-main">
      <div class="p-row m"><span class="p-lbl">BOARDING PASS · ${modeLabel.toUpperCase()} HACKATHON</span></div>
      <div class="p-row m" style="margin-top:2.2cqw"><span class="p-lbl">FROM</span><span class="p-lbl">TO</span></div>
      <div class="p-route">IDEA<span class="dots"></span>${PLANE}<span class="dots"></span>${to}</div>
      <div class="p-hr"></div>
      <div class="p-fields" style="--fs:${fieldSize}cqw">
        <div><span class="p-lbl m">DATE</span><b>${esc(date)}</b></div>
        <div class="hl"><span class="p-lbl m">MODE</span><b>${modeLabel}</b></div>
        <div><span class="p-lbl m">SEAT</span><b>${esc(team)}</b></div>
        <div><span class="p-lbl m">FARE</span><b>${esc(fare.slice(0, 9))}</b></div>
      </div>
    </div>
    <div class="p-stub">
      <span class="p-lbl m">PRIZE</span><div class="p-prize${prizeSize(d.prizeShort)}">${esc(d.prizeShort ?? "—")}</div>
      <span class="p-lbl m">${closes ? "CLOSES" : "STARTS"}</span><div class="p-due">${closes ? dayMonth(closes).toUpperCase() : d.start ? dayMonth(d.start.at).toUpperCase() : "—"}</div>
      <div class="p-bars"></div>
    </div>
  </div>
  ${
    d.themes.length
      ? `<div class="p-chips">${d.themes
          .slice(0, 3)
          .map((x) => `<span>${esc(x)}</span>`)
          .join("")}</div>`
      : ""
  }
  <div class="p-foot"><div><div class="p-lbl m">Register at</div><div class="p-url">${esc(url)}</div></div><div class="p-venue">${esc(d.venue ?? d.city ?? "")}</div></div>
</div></div>`;
}

/**
 * Full HTML document for the screenshot (exactly 1080×1350).
 * Pass `fontCss` (inline base64 @font-face rules) so the browser needs no network at all; without it the
 * fonts are loaded from the CDNs.
 */
export function posterHtml(d: PosterData, fontCss?: string): string {
  const fonts = fontCss
    ? `<style>${fontCss}</style>`
    : POSTER_FONT_LINKS.map((href) => `<link rel="stylesheet" href="${href}">`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8">
${fonts}
<style>html,body{margin:0;width:${POSTER_WIDTH}px;height:${POSTER_HEIGHT}px;overflow:hidden;background:#000}${POSTER_CSS}</style>
</head><body>${posterMarkup(d)}</body></html>`;
}
