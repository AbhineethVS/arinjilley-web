// Uploads the secrets from apps/bot/.dev.vars to Cloudflare (`wrangler secret put`), piping each value
// through stdin so it never appears on screen or in shell history. Prints key names only.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLACEHOLDER, readDevVars } from "./init-dev-vars.mjs";

const BOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../apps/bot");
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
  const res = spawnSync("npx", ["wrangler", "secret", "put", key], {
    cwd: BOT_DIR,
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
process.exit(failed ? 1 : 0);
