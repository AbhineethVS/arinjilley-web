// Uploads the secrets from apps/bot/.dev.vars to Cloudflare, piping each value through stdin so it never
// appears on screen or in shell history. Prints key names only.
//
//   node scripts/push-secrets.mjs          → the bot Worker   (wrangler secret put)
//   node scripts/push-secrets.mjs --web    → the Pages site   (wrangler pages secret put), and copies the file
//                                            to apps/web/.dev.vars for local `wrangler pages dev`
//
// Pages only picks up changed secrets on its next deployment, so run `npm run deploy:web` afterwards.
import { spawnSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_VARS, PLACEHOLDER, readDevVars } from "./init-dev-vars.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = process.argv.includes("--web");
const CHECKS = {
  TELEGRAM_BOT_TOKEN: /^\d{6,}:[\w-]{30,}$/,
  OPENAI_API_KEY: /^sk-[\w-]{20,}$/,
  TELEGRAM_WEBHOOK_SECRET: /^[A-Za-z0-9_-]{32,256}$/,
  SESSION_SECRET: /^.{32,}$/,
};

const vars = readDevVars();
let failed = false;
for (const [key, pattern] of Object.entries(CHECKS)) {
  const value = vars[key];
  if (!value || value === PLACEHOLDER) {
    console.log(`skip  ${key} (not filled in yet)`);
    continue;
  }
  if (!pattern.test(value)) {
    console.log(`skip  ${key} (doesn't look right: check for extra spaces or a partial copy)`);
    failed = true;
    continue;
  }
  const args = web
    ? ["wrangler", "pages", "secret", "put", key, "--project-name", "arinjilley"]
    : ["wrangler", "secret", "put", key];
  const res = spawnSync("npx", args, {
    cwd: join(ROOT, web ? "apps/web" : "apps/bot"),
    input: value,
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  if (res.status === 0) console.log(`ok    ${key}`);
  else {
    failed = true;
    // wrangler's output never contains the value, but trim it to the useful part anyway
    console.log(`FAIL  ${key}\n${(res.stderr || res.stdout || "").split("\n").slice(-6).join("\n")}`);
  }
}
if (web) {
  copyFileSync(DEV_VARS, join(ROOT, "apps/web/.dev.vars"));
  console.log(
    "\nCopied to apps/web/.dev.vars. Now run `npm run deploy:web` so the site picks up the secrets.",
  );
}
process.exit(failed ? 1 : 0);
