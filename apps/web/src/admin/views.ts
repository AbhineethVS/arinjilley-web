// Admin page HTML (SPEC §8.5): login, listings dashboard, add/edit form, admins. Same design system as the
// public site; client/admin.ts adds the interactive parts (login polling, live previews, Fill with AI, saving).
import { boardStatus, countdown, deadlineInstant, fullDate, type Hackathon } from "@arinjilley/core";
import { POSTER_CSS } from "@arinjilley/core/poster";
import { LOGO_MARK } from "../../shared/brand";
import type { ListingForm } from "../../shared/form";
import { esc, icon } from "../../shared/render";
import type { Admin } from "./session";

const BACKSLASH_U = `${String.fromCharCode(92)}u`;
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, `${BACKSLASH_U}003c`);

function layout(o: {
  title: string;
  page: string;
  admin: Admin | null;
  body: string;
  data?: unknown;
}): string {
  const nav = o.admin
    ? `<nav class="nav" aria-label="Admin">
        <a href="/admin">Listings</a>
        <a href="/admin/new">New</a>
        ${o.admin.role === "owner" ? '<a href="/admin/admins">Admins</a>' : ""}
        <a href="/" target="_blank" rel="noopener">View site</a>
      </nav>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)} · arinjilley? admin</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#161618">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/admin.webmanifest">
<link rel="apple-touch-icon" href="/icons/admin-192.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="arj? admin">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="stylesheet" href="/site.css?v=${__BUILD_ID__}">
<link rel="stylesheet" href="/admin.css?v=${__BUILD_ID__}">
<style>${POSTER_CSS}</style>
</head>
<body data-page="${o.page}">
<header class="top scrolled">
  <div class="wrap top-in">
    <a href="/admin" class="logo">${LOGO_MARK}<span>arinjilley<span class="q">?</span></span><span class="admin-badge mono">ADMIN</span></a>
    ${nav}
    ${o.admin ? `<form class="top-right" method="post" action="/admin/logout"><span class="who mono">${esc(o.admin.name ?? (o.admin.role === "owner" ? "Owner" : "Admin"))}</span><button class="btn btn-ghost btn-sm" type="submit">Log out</button></form>` : ""}
  </div>
</header>
${o.body}
<div class="toast" id="toast" role="status"></div>
${o.data !== undefined ? `<script type="application/json" id="data">${safeJson(o.data)}</script>` : ""}
<script src="/admin.js?v=${__BUILD_ID__}" defer></script>
</body>
</html>`;
}

export function loginView(botUsername: string): string {
  return layout({
    title: "Log in",
    page: "admin-login",
    admin: null,
    data: { bot: botUsername },
    body: `<main class="login">
  <div class="login-card">
    <div class="eyebrow mono">ADMIN</div>
    <h1 class="display">Log in with Telegram</h1>
    <p>Only arinjilley? admins can get in. You'll confirm in Telegram, and this page continues on its own.</p>
    <a class="btn btn-primary" id="loginBtn" href="#" target="_blank" rel="noopener" aria-disabled="true">${icon("telegram-logo", "i tg")}Log in with Telegram</a>
    <p class="login-status mono" id="loginStatus">Preparing…</p>
    <ol class="login-steps">
      <li>Tap the button. Telegram opens <b>@${esc(botUsername)}</b>.</li>
      <li>Tap <b>Start</b>.</li>
      <li>Come back here. You'll be logged in for 30 days.</li>
    </ol>
  </div>
</main>`,
  });
}

// ── Dashboard ──

export type Tab = "drafts" | "live" | "archive" | "discarded";

export interface DashRow {
  h: Hackathon;
  posterHtml: string;
  updatedAt: number;
  extractedBy: string | null;
}

function ago(ms: number): string {
  const s = Math.max(0, Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export function tabOf(h: Hackathon, now: number): Tab {
  if (h.status === "discarded") return "discarded";
  if (h.status === "draft") return "drafts";
  return boardStatus(h, now) === "archived" ? "archive" : "live";
}

export function dashboardView(
  admin: Admin,
  rows: DashRow[],
  tab: Tab,
  counts: Record<Tab, number>,
  now: number,
): string {
  const tabs: [Tab, string][] = [
    ["drafts", "Drafts"],
    ["live", "Live"],
    ["archive", "Archive"],
    ["discarded", "Discarded"],
  ];
  const list = rows.length
    ? rows
        .map(({ h, posterHtml, updatedAt, extractedBy }) => {
          const closes = h.deadline ? deadlineInstant(h.deadline) : null;
          const when = closes
            ? `${closes > now ? `Closes ${fullDate({ at: closes, dateOnly: false })} · in ${countdown(closes - now)}` : `Closed ${fullDate({ at: closes, dateOnly: false })}`}`
            : "No fixed deadline";
          const source =
            extractedBy === "manual"
              ? "added by hand"
              : extractedBy === "rules"
                ? "basic fill"
                : "from the bot";
          return `<a class="arow" href="/admin/h/${esc(h.id)}" data-search="${esc(`${h.title} ${h.organiser ?? ""} ${h.city ?? ""}`.toLowerCase())}">
  <div class="arow-thumb">${posterHtml}</div>
  <div class="arow-body">
    <div class="arow-title">${esc(h.title)}</div>
    <div class="arow-meta">${esc(when)}</div>
    <div class="arow-meta dim">${esc(h.organiser ?? "No organiser")} · updated ${ago(updatedAt)} · ${source}</div>
  </div>
  ${h.status === "live" ? `<span class="arow-view" data-href="/h/${esc(h.slug)}" title="View on the site">${icon("arrow-up-right")}</span>` : ""}
</a>`;
        })
        .join("")
    : `<div class="empty"><b>Nothing here</b>${tab === "drafts" ? "Drafts from the bot and the New button show up here." : "No listings in this tab yet."}</div>`;

  return layout({
    title: "Listings",
    page: "admin-dash",
    admin,
    body: `<main class="wrap admin">
  <div class="admin-head">
    <h1 class="display">Listings</h1>
    <a class="btn btn-primary" href="/admin/new">${icon("calendar-plus")}New hackathon</a>
  </div>
  <div class="admin-tabs">
    ${tabs.map(([k, label]) => `<a href="/admin?tab=${k}" class="atab${k === tab ? " on" : ""}">${label}<span class="mono">${counts[k]}</span></a>`).join("")}
    <label class="asearch">${icon("magnifying-glass")}<input id="asearch" type="search" placeholder="Search" autocomplete="off"></label>
  </div>
  <div class="arows" id="arows">${list}</div>
</main>`,
  });
}

// ── Editor ──

export interface EditorData {
  id: string | null;
  slug: string | null;
  status: "draft" | "live" | "discarded" | null;
  form: ListingForm;
  siteUrl: string;
  groupUrl: string;
  posterImageUrl: string | null; // custom poster preview
  posterStatus: string | null;
}

const field = (id: string, label: string, input: string, hint = "") =>
  `<div class="f"><label for="${id}">${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
const inp = (id: string, attrs = "") => `<input id="${id}" name="${id}" ${attrs}>`;
const area = (id: string, rows: number, attrs = "") =>
  `<textarea id="${id}" name="${id}" rows="${rows}" ${attrs}></textarea>`;
const dateTime = (id: string, label: string, hint = "") =>
  `<div class="f"><label for="${id}Date">${label} <span class="dim">(IST)</span></label><div class="dt"><input id="${id}Date" type="date"><input id="${id}Time" type="time" aria-label="${label} time"></div>${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;

export function editorView(admin: Admin, data: EditorData): string {
  const isNew = !data.id;
  const title = isNew ? "New hackathon" : data.form.title || "Edit listing";
  return layout({
    title,
    page: "admin-edit",
    admin,
    data,
    body: `<main class="wrap admin">
  <a href="/admin" class="back">${icon("arrow-left")}All listings</a>
  <div class="admin-head">
    <h1 class="display" id="edTitle">${esc(title)}</h1>
    ${data.status ? `<span class="pill ${data.status === "live" ? "open" : data.status === "draft" ? "last" : "closed"}" id="edStatus">${data.status === "live" ? "LIVE" : data.status === "draft" ? "DRAFT" : "DISCARDED"}</span>` : ""}
  </div>

  <div class="editor">
    <form class="ed-form" id="edForm" novalidate autocomplete="off">
      <section class="ai-box">
        <div class="ai-head"><b>Fill with AI</b><span class="dim">Paste the WhatsApp post or a registration link. It fills the form; check everything before saving.</span></div>
        ${area("aiText", 4, 'placeholder="Paste the post or a link…"')}
        <div class="ai-actions"><button type="button" class="btn btn-ghost btn-sm" id="aiBtn">Fill the form</button><span class="hint" id="aiStatus"></span></div>
      </section>

      <section class="fs"><h2>Basics</h2>
        ${field("title", "Title", inp("title", 'required maxlength="90" placeholder="e.g. COLOSSUS 3.0"'))}
        ${field("organiser", "Organiser", inp("organiser", 'maxlength="80" placeholder="e.g. Techfest, IIT Bombay"'))}
        ${field("summary", "About", area("summary", 3, 'maxlength="500" placeholder="1–2 sentences on what participants do"'))}
        ${field("howItWorks", "How it works", area("howItWorks", 3, 'placeholder="One step per line (up to 4)"'), "Optional. One step per line.")}
      </section>

      <section class="fs"><h2>When</h2>
        ${dateTime("deadline", "Registration closes", "Leave the date empty if there's no fixed deadline (shown as Rolling).")}
        <div class="row2">${dateTime("start", "Starts")}${dateTime("end", "Ends")}</div>
      </section>

      <section class="fs"><h2>Where</h2>
        <div class="f"><label>Mode</label><div class="seg2" role="radiogroup" id="mode">
          <button type="button" data-v="online">Online</button><button type="button" data-v="offline">In person</button><button type="button" data-v="hybrid">Hybrid</button>
        </div></div>
        <div class="row2">${field("city", "City", inp("city", 'maxlength="40" placeholder="e.g. Kochi"'))}${field("venue", "Venue", inp("venue", 'maxlength="80" placeholder="e.g. CUSAT, Kochi"'))}</div>
      </section>

      <section class="fs"><h2>Details</h2>
        <div class="row2">${field("teamMin", "Team size: min", inp("teamMin", 'type="number" min="1" max="50" inputmode="numeric" placeholder="1"'))}${field("teamMax", "Team size: max", inp("teamMax", 'type="number" min="1" max="50" inputmode="numeric" placeholder="4"'))}</div>
        ${field("eligibility", "Who can join", inp("eligibility", 'maxlength="120" placeholder="e.g. UG/PG students with a college ID"'))}
        <div class="row2">${field("feeText", "Fee", inp("feeText", 'maxlength="80" placeholder="e.g. Free, or ₹200 per team"'))}<div class="f"><label>&nbsp;</label><label class="check"><input type="checkbox" id="isFree"> Free to enter</label></div></div>
        ${field("prizeText", "Prizes", area("prizeText", 5, 'maxlength="600" placeholder="One prize per line, e.g.\nWinner: ₹75,000\nRunner-up: ₹35,000\nSpecial awards for the best UI and best pitch"'), "One prize per line. Any text: amounts, gadgets, internships, swag.")}
        <div class="row2">${field("prizeShort", "Poster prize label", inp("prizeShort", 'maxlength="8" placeholder="₹1L+"'), "Max 8 characters. Filled automatically if empty.")}<div></div></div>
        ${field("themes", "Themes", inp("themes", 'placeholder="AI, FinTech, Hardware"'), "Comma separated, up to 5.")}
      </section>

      <section class="fs"><h2>Links</h2>
        ${field("registerUrl", "Register link", inp("registerUrl", 'type="url" placeholder="https://…"'))}
        ${field("moreInfoUrl", "More info link", inp("moreInfoUrl", 'type="url" placeholder="Optional"'))}
      </section>
    </form>

    <aside class="ed-side">
      <section class="fs"><h2>Poster</h2>
        <div class="seg2" id="posterKind"><button type="button" data-v="generated">Generated</button><button type="button" data-v="custom">Your image</button></div>
        <div class="poster-preview" id="posterPreview"></div>
        <div class="poster-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="shuffleBtn">Shuffle style</button>
          <label class="btn btn-ghost btn-sm" id="uploadLbl">Upload image<input type="file" id="uploadInput" accept="image/jpeg,image/png,image/webp" hidden></label>
        </div>
        <div class="hint" id="posterHint"></div>
      </section>
      <section class="fs"><h2>WhatsApp text</h2>
        <pre class="wa" id="waText"></pre>
        <button type="button" class="btn btn-ghost btn-sm" id="copyWa">${icon("copy")}Copy text</button>
      </section>
    </aside>
  </div>

  <div class="ed-bar" id="edBar">
    <span class="ed-msg mono" id="edMsg"></span>
    <span class="sp"></span>
    ${isNew ? "" : `<button type="button" class="btn btn-ghost btn-sm danger" id="discardBtn">${data.status === "discarded" ? "Restore" : "Delete"}</button>`}
    ${data.status === "live" ? `<button type="button" class="btn btn-ghost" id="unpublishBtn">Unpublish</button>` : ""}
    <button type="button" class="btn btn-ghost" id="saveBtn">${data.status === "live" ? "Save changes" : "Save draft"}</button>
    ${data.status === "live" ? "" : `<button type="button" class="btn btn-primary" id="publishBtn">Publish</button>`}
  </div>
</main>`,
  });
}

// ── Admins (owner only) ──

export function adminsView(
  admin: Admin,
  ownerId: number,
  rows: { telegramId: number; name: string | null; createdAt: number }[],
): string {
  return layout({
    title: "Admins",
    page: "admin-admins",
    admin,
    body: `<main class="wrap admin narrow">
  <div class="admin-head"><h1 class="display">Admins</h1></div>
  <p class="dim">Admins can use the bot and this page. To add someone, ask them to send /start to the bot; it shows their Telegram ID.</p>
  <div class="arows">
    <div class="arow static"><div class="arow-body"><div class="arow-title">Owner</div><div class="arow-meta mono">${ownerId}</div></div></div>
    ${rows
      .map(
        (r) =>
          `<div class="arow static"><div class="arow-body"><div class="arow-title">${esc(r.name ?? "(no name)")}</div><div class="arow-meta mono">${r.telegramId}</div></div><button class="btn btn-ghost btn-sm danger" data-remove="${r.telegramId}">Remove</button></div>`,
      )
      .join("")}
  </div>
  <form class="add-admin" id="addAdmin">
    <h2>Add an admin</h2>
    <div class="row2">${field("newId", "Telegram ID", inp("newId", 'inputmode="numeric" placeholder="e.g. 123456789" required'))}${field("newName", "Name", inp("newName", 'maxlength="60" placeholder="e.g. Asil"'))}</div>
    <button class="btn btn-primary" type="submit">Add admin</button>
  </form>
</main>`,
  });
}
