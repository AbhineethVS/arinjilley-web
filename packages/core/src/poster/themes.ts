/** Colour themes for generated posters (same palette as the approved mock-up). */
export interface PosterTheme {
  bg: string;
  ink: string;
  accent: string;
  paper: string;
  paperInk: string;
  /** text colour on top of the accent highlight inside the ticket */
  highlightInk: string;
}

export const POSTER_THEMES: PosterTheme[] = [
  {
    bg: "#0F3B2E",
    ink: "#F4F1E8",
    accent: "#C8F560",
    paper: "#F4F1E8",
    paperInk: "#14231C",
    highlightInk: "#111111",
  },
  {
    bg: "#1E1C1A",
    ink: "#F4F1E8",
    accent: "#FF9F43",
    paper: "#F2EEE6",
    paperInk: "#1E1C1A",
    highlightInk: "#111111",
  },
  {
    bg: "#0E1A2F",
    ink: "#EEF3FA",
    accent: "#7CC4FF",
    paper: "#EEF3FA",
    paperInk: "#0E1A2F",
    highlightInk: "#111111",
  },
  {
    bg: "#2A1530",
    ink: "#F7EEF5",
    accent: "#FF7AA2",
    paper: "#F7EEF5",
    paperInk: "#2A1530",
    highlightInk: "#111111",
  },
  {
    bg: "#F1EBDD",
    ink: "#1A1714",
    accent: "#E2442F",
    paper: "#FFFFFF",
    paperInk: "#1A1714",
    highlightInk: "#FFFFFF",
  },
  {
    bg: "#0C3236",
    ink: "#EAF4F2",
    accent: "#FFD23F",
    paper: "#EAF4F2",
    paperInk: "#0C3236",
    highlightInk: "#111111",
  },
  {
    bg: "#5A1E16",
    ink: "#F6E9DC",
    accent: "#FFB38A",
    paper: "#F6E9DC",
    paperInk: "#3A130E",
    highlightInk: "#111111",
  },
  {
    bg: "#22272E",
    ink: "#E9EEF2",
    accent: "#5EEAD4",
    paper: "#E9EEF2",
    paperInk: "#22272E",
    highlightInk: "#111111",
  },
];

/** Background pattern variants. */
export const POSTER_ARTWORKS = 3;

/** Total distinct styles = themes × artworks. A style number picks both. */
export const POSTER_STYLE_COUNT = POSTER_THEMES.length * POSTER_ARTWORKS;

export function resolveStyle(style: number): { theme: PosterTheme; artwork: number } {
  const s = ((Math.trunc(style) % POSTER_STYLE_COUNT) + POSTER_STYLE_COUNT) % POSTER_STYLE_COUNT;
  return { theme: POSTER_THEMES[s % POSTER_THEMES.length]!, artwork: Math.floor(s / POSTER_THEMES.length) };
}

/** A random style different from the current one (for "Shuffle style"). */
export function shuffleStyle(current: number, random = Math.random): number {
  const next = Math.floor(random() * (POSTER_STYLE_COUNT - 1));
  return next >= current ? next + 1 : next;
}
