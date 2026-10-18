// The folder artwork (from Uiverse.io by junaid_3671): a back panel, up to three poster cards, and a glassy
// front flap with a label. Shared by the corner folder (server-rendered shell) and the phone sheet (client).

export const FOLDER_PATH =
  "M0 25C0 11.1929 11.1929 0 25 0H136.084C143.044 0 149.689 2.90139 154.42 8.00608L178.08 33.5343C182.811 38.639 189.456 41.5404 196.416 41.5404H296C309.807 41.5404 321 52.7333 321 66.5404V216C321 229.807 309.807 241 296 241H25C11.1929 241 0 229.807 0 216V25Z";

/** Up to three posters' markup, the one to show on top first. */
export function folderCards(cards: string[]): string {
  // DOM order is paint order: the first card goes last so it sits on top.
  return cards
    .slice(0, 3)
    .map((art, i) => `<span class="fd-card fd-card-${i + 1}">${art}</span>`)
    .reverse()
    .join("");
}

/** The whole artwork. `ids` adds the hooks the corner folder updates in place. */
export function folderArt(cards: string[], label: string, ids = false): string {
  return `<div class="fd-stage" aria-hidden="true">
  <div class="fd-back"></div>
  <div class="fd-cards"${ids ? ' id="fdCards"' : ""}>${folderCards(cards)}</div>
  <div class="fd-flap">
    <div class="fd-flap-blur" style="clip-path:path('${FOLDER_PATH}');-webkit-clip-path:path('${FOLDER_PATH}')"></div>
    <svg viewBox="0 0 321 241" width="321" height="241"><path d="${FOLDER_PATH}" fill="var(--fd-flap-fill)" fill-opacity="var(--fd-flap-opacity)" stroke="var(--fd-flap-stroke)"/></svg>
    <span class="fd-label mono"><i class="fd-dot"></i><span${ids ? ' id="fdLabel"' : ""}>${label}</span></span>
  </div>
</div>`;
}
