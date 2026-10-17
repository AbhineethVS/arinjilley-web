// "Log in with Telegram" through the bot (no Login Widget, no phone-number prompt):
// 1. The login page asks for a login request; we store a hash of a random browser secret (kept in a cookie).
// 2. The admin opens t.me/<bot>?start=login_<id>; the bot approves the request if they're an admin.
// 3. The page polls; once approved, the browser holding the matching secret gets a 30-day session.
import { adminLogins } from "@arinjilley/core/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  cookie,
  LOGIN_COOKIE,
  lookupAdmin,
  randomToken,
  readCookie,
  sessionCookie,
  sha256Hex,
} from "./session";

const LOGIN_TTL_MS = 10 * 60_000;

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...init.headers },
  });

export async function startLogin(env: Env): Promise<Response> {
  const id = randomToken(18);
  const browserSecret = randomToken(32);
  await drizzle(env.DB)
    .insert(adminLogins)
    .values({ id, browserHash: await sha256Hex(browserSecret), expiresAt: Date.now() + LOGIN_TTL_MS });
  return json(
    { link: `https://t.me/${env.BOT_USERNAME}?start=login_${id}`, expiresInMs: LOGIN_TTL_MS },
    { headers: { "set-cookie": cookie(LOGIN_COOKIE, browserSecret, LOGIN_TTL_MS / 1000) } },
  );
}

export async function pollLogin(request: Request, env: Env): Promise<Response> {
  const secret = readCookie(request, LOGIN_COOKIE);
  if (!secret) return json({ status: "expired" });
  const d = drizzle(env.DB);
  const row = await d
    .select()
    .from(adminLogins)
    .where(and(eq(adminLogins.browserHash, await sha256Hex(secret)), isNull(adminLogins.usedAt)))
    .orderBy(desc(adminLogins.createdAt))
    .get();
  if (!row || row.expiresAt < Date.now()) return json({ status: "expired" });
  if (!row.approvedAt || !row.telegramId) return json({ status: "pending" });

  const admin = await lookupAdmin(env, row.telegramId);
  await d.update(adminLogins).set({ usedAt: Date.now() }).where(eq(adminLogins.id, row.id));
  if (!admin) return json({ status: "denied" });
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  headers.append("set-cookie", await sessionCookie(env, admin.id));
  headers.append("set-cookie", cookie(LOGIN_COOKIE, "", 0));
  return new Response(JSON.stringify({ status: "ok" }), { headers });
}
