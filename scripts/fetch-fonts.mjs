// Downloads the Fontshare fonts (General Sans, Sentient) into packages/core/assets/fonts/fontshare/.
// They are licensed under the ITF Free Font License, which allows self-hosting on our own site and
// embedding in our own generated images, but NOT redistribution through a public repository.
// So the files are git-ignored and fetched on each machine instead (runs automatically on `npm install`).
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../packages/core/assets/fonts/fontshare");
const FAMILIES = { "general-sans": [500, 600, 700], sentient: [400, 500] };
const FORMATS = ["woff", "woff2"]; // woff for the poster renderer, woff2 for the website

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

async function main() {
  await mkdir(OUT, { recursive: true });
  // One request per family: the API silently drops every family after the first in a combined query.
  let css = "";
  for (const [family, weights] of Object.entries(FAMILIES)) {
    const res = await fetch(
      `https://api.fontshare.com/v2/css?f[]=${family}@${weights.join(",")}&display=swap`,
    );
    if (!res.ok) throw new Error(`Fontshare CSS for ${family}: HTTP ${res.status}`);
    css += await res.text();
  }
  const faces = css.split("@font-face").slice(1);
  let fetched = 0;
  for (const face of faces) {
    const name = face.match(/font-family:\s*'([^']+)'/)?.[1];
    const weight = face.match(/font-weight:\s*(\d+)/)?.[1];
    // The API sometimes appends unrelated families (e.g. Switzer); keep only the ones we asked for.
    if (!name || !weight || !(name.toLowerCase().replace(/\s+/g, "-") in FAMILIES)) continue;
    const family = name.replace(/\s+/g, "");
    const urls = [...face.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
    for (const fmt of FORMATS) {
      const url = urls.find((u) => u.endsWith(`.${fmt}`));
      const file = join(OUT, `${family}-${weight}.${fmt}`);
      if (!url || (await exists(file))) continue;
      const res = await fetch(url.startsWith("//") ? `https:${url}` : url);
      if (!res.ok) throw new Error(`Failed to download ${family} ${weight} ${fmt}: HTTP ${res.status}`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      fetched++;
    }
  }
  // JetBrains Mono (SIL Open Font License) for the website, straight from the official repository.
  for (const [weight, name] of [
    [500, "Medium"],
    [600, "SemiBold"],
  ]) {
    const file = join(OUT, `JetBrainsMono-${weight}.woff2`);
    if (await exists(file)) continue;
    const res = await fetch(
      `https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/webfonts/JetBrainsMono-${name}.woff2`,
    );
    if (!res.ok) throw new Error(`Failed to download JetBrains Mono ${name}: HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    fetched++;
  }
  console.log(fetched ? `fonts: downloaded ${fetched} font files` : "fonts: all font files already present");
}

main().catch((err) => {
  console.error(`fonts: ${err.message}`);
  process.exit(1);
});
