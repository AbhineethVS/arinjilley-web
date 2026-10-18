// Server-rendered pages. The browser script (client/app.ts) takes over the home page for filters, search and
// the side panel, re-rendering with the same functions from shared/render.ts.
import { deadlineInstant } from "@arinjilley/core";
import { POSTER_CSS } from "@arinjilley/core/poster";
import { LOGO_MARK } from "../shared/brand";
import type { WebListing } from "../shared/listing";
import {
  archiveGroups,
  art,
  boardGroups,
  DEFAULT_FILTERS,
  detailHtml,
  emptyHtml,
  esc,
  filterBarHtml,
  filterDefs,
  icon,
  soonHtml,
  statsHtml,
  timelineHtml,
  upcomingGroups,
} from "../shared/render";

export interface PageCtx {
  siteUrl: string;
  groupUrl: string;
}

// Picks one accent per visit (per tab session), never the same as the previous visit. Runs before first paint.
const ACCENT_SCRIPT = `(()=>{const A=["#C8F560","#7CC4FF","#B4A7FF","#FF7AA2","#FF8E72","#EDE6D6"];let a;try{a=sessionStorage.getItem("arj-accent");if(!A.includes(a)){const p=a||localStorage.getItem("arj-last-accent"),c=A.filter(x=>x!==p);a=c[Math.floor(Math.random()*c.length)];sessionStorage.setItem("arj-accent",a);localStorage.setItem("arj-last-accent",a)}}catch(e){a=A[0]}document.documentElement.style.setProperty("--accent",a);if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("tw")})();`;

/** JSON safe to put inside a <script> tag. */
// (U+2028/U+2029 are valid in JSON but end a line in older JavaScript parsers, so they're escaped too.)
// Built without escape sequences on purpose: backslash + u, and the two separator characters by code.
const BACKSLASH_U = `${String.fromCharCode(92)}u`;
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, "g");
const safeJson = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, `${BACKSLASH_U}003c`)
    .replace(LINE_SEPARATORS, (c) => `${BACKSLASH_U}${c.charCodeAt(0).toString(16)}`);

function layout(
  ctx: PageCtx,
  o: {
    title: string;
    description: string;
    path: string;
    page: "home" | "detail" | "other";
    current?: "home" | "archive" | "about";
    ogImage?: string | null;
    body: string;
    data?: unknown;
    noindex?: boolean;
  },
): string {
  const canonical = `${ctx.siteUrl}${o.path}`;
  const og = o.ogImage ? `${ctx.siteUrl}${o.ogImage}` : null;
  const nav = (key: "home" | "archive" | "about", href: string, label: string) =>
    `<a href="${href}" data-nav="${key}"${o.current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(canonical)}">
${o.noindex ? '<meta name="robots" content="noindex">' : ""}
<meta name="theme-color" content="#161618">
<meta property="og:type" content="website">
<meta property="og:site_name" content="arinjilley?">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(canonical)}">
${og ? `<meta property="og:image" content="${esc(og)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="arinjilley?">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="preload" href="/fonts/GeneralSans-500.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Sentient-500.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css?v=${__BUILD_ID__}">
<style>${POSTER_CSS}</style>
<script>${ACCENT_SCRIPT}</script>
</head>
<body data-page="${o.page}">
<header class="top" id="top">
  <div class="wrap top-in">
    <a href="/" class="logo" aria-label="arinjilley? home">${LOGO_MARK}<span>arinjilley<span class="q">?</span></span></a>
    <nav class="nav" aria-label="Main">${nav("home", "/", "Hackathons")}${nav("archive", "/archive", "Archive")}${nav("about", "/about", "About")}</nav>
    <div class="top-right">
      <div class="clock mono" role="timer" aria-live="off"><span class="sr" id="clockSr">Time in India</span><span class="flaps" id="clock" aria-hidden="true"></span><span class="tz" aria-hidden="true">IST</span></div>
      <a href="${esc(ctx.groupUrl)}" class="btn btn-ghost btn-sm" target="_blank" rel="noopener">${icon("whatsapp-logo")}<span class="lbl-long">Join the group</span><span class="sr">Join the WhatsApp group</span></a>
    </div>
  </div>
</header>
${o.body}
<div class="toast" id="toast" role="status"></div>
${o.data !== undefined ? `<script type="application/json" id="data">${safeJson(o.data)}</script>` : ""}
<script src="/app.js?v=${__BUILD_ID__}" defer></script>
</body>
</html>`;
}

function footer(ctx: PageCtx): string {
  return `<footer class="foot">
  <div>
    <div class="logo">${LOGO_MARK}<span>arinjilley<span class="q" style="color:var(--accent)">?</span></span></div>
    <p>A student-run club that shares hackathons. Listings are checked by our admins, but always confirm details on the organiser's page.</p>
  </div>
  <nav class="mono" aria-label="Footer">
    <a href="${esc(ctx.groupUrl)}" target="_blank" rel="noopener">WHATSAPP GROUP</a>
    <a href="/archive">ARCHIVE</a>
    <a href="/about">ABOUT</a>
    <button class="install-btn" data-install hidden>INSTALL APP</button>
  </nav>
</footer>`;
}

function heroPosters(list: WebListing[], now: number): string {
  const deck = list
    .filter((h) => !h.deadline || deadlineInstant(h.deadline) > now)
    .sort(
      (a, b) =>
        (a.deadline ? deadlineInstant(a.deadline) : Infinity) -
        (b.deadline ? deadlineInstant(b.deadline) : Infinity),
    )
    .slice(0, 6);
  // Deck: front card, then one (mobile) or two (desktop) tucked behind on each side, the rest waiting. client/app.ts rotates data-pos.
  const n = deck.length;
  const fanPos = (i: number) =>
    i === 0
      ? "0"
      : i === 1
        ? "1"
        : i === n - 1
          ? "-1"
          : n >= 5 && i === 2
            ? "2"
            : n >= 5 && i === n - 2
              ? "-2"
              : "x";
  const fan = deck
    .map(
      (h, i) =>
        `<a href="/h/${esc(h.slug)}" data-slug="${esc(h.slug)}" class="fp" data-pos="${fanPos(i)}"${i ? ' tabindex="-1" aria-hidden="true"' : ""} aria-label="${esc(h.title)}, ${i + 1} of ${n}">${art(h)}</a>`,
    )
    .join("");
  const dots = deck.length > 1 ? deck.map((_, i) => `<i${i ? "" : ' class="on"'}></i>`).join("") : "";
  // Auto-rotation must be stoppable (WCAG 2.2.2), so the pager row carries a pause button.
  const pager = dots
    ? `<div class="fan-dots"><button type="button" class="fan-pause" id="fanPause" aria-pressed="false" aria-label="Pause rotating cards"></button><span class="fan-pips" aria-hidden="true">${dots}</span></div><p class="sr" id="fanLive" aria-live="polite"></p>`
    : "";
  return fan && `${fan}${pager}`;
}

// Folder in the corner holding the three posters whose registration closes soonest (folder from Uiverse.io by junaid_3671).
const FOLDER_PATH =
  "M0 25C0 11.1929 11.1929 0 25 0H136.084C143.044 0 149.689 2.90139 154.42 8.00608L178.08 33.5343C182.811 38.639 189.456 41.5404 196.416 41.5404H296C309.807 41.5404 321 52.7333 321 66.5404V216C321 229.807 309.807 241 296 241H25C11.1929 241 0 229.807 0 216V25Z";
function closingFolder(list: WebListing[], now: number): string {
  // Only hackathons with a real deadline still ahead; rolling ones have nothing to count down to.
  const closing = list
    .filter((h) => h.deadline && deadlineInstant(h.deadline) > now)
    .sort((a, b) => deadlineInstant(a.deadline!) - deadlineInstant(b.deadline!))
    .slice(0, 3);
  if (!closing.length) return "";
  // DOM order is paint order, so the one closing first goes last and sits on top.
  const cards = closing
    .map(
      (h, i) =>
        `<a class="fd-card fd-card-${i + 1}" href="/h/${esc(h.slug)}" data-slug="${esc(h.slug)}" tabindex="-1" aria-hidden="true" aria-label="${esc(h.title)}">${art(h)}</a>`,
    )
    .reverse()
    .join("");
  return `<div class="fd" id="folder">
  <button type="button" class="fd-toggle" id="folderBtn" aria-expanded="false" aria-controls="folder">Deadline approaching: ${closing.length} ${closing.length === 1 ? "hackathon closes" : "hackathons close"} soonest</button>
  <div class="fd-stage" aria-hidden="true">
    <div class="fd-back"></div>
    <div class="fd-cards">${cards}</div>
    <div class="fd-flap">
      <div class="fd-flap-blur" style="clip-path:path('${FOLDER_PATH}');-webkit-clip-path:path('${FOLDER_PATH}')"></div>
      <svg viewBox="0 0 321 241" width="321" height="241"><path d="${FOLDER_PATH}" fill="var(--fd-flap-fill)" fill-opacity="var(--fd-flap-opacity)" stroke="var(--fd-flap-stroke)"/></svg>
      <span class="fd-label mono"><i class="fd-dot"></i>DEADLINE APPROACHING</span>
    </div>
  </div>
</div>`;
}

export function homePage(
  ctx: PageCtx,
  list: WebListing[],
  view: "upcoming" | "archive",
  now: number,
): string {
  const groups = boardGroups(list, now, view);
  const upcomingCount = upcomingGroups(list, now).reduce((n, g) => n + g.items.length, 0);
  const archiveCount = archiveGroups(list, now).reduce((n, g) => n + g.items.length, 0);
  const fan = heroPosters(list, now);
  const body = `<a class="skip" href="#board">Skip to hackathons</a>
<main>
  <section class="hero wrap" id="hero">
    <div class="hero-text">
      <h1 class="display" id="heroH">Hackathons worth<br><span class="acc">applying to.</span></h1>
      <p>We find hackathons, check the details, and line them up by deadline, so you apply before registration closes.</p>
      <div class="hero-cta">
        <a href="${esc(ctx.groupUrl)}" class="btn btn-primary" target="_blank" rel="noopener">${icon("whatsapp-logo")}Join the WhatsApp group</a>
        <a href="#board" class="btn btn-ghost">See what's closing${icon("arrow-down")}</a>
      </div>
      <div class="hero-stats mono" id="stats">${statsHtml(list, now)}</div>
    </div>
    ${fan ? `<div class="hero-fan" id="fan" role="region" aria-roledescription="carousel" aria-label="Closing soon">${fan}</div>` : ""}
  </section>
  <div class="wrap">
    <section class="soon" id="soon" aria-labelledby="soon-h">${soonHtml(list, now)}</section>
    <section class="board" id="board" aria-label="Hackathon timeline">
      <div class="bar" id="bar">
        <div class="bar-head">
          <div class="tabs" role="tablist" aria-label="View">
            <a class="tab display" role="tab" href="/" data-view="upcoming" aria-selected="${view === "upcoming"}">Upcoming<sup id="cntUp">${upcomingCount}</sup></a>
            <a class="tab display" role="tab" href="/archive" data-view="archive" aria-selected="${view === "archive"}">Archive<sup id="cntAr">${archiveCount}</sup></a>
          </div>
          <div class="find" id="find">
            <button class="find-btn" id="findBtn" aria-label="Search (press /)">${icon("magnifying-glass")}</button>
            <input id="q" type="search" placeholder="Search name, organiser, city…" autocomplete="off" aria-label="Search hackathons" tabindex="-1">
            <button class="find-x" id="findX" aria-label="Close search">${icon("x")}</button>
          </div>
        </div>
        <div id="fbar">${filterBarHtml(DEFAULT_FILTERS, filterDefs(list), view, view === "archive" ? archiveCount : upcomingCount)}</div>
      </div>
      <div id="list">${timelineHtml(groups, now, emptyHtml(false, view))}</div>
    </section>
    ${footer(ctx)}
  </div>
</main>
${closingFolder(list, now)}
<div class="scrim" id="scrim"></div>
<aside class="panel" id="panel" role="dialog" aria-modal="true" aria-label="Hackathon details">
  <div class="pbar">
    <button class="icon-btn x-d" id="pClose" aria-label="Close">${icon("caret-double-right")}</button>
    <button class="btn btn-ghost btn-sm" id="pCopy">${icon("copy")}Copy link</button>
    <a class="btn btn-ghost btn-sm reg-d" id="pReg" target="_blank" rel="noopener">Register${icon("arrow-up-right")}</a>
    <span class="sp"></span>
    <button class="icon-btn" id="pPrev" aria-label="Previous hackathon">${icon("caret-up")}</button>
    <button class="icon-btn" id="pNext" aria-label="Next hackathon">${icon("caret-down")}</button>
    <button class="icon-btn x-m" id="pClose2" aria-label="Close">${icon("x")}</button>
  </div>
  <div class="pscroll" id="pBody"></div>
  <div class="pfoot"><a class="btn btn-primary" id="pRegM" target="_blank" rel="noopener"></a></div>
</aside>
<div class="menu" id="menu" role="listbox"></div>
<div class="menu-scrim" id="menuScrim"></div>`;
  return layout(ctx, {
    title: view === "archive" ? "Archive · arinjilley?" : "arinjilley? · hackathons, sorted by deadline",
    description:
      "Hackathons worth applying to, checked by the arinjilley? club and sorted by registration deadline.",
    path: view === "archive" ? "/archive" : "/",
    page: "home",
    current: view === "archive" ? "archive" : "home",
    body,
    data: { listings: list, view, now },
  });
}

export function detailPage(ctx: PageCtx, h: WebListing, now: number): string {
  const host = h.registerUrl ? new URL(h.registerUrl).host.replace(/^www\./, "") : null;
  const body = `<main class="page-detail">
  <a href="/" class="back">${icon("arrow-left")}All hackathons</a>
  ${detailHtml(h, now)}
</main>
${h.registerUrl ? `<div class="page-cta"><a class="btn btn-primary" href="${esc(h.registerUrl)}" target="_blank" rel="noopener">Register on ${esc(host)}${icon("arrow-up-right")}</a></div>` : ""}
<div class="wrap">${footer(ctx)}</div>`;
  const desc =
    h.summary ??
    `${h.title}${h.organiser ? ` by ${h.organiser}` : ""}. Listed on arinjilley?, hackathons sorted by deadline.`;
  return layout(ctx, {
    title: `${h.title} · arinjilley?`,
    description: desc,
    path: `/h/${h.slug}`,
    page: "detail",
    ogImage: h.posterUrl,
    body,
  });
}

export function aboutPage(ctx: PageCtx): string {
  const body = `<main class="prose">
  <div class="eyebrow mono">ABOUT THE CLUB</div>
  <h1 class="display">Hackathons, <span class="acc">found for you.</span></h1>
  <p><b>arinjilley?</b> is a student-run club. We keep an eye on hackathons, ideathons and coding challenges, check the details, and share the ones worth your time.</p>
  <p>Everything here is sorted by registration deadline, because the most common way to miss a great hackathon is to find out about it a day too late.</p>
  <h2>How it works</h2>
  <ul>
    <li>Our admins post new hackathons in the WhatsApp group and here at the same time.</li>
    <li>Every listing is checked by a person before it goes live. Still, rules and dates change, so always confirm on the organiser's page.</li>
    <li>After the deadline passes, listings move to the <a href="/archive">archive</a>.</li>
  </ul>
  <h2>Get the app</h2>
  <p>arinjilley? works as an app on your phone: its own icon, full screen, and the board stays readable even with no signal.</p>
  <ul>
    <li><b>Android (Chrome):</b> tap <button class="link-btn" data-install hidden>Install app</button><span class="install-fallback">the ⋮ menu, then <b>Install app</b> (or <b>Add to Home screen</b>)</span>.</li>
    <li><b>iPhone (Safari):</b> tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
    <li><b>Laptop (Chrome or Edge):</b> click the install icon at the right end of the address bar.</li>
  </ul>
  <h2>Know a hackathon we missed?</h2>
  <p>Tell us in the WhatsApp group and we'll take a look.</p>
  <p><a class="btn btn-primary" href="${esc(ctx.groupUrl)}" target="_blank" rel="noopener">${icon("whatsapp-logo")}Join the WhatsApp group</a></p>
</main>
<div class="wrap">${footer(ctx)}</div>`;
  return layout(ctx, {
    title: "About · arinjilley?",
    description: "arinjilley? is a student-run club that finds hackathons and lists them by deadline.",
    path: "/about",
    page: "other",
    current: "about",
    body,
  });
}

export function notFoundPage(ctx: PageCtx, path: string): string {
  const body = `<main class="nf">
  <div class="code mono">404 · GATE NOT FOUND</div>
  <h1 class="display">This flight doesn't exist.</h1>
  <p>The page you're looking for has departed, or it was never on the board.</p>
  <a class="btn btn-primary" href="/">${icon("arrow-left")}Back to the board</a>
</main>
<div class="wrap">${footer(ctx)}</div>`;
  return layout(ctx, {
    title: "Not found · arinjilley?",
    description: "This page doesn't exist.",
    path,
    page: "other",
    body,
    noindex: true,
  });
}

export function errorPage(ctx: PageCtx, path: string): string {
  const body = `<main class="nf">
  <div class="code mono">500 · DELAYED</div>
  <h1 class="display">Something went wrong.</h1>
  <p>We've been notified and are looking into it. Try again in a minute.</p>
  <a class="btn btn-primary" href="/">${icon("arrow-left")}Back to the board</a>
</main>
<div class="wrap">${footer(ctx)}</div>`;
  return layout(ctx, {
    title: "Something went wrong · arinjilley?",
    description: "Something went wrong.",
    path,
    page: "other",
    body,
    noindex: true,
  });
}
