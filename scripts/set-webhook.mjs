// Points Telegram at the deployed bot and registers the command menus.
// Usage: npm run webhook:set -- https://arinjilley-bot.<your-subdomain>.workers.dev
import { PLACEHOLDER, readDevVars } from "./init-dev-vars.mjs";

const ADMIN_COMMANDS = [
  { command: "start", description: "Start / what this bot does" },
  { command: "help", description: "What I can do" },
  { command: "whoami", description: "Show your Telegram ID and role" },
];
const OWNER_COMMANDS = [
  ...ADMIN_COMMANDS,
  { command: "admins", description: "List admins" },
  { command: "addadmin", description: "Add an admin: /addadmin <id> [name]" },
  { command: "removeadmin", description: "Remove an admin: /removeadmin <id>" },
];
const OWNER_ID = 7204471811;

const base = process.argv[2]?.replace(/\/+$/, "");
if (!base || !/^https:\/\/.+/.test(base)) {
  console.error("Usage: npm run webhook:set -- https://arinjilley-bot.<subdomain>.workers.dev");
  process.exit(1);
}
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret } = readDevVars();
if (!token || token === PLACEHOLDER || !secret) {
  console.error("Fill in TELEGRAM_BOT_TOKEN in apps/bot/.dev.vars first (run `npm run secrets:init`).");
  process.exit(1);
}

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

const me = await call("getMe");
console.log(`bot      @${me.username}`);
await call("setWebhook", {
  url: `${base}/telegram`,
  secret_token: secret,
  allowed_updates: ["message", "edited_message", "callback_query"],
  drop_pending_updates: true,
});
console.log(`webhook  ${base}/telegram`);
await call("setMyCommands", { commands: ADMIN_COMMANDS });
await call("setMyCommands", { commands: OWNER_COMMANDS, scope: { type: "chat", chat_id: OWNER_ID } });
console.log("commands registered (owner gets the admin-management ones too)");
const info = await call("getWebhookInfo");
console.log(
  `status   pending=${info.pending_update_count}${info.last_error_message ? ` last_error="${info.last_error_message}"` : ""}`,
);
