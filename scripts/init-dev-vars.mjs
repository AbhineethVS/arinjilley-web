// Creates apps/bot/.dev.vars (git-ignored) with placeholders for the secrets you paste in yourself,
// and fills the two random secrets automatically. Never prints secret values.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEV_VARS = join(dirname(fileURLToPath(import.meta.url)), "../apps/bot/.dev.vars");
export const PLACEHOLDER = "paste-here";

const KEYS = [
  ["TELEGRAM_BOT_TOKEN", () => PLACEHOLDER, "From @BotFather (looks like 1234567890:AAH...)"],
  ["OPENAI_API_KEY", () => PLACEHOLDER, "From platform.openai.com → API keys (starts with sk-)"],
  ["TELEGRAM_WEBHOOK_SECRET", () => randomBytes(32).toString("hex"), "Auto-generated. Leave as is."],
  ["SESSION_SECRET", () => randomBytes(32).toString("hex"), "Auto-generated. Leave as is."],
];

export function readDevVars() {
  if (!existsSync(DEV_VARS)) return {};
  return Object.fromEntries(
    readFileSync(DEV_VARS, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [
          l.slice(0, i).trim(),
          l
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

function main() {
  const current = readDevVars();
  const lines = existsSync(DEV_VARS)
    ? readFileSync(DEV_VARS, "utf8").trimEnd().split(/\r?\n/)
    : [
        "# Secrets for the bot. This file is git-ignored: never commit it or share it.",
        "# Paste your values after the = sign (no quotes, no spaces), then save.",
        "",
      ];
  const added = [];
  for (const [key, make, hint] of KEYS) {
    if (key in current) continue;
    lines.push(`# ${hint}`, `${key}=${make()}`, "");
    added.push(key);
  }
  writeFileSync(DEV_VARS, `${lines.join("\n").trimEnd()}\n`);
  console.log(
    added.length ? `Added to apps/bot/.dev.vars: ${added.join(", ")}` : "apps/bot/.dev.vars is up to date.",
  );
  const missing = KEYS.map(([k]) => k).filter((k) => (readDevVars()[k] ?? PLACEHOLDER) === PLACEHOLDER);
  if (missing.length) console.log(`Still to paste in: ${missing.join(", ")}`);
}

if (import.meta.main) main();
