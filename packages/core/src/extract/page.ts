// Reads a registration page (Luma, Devfolio, Unstop, Devpost, college sites…) for extra details when a post
// is thin. Uses Cloudflare's streaming HTMLRewriter, which is cheap on CPU. Failures return null.

export interface PageInfo {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  jsonLd: string | null; // structured event data, often includes exact dates and venue
  text: string | null; // visible text excerpt
}

const MAX_TEXT = 5000;
const MAX_JSONLD = 4000;

export async function fetchPageInfo(url: string, timeoutMs = 8000): Promise<PageInfo | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; arinjilleyBot/1.0; +https://t.me/arinjilley_bot)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;

  const meta: Record<string, string> = {};
  let title = "";
  let jsonLd = "";
  let text = "";
  let inJsonLd = false;

  const rewriter = new HTMLRewriter()
    .on("meta", {
      element(el) {
        const key = (el.getAttribute("property") ?? el.getAttribute("name") ?? "").toLowerCase();
        const content = el.getAttribute("content");
        if (key && content && !(key in meta)) meta[key] = content;
      },
    })
    .on("title", {
      text(t) {
        if (title.length < 300) title += t.text;
      },
    })
    .on('script[type="application/ld+json"]', {
      element() {
        inJsonLd = true;
      },
      text(t) {
        if (inJsonLd && jsonLd.length < MAX_JSONLD) jsonLd += t.text;
        if (t.lastInTextNode) inJsonLd = false;
      },
    })
    .on("h1, h2, h3, p, li, time, dt, dd", {
      text(t) {
        if (text.length >= MAX_TEXT) return;
        text += t.text;
        if (t.lastInTextNode) text += "\n";
      },
    });

  try {
    await rewriter.transform(res).text();
  } catch {
    return null;
  }

  const clean = (s: string) => s.replace(/\s+/g, " ").trim() || null;
  return {
    url: res.url || url,
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? title),
    description: clean(meta["og:description"] ?? meta.description ?? meta["twitter:description"] ?? ""),
    image: meta["og:image"] ?? meta["twitter:image"] ?? null,
    jsonLd: clean(jsonLd)?.slice(0, MAX_JSONLD) ?? null,
    text: clean(text.replace(/\n{2,}/g, "\n"))?.slice(0, MAX_TEXT) ?? null,
  };
}
