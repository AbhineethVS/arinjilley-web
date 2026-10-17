// Admin sessions: a signed cookie (HMAC-SHA256 with SESSION_SECRET) holding the admin's Telegram ID and expiry.
// Every request re-checks that the person is still an admin, so /removeadmin takes effect immediately.
import { admins } from "@arinjilley/core/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

export const SESSION_COOKIE = "arj_admin";
export const LOGIN_COOKIE = "arj_login";
const SESSION_DAYS = 30;

export interface Admin {
  id: number;
  name: string | null;
  role: "owner" | "admin";
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function sha256Hex(data: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(data)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 24): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Constant-time comparison, so a signature can't be guessed from response timing. */
function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.byteLength !== y.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < x.byteLength; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function sessionCookie(env: Env, telegramId: number): Promise<string> {
  const payload = b64url(
    enc.encode(JSON.stringify({ uid: telegramId, exp: Date.now() + SESSION_DAYS * 86_400_000 })),
  );
  return cookie(
    SESSION_COOKIE,
    `${payload}.${await hmac(env.SESSION_SECRET, payload)}`,
    SESSION_DAYS * 86_400,
  );
}

async function readSession(request: Request, env: Env): Promise<number | null> {
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(env.SESSION_SECRET, payload))) return null;
  try {
    const { uid, exp } = JSON.parse(fromB64url(payload)) as { uid: number; exp: number };
    return Number.isSafeInteger(uid) && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

/** Who this Telegram user is (owner, admin) or null if they aren't allowed in. */
export async function lookupAdmin(env: Env, telegramId: number): Promise<Admin | null> {
  if (telegramId === Number(env.OWNER_TELEGRAM_ID)) return { id: telegramId, name: null, role: "owner" };
  const row = await drizzle(env.DB).select().from(admins).where(eq(admins.telegramId, telegramId)).get();
  return row ? { id: telegramId, name: row.name, role: "admin" } : null;
}

export async function currentAdmin(request: Request, env: Env): Promise<Admin | null> {
  const uid = await readSession(request, env);
  return uid == null ? null : lookupAdmin(env, uid);
}

/** Blocks cross-site form posts: state-changing admin requests must come from our own pages. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}
