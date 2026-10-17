// Browser script. On every page: the flip clock, live countdowns, header border on scroll, copy-link.
// On the home page: filter sentence, search, Upcoming/Archive tabs and the side panel, re-rendering with the
// same functions the server used (shared/render.ts), so what you see never differs from the first load.
import { boardStatus, countdown, istParts } from "@arinjilley/core";
import type { WebListing } from "../shared/listing";
import {
  applyFilters,
  archiveGroups,
  DEFAULT_FILTERS,
  detailHtml,
  emptyHtml,
  esc,
  type FilterState,
  filterDefs,
  icon,
  isFiltered,
  sentenceHtml,
  soonHtml,
  statsHtml,
  timelineHtml,
  upcomingGroups,
} from "../shared/render";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

// ── Shared bits (all pages) ──

let toastTimer: number | undefined;
function toast(message: string) {
  const t = $("toast");
  if (!t) return;
  t.textContent = message;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("on"), 1800);
}

let lastClock = "";
function clock() {
  const el = $("clock");
  if (!el) return;
  const p = istParts(Date.now());
  const s = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  if (s === lastClock) return;
  if (!lastClock) {
    el.innerHTML = [...s].map((c) => `<span class="flap${c === ":" ? " colon" : ""}">${c}</span>`).join("");
  } else {
    [...s].forEach((c, i) => {
      const f = el.children[i] as HTMLElement | undefined;
      if (!f || f.textContent === c) return;
      f.classList.remove("flip");
      void f.offsetWidth;
      f.classList.add("flip");
      window.setTimeout(() => {
        f.textContent = c;
      }, 170);
    });
  }
  lastClock = s;
}

function tickCountdowns() {
  const now = Date.now();
  for (const el of document.querySelectorAll<HTMLElement>("[data-cd]")) {
    const txt = countdown(Number(el.dataset.cd) - now);
    el.textContent =
      el.dataset.fmt === "caps"
        ? `CLOSES IN ${txt.toUpperCase()}`
        : el.dataset.fmt === "in"
          ? `Closes in ${txt}`
          : txt;
  }
}

async function copyLink(url = location.href) {
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    toast("Couldn't copy the link");
  }
}

window.addEventListener("scroll", () => $("top")?.classList.toggle("scrolled", scrollY > 8), {
  passive: true,
});
clock();
window.setInterval(() => {
  clock();
  tickCountdowns();
}, 1000);

// ── Home page ──

if (document.body.dataset.page === "home") initHome();

function initHome() {
  const data = JSON.parse($("data")!.textContent!) as {
    listings: WebListing[];
    view: "upcoming" | "archive";
  };
  const listings = data.listings;
  const bySlug = new Map(listings.map((h) => [h.slug, h]));
  const defs = filterDefs(listings);
  const state: FilterState & { view: "upcoming" | "archive" } = { ...DEFAULT_FILTERS, view: data.view };
  let order: string[] = [];

  const listEl = $("list")!;
  const sentence = $("sentence")!;
  const menu = $("menu")!;
  const panel = $("panel")!;
  const scrim = $("scrim")!;
  const pBody = $("pBody")!;
  const find = $("find")!;
  const q = $<HTMLInputElement>("q")!;

  // ── Rendering ──
  function renderList() {
    const now = Date.now();
    const visible = applyFilters(listings, state, defs);
    const groups = state.view === "archive" ? archiveGroups(visible, now) : upcomingGroups(visible, now);
    order = groups.flatMap((g) => g.items.map((h) => h.slug));
    listEl.innerHTML = timelineHtml(groups, now, emptyHtml(!!state.q || isFiltered(state), state.view));
  }
  function renderSentence() {
    sentence.innerHTML = sentenceHtml(state, defs);
  }
  function renderAll() {
    const now = Date.now();
    renderSentence();
    renderList();
    const soon = $("soon");
    if (soon) soon.innerHTML = soonHtml(listings, now);
    const stats = $("stats");
    if (stats) stats.innerHTML = statsHtml(listings, now);
  }
  // The server already rendered the default view; just work out the order for panel navigation.
  {
    const now = Date.now();
    const groups = state.view === "archive" ? archiveGroups(listings, now) : upcomingGroups(listings, now);
    order = groups.flatMap((g) => g.items.map((h) => h.slug));
  }

  function setView(view: "upcoming" | "archive", push: boolean) {
    state.view = view;
    for (const t of document.querySelectorAll<HTMLElement>(".tab"))
      t.setAttribute("aria-selected", String(t.dataset.view === view));
    for (const a of document.querySelectorAll<HTMLElement>(".nav a[data-nav]")) {
      const on = (a.dataset.nav === "archive") === (view === "archive") && a.dataset.nav !== "about";
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    document.title =
      view === "archive" ? "Archive · arinjilley?" : "arinjilley? · hackathons, sorted by deadline";
    if (push) history.pushState({ view }, "", view === "archive" ? "/archive" : "/");
    closeMenu();
    renderList();
  }

  // ── Filter menus ──
  let menuFor: keyof typeof defs | null = null;
  function openMenu(btn: HTMLElement) {
    const k = btn.dataset.f as keyof typeof defs;
    if (menuFor === k) return closeMenu();
    closeMenu();
    menuFor = k;
    btn.setAttribute("aria-expanded", "true");
    const now = Date.now();
    const pool = listings.filter((h) => (boardStatus(h, now) === "archived") === (state.view === "archive"));
    menu.innerHTML =
      `<div class="menu-h">${defs[k].label}</div>` +
      defs[k].opts
        .map((o) => {
          const n = applyFilters(pool, { ...state, [k]: o.v }, defs).length;
          const sel = state[k] === o.v;
          return `<button class="opt" role="option" data-v="${esc(o.v)}" aria-selected="${sel}" ${n || sel || o.v === "any" ? "" : "disabled"}>${icon("check-bold", "i ck")}${esc(o.name)}<span class="n">${n}</span></button>`;
        })
        .join("");
    menu.classList.add("on");
    if (innerWidth > 720) {
      const r = btn.getBoundingClientRect();
      menu.style.left = `${Math.max(12, Math.min(r.left - 10, innerWidth - menu.offsetWidth - 12))}px`;
      menu.style.top = `${r.bottom + 8}px`;
    }
    (
      menu.querySelector<HTMLElement>('[aria-selected="true"]') ?? menu.querySelector<HTMLElement>(".opt")
    )?.focus({
      preventScroll: true,
    });
  }
  function closeMenu(refocus = false) {
    if (!menuFor) return;
    const tok = sentence.querySelector<HTMLElement>(`.tok[data-f="${menuFor}"]`);
    menu.classList.remove("on");
    tok?.setAttribute("aria-expanded", "false");
    menuFor = null;
    if (refocus) tok?.focus({ preventScroll: true });
  }
  menu.addEventListener("click", (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>(".opt");
    if (!o || !menuFor) return;
    const k = menuFor;
    state[k] = o.dataset.v!;
    closeMenu();
    renderSentence();
    renderList();
    sentence.querySelector<HTMLElement>(`.tok[data-f="${k}"]`)?.focus({ preventScroll: true });
  });
  menu.addEventListener("keydown", (e) => {
    const opts = [...menu.querySelectorAll<HTMLElement>(".opt:not(:disabled)")];
    const i = opts.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      opts[(i + 1) % opts.length]?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      opts[(i - 1 + opts.length) % opts.length]?.focus();
    }
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    }
  });
  $("menuScrim")?.addEventListener("click", () => closeMenu());
  window.addEventListener("resize", () => closeMenu());
  window.addEventListener("scroll", () => innerWidth > 720 && closeMenu(), { passive: true });

  // ── Search ──
  function openFind() {
    find.classList.add("open");
    q.tabIndex = 0;
    q.focus();
  }
  function closeFind() {
    q.value = "";
    state.q = "";
    find.classList.remove("open");
    q.tabIndex = -1;
    renderList();
    $("findBtn")?.focus({ preventScroll: true });
  }
  $("findBtn")?.addEventListener("click", openFind);
  $("findX")?.addEventListener("click", closeFind);
  q.addEventListener("input", () => {
    state.q = q.value;
    renderList();
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeFind();
    }
  });
  q.addEventListener("blur", () =>
    window.setTimeout(() => {
      if (!q.value && document.activeElement !== q) {
        find.classList.remove("open");
        q.tabIndex = -1;
      }
    }, 120),
  );

  // ── Side panel (desktop) / full-screen sheet (mobile) with real /h/slug URLs ──
  let current: string | null = null;
  let basePath = location.pathname;
  let lastFocus: Element | null = null;

  function openPanel(slug: string) {
    const h = bySlug.get(slug);
    if (!h) return false;
    if (!panel.classList.contains("on")) lastFocus = document.activeElement;
    current = slug;
    pBody.innerHTML = detailHtml(h, Date.now());
    pBody.scrollTop = 0;
    const reg = $<HTMLAnchorElement>("pReg")!;
    const regM = $<HTMLAnchorElement>("pRegM")!;
    if (h.registerUrl) {
      reg.href = h.registerUrl;
      regM.href = h.registerUrl;
      regM.innerHTML = `Register on ${esc(new URL(h.registerUrl).host.replace(/^www\./, ""))}${icon("arrow-up-right")}`;
      reg.hidden = false;
      regM.parentElement!.hidden = false;
    } else {
      reg.hidden = true;
      regM.parentElement!.hidden = true;
    }
    const i = order.indexOf(slug);
    $<HTMLButtonElement>("pPrev")!.disabled = i <= 0;
    $<HTMLButtonElement>("pNext")!.disabled = i < 0 || i >= order.length - 1;
    panel.classList.add("on");
    scrim.classList.add("on");
    document.documentElement.classList.add("lock");
    document.title = `${h.title} · arinjilley?`;
    (innerWidth < 1024 ? $("pClose2") : $("pClose"))?.focus({ preventScroll: true });
    return true;
  }
  function closePanelUi() {
    if (!panel.classList.contains("on")) return;
    panel.classList.remove("on");
    scrim.classList.remove("on");
    document.documentElement.classList.remove("lock");
    current = null;
    document.title =
      state.view === "archive" ? "Archive · arinjilley?" : "arinjilley? · hackathons, sorted by deadline";
    if (lastFocus instanceof HTMLElement && document.contains(lastFocus))
      lastFocus.focus({ preventScroll: true });
  }
  function closePanel() {
    if (history.state?.panel) history.back();
    else {
      history.replaceState({ view: state.view }, "", basePath);
      closePanelUi();
    }
  }
  function step(dir: number) {
    if (!current) return;
    const next = order[order.indexOf(current) + dir];
    if (!next) return;
    history.replaceState({ panel: next }, "", `/h/${next}`);
    openPanel(next);
  }

  $("pClose")?.addEventListener("click", closePanel);
  $("pClose2")?.addEventListener("click", closePanel);
  scrim.addEventListener("click", closePanel);
  $("pPrev")?.addEventListener("click", () => step(-1));
  $("pNext")?.addEventListener("click", () => step(1));
  $("pCopy")?.addEventListener("click", () => copyLink());

  window.addEventListener("popstate", (e) => {
    const m = /^\/h\/([a-z0-9-]+)$/.exec(location.pathname);
    if (m && bySlug.has(m[1]!)) {
      openPanel(m[1]!);
      return;
    }
    closePanelUi();
    const view = location.pathname === "/archive" ? "archive" : "upcoming";
    if (view !== state.view) setView(view, false);
    if (e.state === null) basePath = location.pathname;
  });

  // ── Clicks ──
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (menuFor && !target.closest(".menu,.tok")) closeMenu();
    const tok = target.closest<HTMLElement>(".tok");
    if (tok) return openMenu(tok);
    if (target.closest("#reset, #emptyClear")) {
      Object.assign(state, { where: "any", fee: "any", team: "any", theme: "any" });
      if (q.value) closeFind();
      renderSentence();
      renderList();
      return;
    }
    // Let modified clicks (new tab etc.) behave normally.
    const me = e as MouseEvent;
    if (me.metaKey || me.ctrlKey || me.shiftKey || me.button === 1) return;
    const tab = target.closest<HTMLElement>(".tab[data-view]");
    if (tab) {
      e.preventDefault();
      setView(tab.dataset.view as "upcoming" | "archive", true);
      return;
    }
    const navLink = target.closest<HTMLAnchorElement>('.nav a[data-nav="home"], .nav a[data-nav="archive"]');
    if (navLink) {
      e.preventDefault();
      setView(navLink.dataset.nav === "archive" ? "archive" : "upcoming", true);
      $("board")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a[data-slug]");
    if (link && bySlug.has(link.dataset.slug!)) {
      e.preventDefault();
      basePath = state.view === "archive" ? "/archive" : "/";
      history.pushState({ panel: link.dataset.slug }, "", `/h/${link.dataset.slug}`);
      openPanel(link.dataset.slug!);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (panel.classList.contains("on")) {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        step(1);
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        step(-1);
      }
      return;
    }
    const tag = (document.activeElement?.tagName ?? "").toLowerCase();
    if (e.key === "/" && tag !== "input" && tag !== "textarea") {
      e.preventDefault();
      openFind();
    }
    if (e.key === "Escape") closeMenu(true);
  });

  // Statuses change with time (OPEN → LAST CALL → CLOSED), so refresh the board every minute.
  window.setInterval(() => {
    if (!current) renderAll();
  }, 60_000);
}

// ── Detail page: copy link button (if present) ──
document.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("#pageCopy")) copyLink();
});
