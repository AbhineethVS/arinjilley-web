// Browser script. On every page: live countdowns, saving and sharing hackathons, header border on scroll, copy-link.
// On the home page: filter bar and sort, search, Upcoming/Archive tabs and the side panel, re-rendering with the
// same functions the server used (shared/render.ts), so what you see never differs from the first load.

import { boardStatus, countdown } from "@arinjilley/core";
import type { WebListing } from "../shared/listing";
import {
  applyFilters,
  boardGroups,
  DEFAULT_FILTERS,
  detailHtml,
  emptyHtml,
  esc,
  type FilterState,
  filterBarHtml,
  filterDefs,
  icon,
  isFiltered,
  SORTS,
  type SortKey,
  shareText,
  soonHtml,
  statsHtml,
  timelineHtml,
} from "../shared/render";
import { setupPwa } from "./pwa";
import { setupFolder, setupSaving, syncSaveButtons } from "./saved";
import { prefetchShare, setupShare } from "./share";

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

// The top bar's accent tint fades out over the first ~260px of scrolling, back to the plain page colour.
const TINT_PCT = 12;
const TINT_FADE_PX = 260;
let topFrame = 0;
function updateTop() {
  topFrame = 0;
  const top = $("top");
  if (!top) return;
  top.classList.toggle("scrolled", scrollY > 8);
  const t = Math.max(0, 1 - scrollY / TINT_FADE_PX);
  top.style.setProperty("--top-mix", `${(TINT_PCT * t).toFixed(2)}%`);
}
window.addEventListener(
  "scroll",
  () => {
    if (!topFrame) topFrame = requestAnimationFrame(updateTop);
  },
  { passive: true },
);
updateTop();
window.setInterval(() => {
  tickCountdowns();
}, 1000);
setupPwa(toast);
setupSaving(toast);
setupShare(toast);

// ── Home page ──

if (document.body.dataset.page === "home") initHome();

function initHome() {
  const data = JSON.parse($("data")!.textContent!) as {
    listings: WebListing[];
    view: "upcoming" | "archive";
    now: number;
  };
  const listings = data.listings;
  const bySlug = new Map(listings.map((h) => [h.slug, h]));
  const defs = filterDefs(listings);
  const state: FilterState & { view: "upcoming" | "archive" } = { ...DEFAULT_FILTERS, view: data.view };
  let order: string[] = [];

  const listEl = $("list")!;
  const fbar = $("fbar")!;
  const menu = $("menu")!;
  const panel = $("panel")!;
  const scrim = $("scrim")!;
  const pBody = $("pBody")!;
  const find = $("find")!;
  const q = $<HTMLInputElement>("q")!;

  // ── Rendering ──
  // The list and the bar (its count and Reset) always change together.
  function renderList() {
    const now = Date.now();
    const visible = applyFilters(listings, state, defs);
    const groups = boardGroups(visible, now, state.view, state.sort);
    order = groups.flatMap((g) => g.items.map((h) => h.slug));
    listEl.innerHTML = timelineHtml(groups, now, emptyHtml(!!state.q || isFiltered(state), state.view));
    fbar.innerHTML = filterBarHtml(state, defs, state.view, order.length);
    syncSaveButtons(listEl);
  }
  function renderAll() {
    const now = Date.now();
    renderList();
    const soon = $("soon");
    if (soon) soon.innerHTML = soonHtml(listings, now);
    const stats = $("stats");
    if (stats) stats.innerHTML = statsHtml(listings, now);
  }
  // The server already rendered the default view; just work out the order for panel navigation. If this page
  // is an older saved copy (opened offline from the installed app), re-render so statuses and countdowns are current.
  if (Date.now() - data.now > 2 * 60_000) renderAll();
  else {
    const now = Date.now();
    order = boardGroups(listings, now, state.view).flatMap((g) => g.items.map((h) => h.slug));
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
  type MenuKey = keyof typeof defs | "sort";
  let menuFor: MenuKey | null = null;
  function openMenu(btn: HTMLElement) {
    const k = btn.dataset.f as MenuKey;
    if (menuFor === k) return closeMenu();
    closeMenu();
    menuFor = k;
    btn.setAttribute("aria-expanded", "true");
    if (k === "sort") {
      menu.innerHTML =
        `<div class="menu-h">SORT BY</div>` +
        SORTS.map(
          (o) =>
            `<button class="opt" role="option" data-v="${o.v}" aria-selected="${state.sort === o.v}">${icon("check-bold", "i ck")}${esc(o.name)}</button>`,
        ).join("");
    } else {
      const now = Date.now();
      const pool = listings.filter(
        (h) => (boardStatus(h, now) === "archived") === (state.view === "archive"),
      );
      menu.innerHTML =
        `<div class="menu-h">${defs[k].label}</div>` +
        defs[k].opts
          .map((o) => {
            const n = applyFilters(pool, { ...state, [k]: o.v }, defs).length;
            const sel = state[k] === o.v;
            return `<button class="opt" role="option" data-v="${esc(o.v)}" aria-selected="${sel}" ${n || sel || o.v === "any" ? "" : "disabled"}>${icon("check-bold", "i ck")}${esc(o.name)}<span class="n">${n}</span></button>`;
          })
          .join("");
    }
    menu.classList.add("on");
    if (innerWidth > 720) {
      const r = btn.getBoundingClientRect();
      menu.style.minWidth = `${Math.max(230, r.width)}px`;
      menu.style.left = `${Math.max(12, Math.min(r.left, innerWidth - menu.offsetWidth - 12))}px`;
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
    const fld = fbar.querySelector<HTMLElement>(`.fld[data-f="${menuFor}"]`);
    menu.classList.remove("on");
    fld?.setAttribute("aria-expanded", "false");
    menuFor = null;
    if (refocus) fld?.focus({ preventScroll: true });
  }
  menu.addEventListener("click", (e) => {
    const o = (e.target as HTMLElement).closest<HTMLElement>(".opt");
    if (!o || !menuFor) return;
    const k = menuFor;
    if (k === "sort") state.sort = o.dataset.v as SortKey;
    else state[k] = o.dataset.v!;
    closeMenu();
    renderList();
    fbar.querySelector<HTMLElement>(`.fld[data-f="${k}"]`)?.focus({ preventScroll: true });
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
    $("pSave")!.dataset.save = slug;
    syncSaveButtons(panel);
    const share = $("pShare")!;
    share.dataset.shareTitle = h.title;
    share.dataset.shareText = shareText(h);
    share.dataset.shareUrl = `${location.origin}/h/${slug}`;
    share.dataset.shareImg = h.posterUrl ?? "";
    prefetchShare(share);
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

  // ── Hero heading: typed in letter by letter on load (html.tw is set in <head> unless reduced motion) ──
  // Every letter is laid out from the start (hidden until typed) and each word is unbreakable, so lines never
  // reflow mid-typing. The caret is a pseudo-element on the current letter, so it can't add a break point either.
  const heading = $("heroH");
  if (heading && document.documentElement.classList.contains("tw")) {
    heading.setAttribute("aria-label", heading.textContent ?? "");
    const letters: HTMLElement[] = [];
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const letter = (ch: string) => {
      const el = document.createElement("span");
      el.className = "tc";
      el.textContent = ch;
      letters.push(el);
      return el;
    };
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      node.data.split(/( )/).forEach((part) => {
        if (!part) return;
        if (part === " ") {
          frag.append(letter(" "));
          return;
        }
        const word = document.createElement("span");
        word.className = "tw-word";
        for (const ch of part) word.appendChild(letter(ch));
        frag.append(word);
      });
      node.replaceWith(frag);
    }
    for (const el of heading.querySelectorAll(".tw-word, .tc")) el.setAttribute("aria-hidden", "true");
    let at = letters[0]!;
    at.classList.add("cur", "pre");
    heading.classList.add("typing", "busy");
    let i = 0;
    const type = () => {
      const el = letters[i++];
      if (!el) {
        heading.classList.remove("busy");
        heading.classList.add("typed");
        return;
      }
      at.classList.remove("cur", "pre");
      el.classList.add("on", "cur");
      at = el;
      const next = letters[i];
      // A short beat at the line break, a little human jitter everywhere else.
      const lineBreak = next && el.closest(".acc") !== next.closest(".acc");
      window.setTimeout(type, lineBreak ? 340 : el.textContent === " " ? 90 : 50 + Math.random() * 55);
    };
    window.setTimeout(type, 450);
  }

  // ── Hero deck (mobile): rotates every few seconds; tap the front card for details, a side card to bring it forward ──
  const fan = $("fan");
  if (fan) {
    const cards = [...fan.querySelectorAll<HTMLAnchorElement>(".fp")];
    const dots = [...fan.querySelectorAll(".fan-dots i")];
    const n = cards.length;
    let front = 0;
    let timer: number | undefined;
    let resumeTimer: number | undefined;
    let swiped = false;
    let x0: number | null = null;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pauseBtn = $<HTMLButtonElement>("fanPause");
    const live = $("fanLive");
    let userPaused = false;
    const layout = () => {
      cards.forEach((c, i) => {
        const off = (i - front + n) % n;
        const pos =
          off === 0
            ? "0"
            : off === 1
              ? "1"
              : off === n - 1
                ? "-1"
                : n >= 5 && off === 2
                  ? "2"
                  : n >= 5 && off === n - 2
                    ? "-2"
                    : "x";
        c.dataset.pos = pos;
        c.tabIndex = pos === "0" ? 0 : -1;
        // Only the front card is announced and reachable; the fanned ones are decoration until they come forward.
        if (pos === "0") c.removeAttribute("aria-hidden");
        else c.setAttribute("aria-hidden", "true");
      });
      dots.forEach((d, i) => {
        d.classList.toggle("on", i === front);
      });
    };
    // Manual turns are announced; the automatic ones stay quiet.
    const turn = (dir: number, announce = false) => {
      front = (front + dir + n) % n;
      layout();
      if (announce && live) live.textContent = cards[front]?.getAttribute("aria-label") ?? "";
    };
    const play = () => {
      window.clearInterval(timer);
      if (still || n < 2 || userPaused) return;
      timer = window.setInterval(() => {
        if (!document.hidden && !current && fan.offsetParent) turn(1);
      }, 2000);
    };
    const hold = () => {
      window.clearInterval(timer);
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(play, 6000);
    };
    // Runs before the document-level handler: side cards turn the deck; the front card falls through and opens the panel.
    fan.addEventListener("click", (e) => {
      const c = (e.target as HTMLElement).closest<HTMLAnchorElement>(".fp");
      if (!c) return;
      hold();
      if (swiped || c.dataset.pos !== "0") {
        e.preventDefault();
        e.stopPropagation();
        if (!swiped) turn(Number(c.dataset.pos) || 1, true);
      }
      swiped = false;
    });
    fan.addEventListener("pointerdown", (e) => {
      x0 = e.clientX;
      swiped = false;
    });
    fan.addEventListener("pointerup", (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) {
        swiped = true;
        hold();
        turn(dx < 0 ? 1 : -1, true);
      }
    });
    fan.addEventListener("pointercancel", () => {
      x0 = null;
    });
    // Scrolling over the deck (wheel or trackpad) turns it one card per gesture instead of scrolling the page.
    // A gesture ends after a short quiet gap, so trackpad momentum doesn't skip several cards.
    let lastWheel = 0;
    let lastTurn = 0;
    fan.addEventListener(
      "wheel",
      (e) => {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        e.preventDefault();
        const t = performance.now();
        const fresh = t - lastWheel > 220;
        lastWheel = t;
        if (Math.abs(d) < 4 || (!fresh && t - lastTurn < 700)) return;
        lastTurn = t;
        hold();
        turn(d > 0 ? 1 : -1, true);
      },
      { passive: false },
    );
    // Desktop: hold still under the mouse; arrow keys turn the deck when it has focus.
    fan.addEventListener("mouseenter", () => {
      window.clearInterval(timer);
      window.clearTimeout(resumeTimer);
    });
    fan.addEventListener("mouseleave", hold);
    fan.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      hold();
      turn(e.key === "ArrowRight" ? 1 : -1, true);
      cards[front]?.focus({ preventScroll: true });
    });
    // Pause button: stays paused until pressed again. Keyboard focus inside the deck also holds it still.
    if (pauseBtn) {
      if (still) pauseBtn.hidden = true;
      pauseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        userPaused = !userPaused;
        pauseBtn.setAttribute("aria-pressed", String(userPaused));
        pauseBtn.setAttribute("aria-label", userPaused ? "Play rotating cards" : "Pause rotating cards");
        if (userPaused) {
          window.clearInterval(timer);
          window.clearTimeout(resumeTimer);
        } else play();
      });
    }
    fan.addEventListener("focusin", () => {
      window.clearInterval(timer);
      window.clearTimeout(resumeTimer);
    });
    fan.addEventListener("focusout", (e) => {
      if (!fan.contains(e.relatedTarget as Node | null)) hold();
    });
    layout();
    play();
  }

  // ── Your folder (saved hackathons), in the corner ──
  setupFolder(listings, tickCountdowns);

  $("pClose")?.addEventListener("click", closePanel);
  $("pClose2")?.addEventListener("click", closePanel);
  scrim.addEventListener("click", closePanel);
  $("pPrev")?.addEventListener("click", () => step(-1));
  $("pNext")?.addEventListener("click", () => step(1));

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
    if (menuFor && !target.closest(".menu,.fld")) closeMenu();
    const fld = target.closest<HTMLElement>(".fld");
    if (fld) return openMenu(fld);
    if (target.closest("#reset, #emptyClear")) {
      Object.assign(state, { where: "any", fee: "any", team: "any", theme: "any" });
      if (q.value) closeFind();
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
