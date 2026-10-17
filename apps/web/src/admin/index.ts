// /admin routes. Everything here is private (noindex, no caching) and needs a logged-in admin, except the
// login page and the login endpoints themselves.
import { admins, getHackathon, getHackathonRow, hackathons, rowToHackathon } from "@arinjilley/core/db";
import { posterMarkup } from "@arinjilley/core/poster";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { emptyForm, listingToForm, type PosterChoice } from "../../shared/form";
import { esc } from "../../shared/render";
import { telegramFile } from "../img";
import {
  addAdminHandler,
  createHandler,
  extractHandler,
  removeAdminHandler,
  statusHandler,
  updateHandler,
  uploadHandler,
} from "./api";
import { pollLogin, startLogin } from "./login";
import { cookie, currentAdmin, SESSION_COOKIE, sameOrigin } from "./session";
import { adminsView, type DashRow, dashboardView, editorView, loginView, type Tab, tabOf } from "./views";

const PRIVATE = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...PRIVATE } });
const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", ...PRIVATE },
  });

export async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;
  const writes = method !== "GET" && method !== "HEAD";
  if (writes && !sameOrigin(request)) return jsonError("Cross-site request blocked.", 403);

  // ── Login (no session needed) ──
  if (path === "/admin/login/start" && method === "POST") return startLogin(env);
  if (path === "/admin/login/poll" && method === "GET") return pollLogin(request, env);

  const admin = await currentAdmin(request, env);
  if (!admin) {
    if (path.startsWith("/admin/api/") || writes) return jsonError("Please log in again.", 401);
    if (path !== "/admin") return Response.redirect(new URL("/admin", request.url).toString(), 302);
    return html(loginView(env.BOT_USERNAME));
  }

  if (path === "/admin/logout" && method === "POST") {
    return new Response(null, {
      status: 303,
      headers: { location: "/admin", "set-cookie": cookie(SESSION_COOKIE, "", 0), ...PRIVATE },
    });
  }

  const d = drizzle(env.DB);

  // ── Pages ──
  if (path === "/admin" && method === "GET") {
    const now = Date.now();
    const rows = await d.select().from(hackathons).orderBy(desc(hackathons.updatedAt)).limit(300).all();
    const all = rows.map((r) => ({ r, h: rowToHackathon(r) }));
    const counts: Record<Tab, number> = { drafts: 0, live: 0, archive: 0, discarded: 0 };
    for (const { h } of all) counts[tabOf(h, now)]++;
    const requested = new URL(request.url).searchParams.get("tab") as Tab | null;
    const tab: Tab = requested && requested in counts ? requested : counts.drafts ? "drafts" : "live";
    const list: DashRow[] = all
      .filter(({ h }) => tabOf(h, now) === tab)
      .map(({ r, h }) => ({
        h,
        updatedAt: r.updatedAt,
        extractedBy: r.extractedBy,
        posterHtml:
          r.posterKind !== "generated" && (r.posterThumbFileId || r.posterFileId)
            ? `<img src="/admin/img/${esc(encodeURIComponent((r.posterThumbFileId ?? r.posterFileId)!))}" alt="" loading="lazy">`
            : posterMarkup(h),
      }));
    return html(dashboardView(admin, list, tab, counts, now));
  }

  if (path === "/admin/new" && method === "GET") {
    return html(
      editorView(admin, {
        id: null,
        slug: null,
        status: null,
        form: emptyForm(),
        siteUrl: env.SITE_URL,
        groupUrl: env.GROUP_URL,
        posterImageUrl: null,
        posterStatus: null,
      }),
    );
  }

  const edit = /^\/admin\/h\/([a-z0-9]{6,20})$/.exec(path);
  if (edit && method === "GET") {
    const id = edit[1]!;
    const h = await getHackathon(d, id);
    const row = await getHackathonRow(d, id);
    if (!h || !row) return Response.redirect(new URL("/admin", request.url).toString(), 302);
    const poster: PosterChoice =
      row.posterKind !== "generated" && row.posterFileId
        ? { kind: "custom", fileId: row.posterFileId, thumbId: row.posterThumbFileId }
        : { kind: "generated", style: row.posterStyle };
    return html(
      editorView(admin, {
        id,
        slug: h.slug,
        status: h.status,
        form: listingToForm(h, poster),
        siteUrl: env.SITE_URL,
        groupUrl: env.GROUP_URL,
        posterImageUrl:
          poster.kind === "custom"
            ? `/admin/img/${encodeURIComponent(poster.thumbId ?? poster.fileId)}`
            : null,
        posterStatus: row.posterStatus,
      }),
    );
  }

  if (path === "/admin/admins" && method === "GET") {
    if (admin.role !== "owner") return Response.redirect(new URL("/admin", request.url).toString(), 302);
    const rows = await d.select().from(admins).all();
    return html(adminsView(admin, Number(env.OWNER_TELEGRAM_ID), rows));
  }

  const img = /^\/admin\/img\/([^/]+)$/.exec(path);
  if (img && method === "GET") {
    const res = await telegramFile(env, decodeURIComponent(img[1]!));
    if (!res) return new Response("Not found", { status: 404, headers: PRIVATE });
    // Drafts' posters are private: browser-only caching.
    const headers = new Headers(res.headers);
    headers.set("cache-control", "private, max-age=86400");
    return new Response(res.body, { headers });
  }

  // ── API ──
  if (path === "/admin/api/extract" && method === "POST") return extractHandler(request, env, admin);
  if (path === "/admin/api/upload" && method === "POST") return uploadHandler(request, env, admin);
  if (path === "/admin/api/listings" && method === "POST") return createHandler(request, env, admin);
  const one = /^\/admin\/api\/listings\/([a-z0-9]{6,20})(\/status)?$/.exec(path);
  if (one && method === "PUT" && !one[2]) return updateHandler(request, env, admin, one[1]!);
  if (one && method === "POST" && one[2]) return statusHandler(request, env, one[1]!);
  if (path === "/admin/api/admins" || path.startsWith("/admin/api/admins/")) {
    if (admin.role !== "owner") return jsonError("Only the owner can manage admins.", 403);
    if (method === "POST" && path === "/admin/api/admins") return addAdminHandler(request, env, admin);
    const rm = /^\/admin\/api\/admins\/(\d{5,15})$/.exec(path);
    if (rm && method === "DELETE") return removeAdminHandler(env, Number(rm[1]));
  }

  return path.startsWith("/admin/api/")
    ? jsonError("Not found.", 404)
    : Response.redirect(new URL("/admin", request.url).toString(), 302);
}
