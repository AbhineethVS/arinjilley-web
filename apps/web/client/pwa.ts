// Installable app + offline support, shared by the public site and the admin page.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function setupPwa(toast: (message: string) => void): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("service worker not registered", err));
    });
  }

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  const buttons = () => document.querySelectorAll<HTMLElement>("[data-install]");
  let deferred: InstallPromptEvent | null = null;

  // Chrome/Edge/Android: show our own "Install app" buttons instead of the browser's mini-bar.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (standalone) return;
    deferred = e as InstallPromptEvent;
    for (const b of buttons()) {
      b.hidden = false;
      (b.nextElementSibling as HTMLElement | null)?.classList.contains("install-fallback") &&
        ((b.nextElementSibling as HTMLElement).hidden = true);
    }
  });
  document.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest("[data-install]");
    if (!b || !deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") for (const x of buttons()) x.hidden = true;
    deferred = null;
  });
  window.addEventListener("appinstalled", () => {
    for (const b of buttons()) b.hidden = true;
    toast("Installed. Find arinjilley? on your home screen.");
  });

  window.addEventListener("offline", () => toast("You're offline. Showing what was last saved."));
  window.addEventListener("online", () => toast("Back online."));
  if (!navigator.onLine) toast("You're offline. Showing what was last saved.");
}
