// Builds the website for Cloudflare Pages (https://arinjilley.pages.dev) into dist/:
//   static files (CSS, favicon), self-hosted fonts, the bundled browser script (app.js),
//   the server code as dist/_worker.js, and _routes.json so static files never run the Worker.
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
// Changes on every build: versions CSS/JS URLs and the service worker's cache.
const BUILD_ID = Date.now().toString(36);
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

// Browser scripts: the public site (app.js) and the admin page (admin.js)
await build({
  entryPoints: { app: join(here, "client/app.ts"), admin: join(here, "client/admin.ts") },
  outdir: dist,
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
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  mainFields: ["module", "main"],
  legalComments: "none",
  logLevel: "warning",
});

// Service worker (offline support + installable app)
await build({
  entryPoints: [join(here, "sw/sw.ts")],
  outfile: join(dist, "sw.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __FONTS__: JSON.stringify(fonts),
    // Built into the worker (Pages would redirect a separate offline.html, which breaks pre-caching).
    __OFFLINE_HTML__: JSON.stringify(await readFile(join(here, "sw/offline.html"), "utf8")),
  },
  legalComments: "none",
  logLevel: "warning",
});

// Static files are served directly by Pages, without running (or counting as) a Worker request.
await writeFile(
  join(dist, "_routes.json"),
  JSON.stringify(
    {
      version: 1,
      include: ["/*"],
      exclude: [
        "/site.css",
        "/admin.css",
        "/app.js",
        "/admin.js",
        "/sw.js",
        "/favicon.svg",
        "/manifest.webmanifest",
        "/admin.webmanifest",
        "/fonts/*",
        "/icons/*",
      ],
    },
    null,
    2,
  ),
);
console.log(
  `web build ${BUILD_ID}: dist/ ready (${fonts.length} fonts, app.js, admin.js, sw.js, _worker.js)`,
);
