// Saved hackathons ("your folder"). Stored only in this browser (localStorage): no accounts, nothing on the
// server. Any element with data-save="<slug>" is a Save toggle. On the home page the corner folder shows the
// saved posters; opened, it lists them with live countdowns, Register and Remove. With nothing saved yet it
// falls back to the hackathons closing soonest, so it's never empty.
import { boardStatus, deadlineInstant } from "@arinjilley/core";
import { folderCards } from "../shared/folder";
import type { WebListing } from "../shared/listing";
import { art, esc, icon } from "../shared/render";

const KEY = "arj-saved";

interface Entry {
  s: string; // slug
  t: number; // when it was saved
}

function read(): Entry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.s === "string") : [];
  } catch {
    return [];
  }
}
function write(list: Entry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode or storage full: saving just won't stick */
  }
}

export const savedSlugs = () => read().map((e) => e.s);
export const isSaved = (slug: string) => read().some((e) => e.s === slug);

function setSaved(slug: string, on: boolean) {
  const list = read().filter((e) => e.s !== slug);
  if (on) list.push({ s: slug, t: Date.now() });
  write(list);
}

/** Updates every Save toggle on the page to match what's saved. */
export function syncSaveButtons(root: Document | Element = document) {
  const saved = new Set(savedSlugs());
  for (const b of root.querySelectorAll<HTMLElement>("[data-save]")) {
    const on = saved.has(b.dataset.save!);
    b.setAttribute("aria-pressed", String(on));
    b.classList.toggle("on", on);
    const ic = b.querySelector(".i");
    if (ic) ic.outerHTML = icon(on ? "bookmark-simple-fill" : "bookmark-simple");
    const label = b.querySelector(".save-l");
    if (label) label.textContent = on ? "Saved" : "Save";
    if (b.classList.contains("save"))
      b.setAttribute("aria-label", `${on ? "Remove from" : "Save to"} your folder`);
  }
}

const changeHandlers: (() => void)[] = [];

/** Save toggles on every page. `toast` confirms each change. */
export function setupSaving(toast: (message: string) => void) {
  syncSaveButtons();
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-save]");
    if (!b?.dataset.save) return;
    e.preventDefault();
    e.stopPropagation();
    const on = !isSaved(b.dataset.save);
    setSaved(b.dataset.save, on);
    syncSaveButtons();
    const home = !!document.getElementById("folder");
    toast(
      on
        ? home
          ? "Saved to your folder"
          : "Saved. It's in your folder on the home page."
        : "Removed from your folder",
    );
    for (const fn of changeHandlers) fn();
  });
  // Another tab saved or removed something.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    syncSaveButtons();
    for (const fn of changeHandlers) fn();
  });
}

// ── The folder (home page only) ──

function closesAt(h: WebListing): number | null {
  return h.deadline ? deadlineInstant(h.deadline) : null;
}

/** Soonest deadline first; rolling ones after; anything already closed last. */
function byDeadline(now: number) {
  return (a: WebListing, b: WebListing) => {
    const rank = (h: WebListing) => {
      const c = closesAt(h);
      return c == null ? (boardStatus(h, now) === "archived" ? 3e15 : 2e15) : c > now ? c : 4e15 + c;
    };
    return rank(a) - rank(b);
  };
}

function countdownLine(h: WebListing, now: number): string {
  const c = closesAt(h);
  if (c != null && c > now) return `<span class="ti-cd mono" data-cd="${c}" data-fmt="in"></span>`;
  if (c != null || boardStatus(h, now) === "archived")
    return `<span class="ti-cd mono done">Registration closed</span>`;
  return `<span class="ti-cd mono">No fixed deadline</span>`;
}

/** One .ics file with every upcoming saved deadline, each with a reminder a day before. */
function deadlinesIcs(list: WebListing[], now: number): string | null {
  const stamp = (t: number) =>
    new Date(t)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
  const events = list
    .filter((h) => (closesAt(h) ?? 0) > now)
    .map((h) => {
      const c = closesAt(h)!;
      return [
        "BEGIN:VEVENT",
        `UID:${h.slug}-deadline@arinjilley`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${stamp(c - 30 * 60_000)}`,
        `DTEND:${stamp(c)}`,
        `SUMMARY:${icsText(`Registration closes: ${h.title}`)}`,
        h.registerUrl ? `URL:${h.registerUrl}` : "",
        `DESCRIPTION:${icsText(`${h.registerUrl ? `Register: ${h.registerUrl}\n` : ""}${location.origin}/h/${h.slug}`)}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${icsText(`${h.title} closes tomorrow`)}`,
        "TRIGGER:-PT24H",
        "END:VALARM",
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n");
    });
  if (!events.length) return null;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//arinjilley//saved deadlines//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function setupFolder(listings: WebListing[], tick: () => void) {
  const folder = document.getElementById("folder");
  const toggle = document.getElementById("folderBtn");
  const pill = document.getElementById("fdPill");
  const tray = document.getElementById("tray");
  const scrim = document.getElementById("trayScrim");
  if (!folder || !toggle || !pill || !tray || !scrim) return;
  const bySlug = new Map(listings.map((h) => [h.slug, h]));
  let items: WebListing[] = [];
  let mode: "saved" | "soon" | "none" = "none";

  function compute() {
    const now = Date.now();
    const saved = savedSlugs()
      .map((s) => bySlug.get(s))
      .filter((h): h is WebListing => !!h);
    if (saved.length) {
      mode = "saved";
      items = saved.sort(byDeadline(now));
      return;
    }
    items = listings
      .filter((h) => (closesAt(h) ?? 0) > now)
      .sort(byDeadline(now))
      .slice(0, 3);
    mode = items.length ? "soon" : "none";
  }

  function render() {
    compute();
    const now = Date.now();
    folder!.classList.toggle("none", mode === "none");
    pill!.classList.toggle("none", mode === "none");
    folder!.classList.toggle("has-saved", mode === "saved");
    pill!.classList.toggle("has-saved", mode === "saved");
    const label = mode === "saved" ? `SAVED · ${items.length}` : "CLOSING SOON";
    document.getElementById("fdLabel")!.textContent = label;
    document.getElementById("fdPillLabel")!.textContent =
      mode === "saved" ? `Saved · ${items.length}` : "Closing soon";
    toggle!.textContent = mode === "saved" ? `Your folder: ${items.length} saved` : "Hackathons closing soon";
    const posters = items.slice(0, 3).map((h) => art(h));
    document.getElementById("fdCards")!.innerHTML = folderCards(posters);

    const rows = items
      .map((h) => {
        const st = boardStatus(h, now);
        return `<li class="ti${st === "archived" || st === "closed" ? " done" : ""}">
  <a class="ti-main" href="/h/${esc(h.slug)}" data-slug="${esc(h.slug)}"><span class="ti-thumb">${art(h)}</span><span class="ti-txt"><span class="ti-title">${esc(h.title)}</span>${countdownLine(h, now)}</span></a>
  ${h.registerUrl ? `<a class="icon-btn" href="${esc(h.registerUrl)}" target="_blank" rel="noopener" aria-label="Register for ${esc(h.title)}">${icon("arrow-up-right")}</a>` : ""}
  ${mode === "saved" ? `<button type="button" class="icon-btn" data-unsave="${esc(h.slug)}" aria-label="Remove ${esc(h.title)}">${icon("x")}</button>` : ""}
</li>`;
      })
      .join("");
    const ics = mode === "saved" && items.some((h) => (closesAt(h) ?? 0) > now);
    tray!.innerHTML = `<div class="tray-h">
  <div><b>${mode === "saved" ? "Your folder" : "Closing soon"}</b><span class="mono">${mode === "saved" ? `${items.length} SAVED` : "NEXT 3 DEADLINES"}</span></div>
  <button type="button" class="icon-btn" id="trayX" aria-label="Close">${icon("x")}</button>
</div>
<ul class="tray-list">${rows}</ul>
<div class="tray-f">${
      mode === "saved"
        ? ics
          ? `<button type="button" class="btn btn-ghost btn-sm" id="trayIcs">${icon("calendar-plus")}Add all deadlines to calendar</button>`
          : ""
        : `<p>Tap ${icon("bookmark-simple")} on any hackathon to save it here.</p>`
    }<p class="tray-note">Saved on this device only.</p></div>`;
    tick();
  }

  const isOpen = () => folder!.classList.contains("open");
  function setOpen(open: boolean) {
    if (open) render();
    folder!.classList.toggle("open", open);
    tray!.classList.toggle("on", open);
    scrim!.classList.toggle("on", open);
    toggle!.setAttribute("aria-expanded", String(open));
    pill!.setAttribute("aria-expanded", String(open));
    if (open) tray!.querySelector<HTMLElement>(".ti-main, #trayX")?.focus({ preventScroll: true });
  }

  toggle.addEventListener("click", () => setOpen(!isOpen()));
  pill.addEventListener("click", () => setOpen(!isOpen()));
  scrim.addEventListener("click", () => setOpen(false));
  tray.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#trayX")) return setOpen(false);
    const un = t.closest<HTMLElement>("[data-unsave]");
    if (un) {
      setSaved(un.dataset.unsave!, false);
      syncSaveButtons();
      render();
      if (mode !== "saved") setOpen(false);
      return;
    }
    if (t.closest("#trayIcs")) {
      const ics = deadlinesIcs(items, Date.now());
      if (!ics) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
      a.download = "arinjilley-deadlines.ics";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      return;
    }
    // A hackathon in the list: close the tray and let the page open its details.
    if (t.closest(".ti-main")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
      (getComputedStyle(pill).display === "none" ? toggle : pill).focus();
    }
  });
  document.addEventListener("click", (e) => {
    const t = e.target as Node;
    if (isOpen() && !tray.contains(t) && !folder.contains(t) && !pill.contains(t)) setOpen(false);
  });

  // Laptops: out of the way while the hero (which already shows posters) is on screen. Phones: always shown.
  const hero = document.getElementById("hero");
  const phone = matchMedia("(max-width: 720px)");
  if (hero && "IntersectionObserver" in window) {
    let heroOnScreen = false;
    const update = () => {
      const away = heroOnScreen && !phone.matches;
      folder.classList.toggle("away", away);
      pill.classList.toggle("away", away);
      if (away && isOpen()) setOpen(false);
    };
    new IntersectionObserver(([entry]) => {
      heroOnScreen = !!entry?.isIntersecting;
      update();
    }).observe(hero);
    phone.addEventListener("change", update);
  } else {
    folder.classList.remove("away");
    pill.classList.remove("away");
  }

  // Fade away at the footer, so the folder never covers its links.
  const foot = document.querySelector(".foot");
  if (foot && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      const atFoot = !!entry?.isIntersecting;
      folder.classList.toggle("at-foot", atFoot);
      pill.classList.toggle("at-foot", atFoot);
    }).observe(foot);
  }

  changeHandlers.push(() => {
    render();
    // A little bounce so you see where it went.
    for (const el of [folder, pill]) {
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  });
  render();
}
