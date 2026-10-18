// Installable app + offline support, shared by the public site and the admin page.
//
// Install prompt: browsers only open their own install dialog after the visitor taps something, so after
// ~10 seconds of active use we slide up a small "Get the app" card. Its Install button opens Chrome/Edge's
// native dialog (Android, desktop). iPhone has no install API, so there the card shows the two Safari steps.
// The card never shows inside the installed app, after installing, or for 14 days after "Not now".
// The navbar's "Get the app" button does the same on demand: the native dialog, or the Safari steps on iPhone.
import { icon } from "../shared/render";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const ENGAGED_MS = 10_000; // active time before the card appears
const SNOOZE_MS = 14 * 86_400_000; // "Not now" hides it for two weeks
const KEY_ENGAGED = "arj-engaged-ms"; // per tab session, so it adds up across page loads
const KEY_SNOOZED = "arj-install-snoozed";
const KEY_INSTALLED = "arj-installed";

const store = {
  get: (s: Storage, k: string) => {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set: (s: Storage, k: string, v: string) => {
    try {
      s.setItem(k, v);
    } catch {
      /* private mode etc. */
    }
  },
};

export function setupPwa(toast: (message: string) => void): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("service worker not registered", err));
    });
  }

  window.addEventListener("offline", () => toast("You're offline. Showing what was last saved."));
  window.addEventListener("online", () => toast("Back online."));
  if (!navigator.onLine) toast("You're offline. Showing what was last saved.");

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return; // already using the installed app

  const isAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const ua = navigator.userAgent;
  // iPhone/iPad Safari (not Chrome/Firefox/in-app browsers on iOS, which can't add to the home screen).
  const iosSafari =
    /iphone|ipad|ipod/i.test(ua) &&
    /safari/i.test(ua) &&
    !/crios|fxios|edgios|instagram|fban|fbav|line\//i.test(ua);
  let deferred: InstallPromptEvent | null = null;

  const footerButtons = () => document.querySelectorAll<HTMLElement>("[data-install]");
  const topButtons = () => document.querySelectorAll<HTMLElement>("[data-top-install]");
  // The navbar button shows whenever this browser can install (or, on iPhone, explain how).
  function syncTopButtons() {
    const can = !store.get(localStorage, KEY_INSTALLED) && (!!deferred || iosSafari);
    for (const b of topButtons()) b.hidden = !can;
  }
  syncTopButtons();

  // Chrome/Edge/Android: keep the event so our own buttons can open the native dialog later.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    for (const b of footerButtons()) {
      b.hidden = false;
      const fallback = b.nextElementSibling as HTMLElement | null;
      if (fallback?.classList.contains("install-fallback")) fallback.hidden = true;
    }
    syncTopButtons();
    maybeShowCard();
  });

  async function nativeInstall(): Promise<boolean> {
    if (!deferred) return false;
    const evt = deferred;
    deferred = null; // the browser only lets each event prompt once
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") {
      store.set(localStorage, KEY_INSTALLED, "1");
      for (const b of footerButtons()) b.hidden = true;
    }
    syncTopButtons();
    return outcome === "accepted";
  }

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-install]")) void nativeInstall();
    if (target.closest("[data-top-install]")) {
      if (deferred) void nativeInstall();
      else if (iosSafari) {
        // No install API on iPhone: show the card with the Safari steps, even if it was snoozed.
        hideCard();
        showCard();
      }
    }
  });

  window.addEventListener("appinstalled", () => {
    store.set(localStorage, KEY_INSTALLED, "1");
    for (const b of footerButtons()) b.hidden = true;
    syncTopButtons();
    hideCard();
    toast("Installed. Find arinjilley? on your home screen.");
  });

  // ── The "Get the app" card ──

  let card: HTMLElement | null = null;
  let shown = false;

  const snoozed = () => {
    const until = Number(store.get(localStorage, KEY_SNOOZED) ?? 0);
    return until > Date.now();
  };
  const engagedMs = () => Number(store.get(sessionStorage, KEY_ENGAGED) ?? 0);
  // Don't cover an open hackathon panel, an open menu, or the admin editor's save bar.
  const busy = () =>
    document.documentElement.classList.contains("lock") ||
    !!document.querySelector(".menu.on") ||
    document.body.dataset.page === "admin-edit" ||
    document.body.dataset.page === "admin-login";

  function maybeShowCard() {
    if (shown || snoozed() || store.get(localStorage, KEY_INSTALLED)) return;
    if (engagedMs() < ENGAGED_MS || busy()) return;
    if (!deferred && !iosSafari) return; // nothing we can offer on this browser
    showCard();
  }

  function showCard() {
    shown = true;
    const appName = isAdmin ? "arinjilley? admin" : "arinjilley?";
    const body = deferred
      ? isAdmin
        ? "Open your listings in one tap, like a normal app."
        : "One tap from your home screen, and the board works even with no signal."
      : `Tap ${icon("export", "i ios-share")} <b>Share</b>, then <b>Add to Home Screen</b>.`;
    card = document.createElement("div");
    card.className = "install-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Install the app");
    card.innerHTML = `
      <img src="/icons/${isAdmin ? "admin-192" : "icon-192"}.png" alt="" width="44" height="44">
      <div class="ic-text"><b>Get the ${appName} app</b><span>${body}</span></div>
      <div class="ic-actions">
        ${deferred ? '<button class="btn btn-primary btn-sm" data-ic="install">Install</button>' : ""}
        <button class="btn btn-ghost btn-sm" data-ic="later">${deferred ? "Not now" : "Got it"}</button>
      </div>`;
    document.body.appendChild(card);
    requestAnimationFrame(() => card?.classList.add("on"));
    card.addEventListener("click", async (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>("[data-ic]")?.dataset.ic;
      if (action === "install") {
        hideCard();
        const accepted = await nativeInstall();
        if (!accepted) store.set(localStorage, KEY_SNOOZED, String(Date.now() + SNOOZE_MS));
      } else if (action === "later") {
        store.set(localStorage, KEY_SNOOZED, String(Date.now() + SNOOZE_MS));
        hideCard();
      }
    });
  }

  function hideCard() {
    const c = card;
    if (!c) return;
    c.classList.remove("on");
    window.setTimeout(() => c.remove(), 300);
    card = null;
  }

  // Count only time the page is actually visible, adding up across page loads in this tab.
  window.setInterval(() => {
    if (document.visibilityState !== "visible" || shown) return;
    store.set(sessionStorage, KEY_ENGAGED, String(engagedMs() + 1000));
    maybeShowCard();
  }, 1000);
}
