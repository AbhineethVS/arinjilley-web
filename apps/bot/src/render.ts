// Renders posters to PNG with Cloudflare Browser Rendering (a headless Chrome).
// Rendering in the Worker itself is too CPU-heavy for the free plan (error 1102), but browser time doesn't
// count as Worker CPU. Free plan: 10 browser-minutes/day, 3 concurrent browsers, 1 new browser per 20 s.

import { POSTER_HEIGHT, POSTER_WIDTH, type PosterData, posterHtml } from "@arinjilley/core/poster";
import puppeteer, { type Browser } from "@cloudflare/puppeteer";

// Keep a browser alive briefly after use so quick follow-ups (e.g. "Shuffle style") reuse it instead of
// starting a new one, which the free plan only allows every 20 seconds. Idle time counts towards the
// daily 10 minutes, so this is kept short.
const KEEP_ALIVE_MS = 60_000;

export class RenderBusyError extends Error {
  constructor(public retryAfterMs: number) {
    super(`Browser Rendering is busy; try again in ${Math.ceil(retryAfterMs / 1000)}s`);
  }
}

async function getBrowser(env: Env): Promise<Browser> {
  // Reuse an open session nobody is connected to.
  const free = (await puppeteer.sessions(env.BROWSER)).filter((s) => !s.connectionId);
  for (const s of free) {
    try {
      return await puppeteer.connect(env.BROWSER, s.sessionId);
    } catch {
      // session closed in the meantime; try the next one
    }
  }
  const limits = await puppeteer.limits(env.BROWSER);
  if (limits.allowedBrowserAcquisitions < 1)
    throw new RenderBusyError(limits.timeUntilNextAllowedBrowserAcquisition);
  return puppeteer.launch(env.BROWSER, { keep_alive: KEEP_ALIVE_MS });
}

export async function renderPosterPng(env: Env, data: PosterData): Promise<Uint8Array> {
  const browser = await getBrowser(env);
  try {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: POSTER_WIDTH, height: POSTER_HEIGHT, deviceScaleFactor: 1 });
      await page.setContent(posterHtml(data), { waitUntil: "networkidle0", timeout: 20_000 });
      // Runs inside the browser page (string form, since the Worker has no DOM types).
      await page.evaluate("document.fonts.ready.then(() => true)");
      const png = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: POSTER_WIDTH, height: POSTER_HEIGHT },
      });
      return new Uint8Array(png);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    // Disconnect (not close) so the session stays available for reuse until keep_alive expires.
    browser.disconnect();
  }
}
