// Share buttons ([data-share], with data-share-title/-text/-url/-img). On phones they open the native share
// sheet with the poster attached, so it lands in WhatsApp as an image with the message as its caption. On
// laptops (and anywhere sharing isn't available) they copy the message and link instead.
//
// Browsers only allow sharing straight from a tap, so the poster is fetched ahead of time (prefetchShare),
// not after the tap.

const files = new Map<string, File>();

/** Downloads a poster once so a later tap can attach it. Silent if the browser can't share files. */
export function prefetchShare(btn: HTMLElement | null) {
  const src = btn?.dataset.shareImg;
  if (!src || files.has(src) || !navigator.canShare) return;
  fetch(src)
    .then((r) => (r.ok ? r.blob() : null))
    .then((blob) => {
      if (!blob) return;
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const file = new File([blob], `arinjilley-poster.${ext}`, { type: blob.type || "image/jpeg" });
      if (navigator.canShare({ files: [file] })) files.set(src, file);
    })
    .catch(() => {});
}

async function copy(text: string, toast: (m: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied. Paste it in any chat.");
  } catch {
    toast("Couldn't copy it");
  }
}

export function setupShare(toast: (message: string) => void) {
  for (const b of document.querySelectorAll<HTMLElement>("[data-share]")) prefetchShare(b);
  document.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-share]");
    if (!b) return;
    e.preventDefault();
    const {
      shareTitle: title = "",
      shareText: text = "",
      shareUrl: url = location.href,
      shareImg: img,
    } = b.dataset;
    const message = `${text}\n${url}`;
    const touch = matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.share) {
      const file = img ? files.get(img) : undefined;
      try {
        // With an image, the link goes in the text: some apps drop the separate url when a file is attached.
        await navigator.share(file ? { files: [file], title, text: message } : { title, text, url });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // closed the share sheet
      }
    }
    await copy(message, toast);
  });
}
