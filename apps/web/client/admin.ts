// Admin page script: login polling, dashboard search, the listing editor (live poster + WhatsApp previews,
// Fill with AI, image upload, save/publish) and the admins page.

import { type Hackathon, shortPrize, slugify, whatsappText } from "@arinjilley/core";
import { posterMarkup, shuffleStyle } from "@arinjilley/core/poster";
import { type DateParts, fromParts, type ListingForm, type PosterChoice } from "../shared/form";
import { setupPwa } from "./pwa";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const page = document.body.dataset.page;

let toastTimer: number | undefined;
function toast(message: string) {
  const t = $("toast");
  if (!t) return;
  t.textContent = message;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("on"), 2400);
}

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string; data?: T }> {
  try {
    const res = await fetch(path, {
      ...init,
      headers:
        init.body instanceof FormData
          ? init.headers
          : { "content-type": "application/json", ...init.headers },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (res.status === 401) {
      return {
        ok: false,
        error: "Your session ended. Open the admin page in a new tab, log in, then try again.",
      };
    }
    return res.ok
      ? { ok: true, data }
      : { ok: false, error: data.error ?? `Something went wrong (${res.status}).`, data };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection." };
  }
}

const data = () => JSON.parse($("data")?.textContent ?? "null");

// ── Login ──

function initLogin() {
  const btn = $<HTMLAnchorElement>("loginBtn")!;
  const status = $("loginStatus")!;
  let polling = false;

  async function prepare() {
    btn.setAttribute("aria-disabled", "true");
    status.textContent = "Preparing…";
    const r = await api<{ link: string }>("/admin/login/start", { method: "POST" });
    if (!r.ok) {
      status.textContent = r.error;
      return;
    }
    btn.href = r.data.link;
    btn.removeAttribute("aria-disabled");
    status.textContent = "Tap the button to continue in Telegram.";
  }

  async function poll() {
    if (polling) return;
    polling = true;
    status.textContent = "Waiting for you to tap Start in Telegram…";
    const started = Date.now();
    while (Date.now() - started < 10 * 60_000) {
      await new Promise((r) => setTimeout(r, 2000));
      const r = await api<{ status: string }>("/admin/login/poll");
      if (!r.ok) continue;
      if (r.data.status === "ok") {
        status.textContent = "Logged in. Loading…";
        location.reload();
        return;
      }
      if (r.data.status === "denied") {
        status.textContent = "That Telegram account isn't an arinjilley? admin.";
        polling = false;
        return;
      }
      if (r.data.status === "expired") {
        polling = false;
        status.textContent = "That link expired. Tap the button again.";
        await prepare();
        return;
      }
    }
    polling = false;
  }

  btn.addEventListener("click", (e) => {
    if (btn.getAttribute("aria-disabled") === "true") {
      e.preventDefault();
      return;
    }
    void poll();
  });
  void prepare();
}

// ── Dashboard ──

function initDashboard() {
  const input = $<HTMLInputElement>("asearch");
  input?.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    for (const row of document.querySelectorAll<HTMLElement>(".arow[data-search]")) {
      row.hidden = !!q && !row.dataset.search!.includes(q);
    }
  });
  document.addEventListener("click", (e) => {
    const view = (e.target as HTMLElement).closest<HTMLElement>(".arow-view");
    if (view) {
      e.preventDefault();
      e.stopPropagation();
      window.open(view.dataset.href, "_blank", "noopener");
    }
  });
}

// ── Editor ──

interface EditorData {
  id: string | null;
  slug: string | null;
  status: "draft" | "live" | "discarded" | null;
  form: ListingForm;
  siteUrl: string;
  groupUrl: string;
  posterImageUrl: string | null;
  posterStatus: string | null;
}

const TEXT_FIELDS = [
  "title",
  "organiser",
  "summary",
  "howItWorks",
  "city",
  "venue",
  "teamMin",
  "teamMax",
  "eligibility",
  "feeText",
  "prizeText",
  "prizeShort",
  "themes",
  "registerUrl",
  "moreInfoUrl",
] as const;
const DATE_FIELDS = ["deadline", "start", "end"] as const;

function initEditor() {
  const d = data() as EditorData;
  let id = d.id;
  let status = d.status;
  let mode = d.form.mode;
  let poster: PosterChoice = d.form.poster;
  let posterUrl = d.posterImageUrl;
  let extractedBy = d.form.extractedBy;
  let sourceText = d.form.sourceText;
  const val = (f: string) => $<HTMLInputElement | HTMLTextAreaElement>(f)!;

  function fill(form: ListingForm) {
    for (const k of TEXT_FIELDS) val(k).value = form[k] ?? "";
    for (const k of DATE_FIELDS) {
      val(`${k}Date`).value = form[k].date;
      val(`${k}Time`).value = form[k].time;
    }
    $<HTMLInputElement>("isFree")!.checked = form.isFree;
    mode = form.mode;
  }

  function read(): ListingForm {
    const out = {} as ListingForm;
    for (const k of TEXT_FIELDS) (out as unknown as Record<string, string>)[k] = val(k).value;
    for (const k of DATE_FIELDS)
      out[k] = { date: val(`${k}Date`).value, time: val(`${k}Time`).value } as DateParts;
    out.isFree = $<HTMLInputElement>("isFree")!.checked;
    out.mode = mode;
    out.poster = poster;
    if (extractedBy) out.extractedBy = extractedBy;
    if (sourceText) out.sourceText = sourceText;
    return out;
  }

  /** A listing-shaped object from the form, for the live poster and WhatsApp previews. */
  function asListing(f: ListingForm): Hackathon {
    const num = (s: string) => (s.trim() ? Number(s) : null);
    const list = (s: string) =>
      s
        .split(/[,\n]+/)
        .map((x) => x.trim())
        .filter(Boolean);
    const url = (s: string) =>
      s.trim() ? (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`) : null;
    return {
      id: id ?? "new",
      slug: d.slug ?? slugify(f.title || "hackathon"),
      status: status ?? "draft",
      title: f.title.trim() || "Untitled hackathon",
      organiser: f.organiser.trim() || null,
      summary: f.summary.trim() || null,
      howItWorks: f.howItWorks
        .split(/\n+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 4),
      mode: f.mode,
      city: f.mode === "online" ? null : f.city.trim() || null,
      venue: f.venue.trim() || null,
      deadline: fromParts(f.deadline),
      start: fromParts(f.start),
      end: fromParts(f.end),
      teamMin: num(f.teamMin),
      teamMax: num(f.teamMax),
      eligibility: f.eligibility.trim() || null,
      feeText: f.feeText.trim() || null,
      isFree: f.isFree,
      prizeText: f.prizeText.trim() || null,
      prizeShort: f.prizeShort.trim() || shortPrize(f.prizeText) || null,
      themes: list(f.themes).slice(0, 5),
      registerUrl: url(f.registerUrl),
      moreInfoUrl: url(f.moreInfoUrl),
      brochureUrl: null,
      posterKind: poster.kind,
      posterStyle: poster.kind === "generated" ? poster.style : 0,
      posterFileId: null,
      createdBy: null,
      createdAt: 0,
      updatedAt: 0,
      publishedAt: null,
    };
  }

  const previewEl = $("posterPreview")!;
  const waEl = $("waText")!;
  function render() {
    const f = read();
    const h = asListing(f);
    previewEl.innerHTML =
      poster.kind === "custom" && posterUrl ? `<img src="${posterUrl}" alt="Poster">` : posterMarkup(h);
    waEl.textContent = whatsappText(h, { siteUrl: d.siteUrl, groupUrl: d.groupUrl });
    for (const b of document.querySelectorAll<HTMLElement>("#mode button"))
      b.setAttribute("aria-pressed", String(b.dataset.v === mode));
    for (const b of document.querySelectorAll<HTMLElement>("#posterKind button"))
      b.setAttribute("aria-pressed", String(b.dataset.v === poster.kind));
    $("shuffleBtn")!.hidden = poster.kind !== "generated";
    $("posterHint")!.textContent =
      poster.kind === "generated"
        ? d.posterStatus === "pending"
          ? "The poster image for WhatsApp is being made; it'll appear in your bot chat shortly."
          : "Saving makes the poster image and sends it to your chat with the bot, ready for WhatsApp."
        : "Your image is used on the site and for WhatsApp.";
    const deadlineEmpty = !val("deadlineDate").value;
    val("deadlineTime").disabled = deadlineEmpty;
  }

  let timer: number | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(render, 120);
  };

  fill(d.form);
  render();
  let saved = JSON.stringify(read());
  const dirty = () => JSON.stringify(read()) !== saved;
  window.addEventListener("beforeunload", (e) => {
    if (dirty()) e.preventDefault();
  });

  $("edForm")!.addEventListener("input", schedule);
  $("edForm")!.addEventListener("change", schedule);
  $("mode")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button[data-v]");
    if (!b) return;
    mode = b.dataset.v as ListingForm["mode"];
    render();
  });
  $("posterKind")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button[data-v]");
    if (!b) return;
    if (b.dataset.v === "generated")
      poster = {
        kind: "generated",
        style: poster.kind === "generated" ? poster.style : Math.floor(Math.random() * 24),
      };
    else if (poster.kind !== "custom") {
      $<HTMLInputElement>("uploadInput")!.click();
      return;
    }
    render();
  });
  $("shuffleBtn")!.addEventListener("click", () => {
    if (poster.kind === "generated") poster = { kind: "generated", style: shuffleStyle(poster.style) };
    render();
  });
  $<HTMLInputElement>("uploadInput")!.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    $("posterHint")!.textContent = "Uploading…";
    const body = new FormData();
    body.set("file", file);
    const r = await api<{ fileId: string; thumbId: string; url: string }>("/admin/api/upload", {
      method: "POST",
      body,
    });
    if (!r.ok) {
      toast(r.error);
      render();
      return;
    }
    poster = { kind: "custom", fileId: r.data.fileId, thumbId: r.data.thumbId };
    posterUrl = r.data.url;
    render();
    toast("Image uploaded. Save to keep it.");
  });

  $("copyWa")!.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(waEl.textContent ?? "");
      toast("WhatsApp text copied");
    } catch {
      toast("Couldn't copy. Select the text and copy it manually.");
    }
  });

  // Fill with AI
  $("aiBtn")!.addEventListener("click", async () => {
    const text = val("aiText").value.trim();
    const statusEl = $("aiStatus")!;
    if (!text) {
      statusEl.textContent = "Paste the post or a link first.";
      return;
    }
    if (dirty() && read().title && !confirm("Replace what's in the form with what the AI reads?")) return;
    const btn = $<HTMLButtonElement>("aiBtn")!;
    btn.disabled = true;
    statusEl.textContent = "Reading it… (usually 5–15 seconds)";
    const r = await api<{
      isHackathon: boolean;
      reason: string | null;
      source: "openai" | "rules";
      warnings: string[];
      form: ListingForm;
      duplicate: { id: string; title: string; status: string } | null;
      sourceText: string;
    }>("/admin/api/extract", { method: "POST", body: JSON.stringify({ text }) });
    btn.disabled = false;
    if (!r.ok) {
      statusEl.textContent = r.error;
      return;
    }
    fill({ ...r.data.form, poster });
    extractedBy = r.data.source;
    sourceText = r.data.sourceText;
    render();
    const notes = [
      r.data.isHackathon
        ? "Filled in. Check every field before saving."
        : `Filled in, but it doesn't look like a hackathon${r.data.reason ? ` (${r.data.reason})` : ""}.`,
      ...r.data.warnings,
    ];
    statusEl.innerHTML = notes.map((n) => n.replace(/</g, "&lt;")).join("<br>");
    if (r.data.duplicate) {
      statusEl.innerHTML += `<br><b>Already listed:</b> <a href="/admin/h/${r.data.duplicate.id}">${r.data.duplicate.title.replace(/</g, "&lt;")}</a> (${r.data.duplicate.status})`;
    }
  });

  // Saving
  const msg = $("edMsg")!;
  const busy = (on: boolean) => {
    for (const b of document.querySelectorAll<HTMLButtonElement>("#edBar button")) b.disabled = on;
  };

  async function save(): Promise<boolean> {
    const f = read();
    if (!f.title.trim()) {
      msg.textContent = "Add a title first.";
      val("title").focus();
      return false;
    }
    busy(true);
    msg.textContent = "Saving…";
    const r = id
      ? await api<{ id: string; slug: string }>(`/admin/api/listings/${id}`, {
          method: "PUT",
          body: JSON.stringify(f),
        })
      : await api<{ id: string; slug: string }>("/admin/api/listings", {
          method: "POST",
          body: JSON.stringify(f),
        });
    busy(false);
    if (!r.ok) {
      msg.textContent = r.error;
      return false;
    }
    saved = JSON.stringify(f);
    msg.textContent = `Saved ${new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
    if (!id) {
      id = r.data.id;
      history.replaceState(null, "", `/admin/h/${id}`);
    }
    return true;
  }

  async function setStatus(next: "live" | "draft" | "discarded"): Promise<boolean> {
    if (!id) return false;
    busy(true);
    const r = await api(`/admin/api/listings/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status: next }),
    });
    busy(false);
    if (!r.ok) {
      msg.textContent = r.error;
      return false;
    }
    status = next;
    return true;
  }

  $("saveBtn")?.addEventListener("click", async () => {
    const wasNew = !id;
    if ((await save()) && wasNew) location.replace(`/admin/h/${id}`);
  });
  $("publishBtn")?.addEventListener("click", async () => {
    if (!(await save())) return;
    if (await setStatus("live")) {
      saved = JSON.stringify(read());
      location.replace(`/admin/h/${id}?published=1`);
    }
  });
  $("unpublishBtn")?.addEventListener("click", async () => {
    if (dirty() && !(await save())) return;
    if (await setStatus("draft")) location.reload();
  });
  $("discardBtn")?.addEventListener("click", async () => {
    if (status === "discarded") {
      if (await setStatus("draft")) location.reload();
      return;
    }
    if (
      !confirm("Delete this listing? It's removed from the site and moved to Discarded (you can restore it).")
    )
      return;
    if (await setStatus("discarded")) {
      saved = JSON.stringify(read());
      location.replace("/admin?tab=discarded");
    }
  });

  if (new URLSearchParams(location.search).has("published")) {
    toast("Published! It's on the site now.");
    history.replaceState(null, "", location.pathname);
  }
  // Keyboard: Ctrl/Cmd+S saves.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
    }
  });
}

// ── Admins ──

function initAdmins() {
  $("addAdmin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("/admin/api/admins", {
      method: "POST",
      body: JSON.stringify({
        id: $<HTMLInputElement>("newId")!.value,
        name: $<HTMLInputElement>("newName")!.value,
      }),
    });
    if (!r.ok) return toast(r.error);
    location.reload();
  });
  document.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-remove]");
    if (!b || !confirm("Remove this admin? They lose access to the bot and this page right away.")) return;
    const r = await api(`/admin/api/admins/${b.dataset.remove}`, { method: "DELETE" });
    if (!r.ok) return toast(r.error);
    location.reload();
  });
}

// Start whichever page this is (at the end, so every constant above is defined first).
if (page === "admin-login") initLogin();
if (page === "admin-dash") initDashboard();
if (page === "admin-edit") initEditor();
if (page === "admin-admins") initAdmins();
setupPwa(toast);
