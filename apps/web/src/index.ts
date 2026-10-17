// The public website (SPEC §8) and the admin page (§8.5), on Cloudflare Pages. Static files (CSS, JS, fonts)
// are served by Pages directly (see _routes.json); this code renders HTML pages and proxies poster images.
import { alertOwner, errorText } from "@arinjilley/core/db";
import { drizzle } from "drizzle-orm/d1";
import { handleAdmin } from "./admin";
import { liveListingBySlug, liveListings } from "./data";
import { serveImage } from "./img";
import { aboutPage, detailPage, errorPage, homePage, notFoundPage, type PageCtx } from "./pages";

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

function html(body: string, status = 200, maxAge = 60): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": status === 200 ? `public, max-age=${maxAge}` : "no-store",
      ...SECURITY_HEADERS,
    },
  });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      // Tell the owner (at most once an hour) and show a friendly page instead of Cloudflare's error screen.
      console.error("request failed", request.url, err);
      const path = new URL(request.url).pathname;
      ctx.waitUntil(
        alertOwner(env, drizzle(env.DB), "web:error", `The website hit an error on ${path}`, errorText(err)),
      );
      if (path.startsWith("/admin/api/")) {
        return Response.json(
          { error: "Something went wrong. The owner has been notified." },
          { status: 500 },
        );
      }
      const pageCtx: PageCtx = { siteUrl: env.SITE_URL.replace(/\/+$/, ""), groupUrl: env.GROUP_URL };
      return html(errorPage(pageCtx, path), 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const ctx: PageCtx = { siteUrl: env.SITE_URL.replace(/\/+$/, ""), groupUrl: env.GROUP_URL };
  const now = Date.now();

  if (path === "/admin" || path.startsWith("/admin/")) return handleAdmin(request, env, path);

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (path === "/" || path === "/archive") {
    return html(homePage(ctx, await liveListings(env), path === "/archive" ? "archive" : "upcoming", now));
  }

  const detail = /^\/h\/([a-z0-9-]{1,80})$/.exec(path);
  if (detail) {
    const h = await liveListingBySlug(env, detail[1]!);
    return h ? html(detailPage(ctx, h, now)) : html(notFoundPage(ctx, path), 404);
  }

  if (path === "/about") return html(aboutPage(ctx), 200, 3600);

  const img = /^\/img\/([^/]+)$/.exec(path);
  if (img) return serveImage(env, decodeURIComponent(img[1]!));

  if (path === "/robots.txt") {
    return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${ctx.siteUrl}/sitemap.xml\n`, {
      headers: { "content-type": "text/plain" },
    });
  }
  if (path === "/sitemap.xml") {
    const list = await liveListings(env);
    const urls = ["/", "/archive", "/about", ...list.map((h) => `/h/${h.slug}`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map((u) => `<url><loc>${ctx.siteUrl}${u}</loc></url>`)
      .join("")}</urlset>`;
    return new Response(xml, { headers: { "content-type": "application/xml" } });
  }

  return html(notFoundPage(ctx, path), 404);
}
