// Builds the website for Cloudflare Pages (https://arinjilley.pages.dev) into dist/:
//   static files (CSS, favicon), self-hosted fonts, the bundled browser script (app.js),
//   the server code as dist/_worker.js, and _routes.json so static files never run the Worker.
import { copyFile, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const fontsSrc = join(here, "../../packages/core/assets/fonts/fontshare");

let fonts;
try {
  fonts = (await readdir(fontsSrc)).filter((f) => f.endsWith(".woff2"));
} catch {
  fonts = [];
}
if (fonts.length < 7) {
  console.error("web build: fonts missing. Run `npm run fonts` in the project root first.");
  process.exit(1);
}

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "fonts"), { recursive: true });
await cp(join(here, "public"), dist, { recursive: true });
await Promise.all(fonts.map((f) => copyFile(join(fontsSrc, f), join(dist, "fonts", f))));

// Browser script
await build({
  entryPoints: [join(here, "client/app.ts")],
  outfile: join(dist, "app.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  legalComments: "none",
  logLevel: "warning",
});

// Server (Pages "advanced mode": one _worker.js handles every request not excluded in _routes.json)
await build({
  entryPoints: [join(here, "src/index.ts")],
  outfile: join(dist, "_worker.js"),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  conditions: ["workerd", "worker", "browser"],
  mainFields: ["module", "main"],
  legalComments: "none",
  logLevel: "warning",
});

// Static files are served directly by Pages, without running (or counting as) a Worker request.
await writeFile(
  join(dist, "_routes.json"),
  JSON.stringify(
    { version: 1, include: ["/*"], exclude: ["/site.css", "/app.js", "/favicon.svg", "/fonts/*"] },
    null,
    2,
  ),
);
console.log(`web build: dist/ ready (${fonts.length} fonts, app.js, _worker.js)`);
