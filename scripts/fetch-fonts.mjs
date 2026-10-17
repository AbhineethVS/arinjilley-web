// Downloads the fonts (General Sans + Sentient from Fontshare, JetBrains Mono) into packages/core/assets/fonts/fontshare/,
// and writes poster-fonts.txt (base64 @font-face CSS for the poster renderer).
// They are licensed under the ITF Free Font License, which allows self-hosting on our own site and
// embedding in our own generated images, but NOT redistribution through a public repository.
// So the files are git-ignored and fetched on each machine instead (runs automatically on `npm install`).
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../packages/core/assets/fonts/fontshare");
const FAMILIES = { "general-sans": [500, 600, 700], sentient: [400, 500] };
const FORMATS = ["woff2"]; // for the website and the poster renderer

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

  // The poster renderer gets its fonts inline (base64), so the headless browser downloads nothing.
  // Pre-encoding here means the bot does no encoding work per render.
  const posterFaces = [
    ["General Sans", 500, "GeneralSans-500.woff2"],
    ["General Sans", 600, "GeneralSans-600.woff2"],
    ["General Sans", 700, "GeneralSans-700.woff2"],
    ["JetBrains Mono", 500, "JetBrainsMono-500.woff2"],
    ["JetBrains Mono", 600, "JetBrainsMono-600.woff2"],
  ];
  let posterCss = "";
  for (const [family, weight, file] of posterFaces) {
    const data = (await readFile(join(OUT, file))).toString("base64");
    posterCss += `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2")}`;
  }
  await writeFile(join(OUT, "poster-fonts.txt"), posterCss);
}

main().catch((err) => {
  console.error(`fonts: ${err.message}`);
  process.exit(1);
});
