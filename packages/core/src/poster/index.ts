// Renders the boarding-pass poster to PNG inside a Cloudflare Worker.
// Satori turns the element tree into SVG; resvg turns the SVG into a PNG.
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import satori, { init as initSatori } from "satori/standalone";
// Pinned to satori 0.32.0 (the last release without HarfBuzz): later versions bundle HarfBuzz, which compiles WebAssembly at runtime, and
// Cloudflare Workers forbid that. 0.32.0 measures text with opentype.js instead.
import yogaWasm from "satori/yoga.wasm";
import generalSans500 from "../../assets/fonts/fontshare/GeneralSans-500.woff";
import generalSans600 from "../../assets/fonts/fontshare/GeneralSans-600.woff";
import generalSans700 from "../../assets/fonts/fontshare/GeneralSans-700.woff";
import jetbrainsMono500 from "../../assets/fonts/JetBrainsMono-Medium.ttf";
import { POSTER_HEIGHT, POSTER_WIDTH, type PosterData, posterTemplate } from "./template";

export { POSTER_HEIGHT, POSTER_WIDTH, type PosterData, posterTemplate } from "./template";
export * from "./themes";

let ready: Promise<void> | null = null;

function init(): Promise<void> {
  ready ??= Promise.all([initSatori(yogaWasm), initWasm(resvgWasm)]).then(
    () => undefined,
    (err) => {
      ready = null; // allow a retry on the next request
      throw err;
    },
  );
  return ready;
}

const FONTS = [
  { name: "General Sans", data: generalSans500, weight: 500 as const, style: "normal" as const },
  { name: "General Sans", data: generalSans600, weight: 600 as const, style: "normal" as const },
  { name: "General Sans", data: generalSans700, weight: 700 as const, style: "normal" as const },
  { name: "JetBrains Mono", data: jetbrainsMono500, weight: 500 as const, style: "normal" as const },
];

export async function renderPosterSvg(data: PosterData): Promise<string> {
  await init();
  // Satori's types expect React elements; our plain {type, props} objects have the same shape.
  return satori(posterTemplate(data) as unknown as Parameters<typeof satori>[0], {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    fonts: FONTS,
  });
}

export async function renderPosterPng(data: PosterData): Promise<Uint8Array> {
  const svg = await renderPosterSvg(data);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: POSTER_WIDTH } });
  const png = resvg.render().asPng();
  resvg.free();
  return png;
}
