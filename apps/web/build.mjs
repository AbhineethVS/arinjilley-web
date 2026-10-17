// Build step for the website (run automatically by `wrangler dev` / `wrangler deploy`):
// 1. copies the self-hosted fonts into public/fonts (they're git-ignored; see scripts/fetch-fonts.mjs)
// 2. bundles client/app.ts into public/app.js
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const fontsSrc = join(here, "../../packages/core/assets/fonts/fontshare");
const fontsOut = join(here, "public/fonts");

let files;
try {
  files = (await readdir(fontsSrc)).filter((f) => f.endsWith(".woff2"));
} catch {
  files = [];
}
if (files.length < 7) {
  console.error("web build: fonts missing. Run `npm run fonts` in the project root first.");
  process.exit(1);
}
await mkdir(fontsOut, { recursive: true });
await Promise.all(files.map((f) => copyFile(join(fontsSrc, f), join(fontsOut, f))));

await build({
  entryPoints: [join(here, "client/app.ts")],
  outfile: join(here, "public/app.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  legalComments: "none",
  logLevel: "warning",
});
console.log(`web build: ${files.length} fonts, app.js bundled`);
