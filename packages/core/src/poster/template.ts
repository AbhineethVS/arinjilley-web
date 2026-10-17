// The boarding-pass poster (1080×1350), as a Satori element tree.
// Satori only supports flexbox and a subset of CSS: every element with more than one child needs display:flex.
import { hostOf, MODE_LABEL, teamText } from "../format";
import { dateRange, dayMonth, deadlineInstant } from "../time";
import type { Hackathon } from "../types";
import { type PosterTheme, resolveStyle } from "./themes";

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

type Style = Record<string, string | number>;
export interface El {
  type: string;
  props: { style?: Style; src?: string; width?: number; height?: number; children?: Child | Child[] };
}
type Child = El | string;

function h(type: string, style: Style, ...children: (Child | null | false | undefined)[]): El {
  const kids = children.filter((c): c is Child => c !== null && c !== false && c !== undefined && c !== "");
  // Satori rejects an empty children array, so childless elements get no children prop at all.
  if (kids.length === 0) return { type, props: { style } };
  return { type, props: { style, children: kids.length === 1 ? kids[0] : kids } };
}

const MONO = "JetBrains Mono";
const SANS = "General Sans";

/** "#RRGGBB" + alpha → "rgba(...)" */
function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function artworkLayer(t: PosterTheme, artwork: number): El {
  const base: Style = {
    position: "absolute",
    top: 0,
    left: 0,
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    display: "flex",
  };
  if (artwork === 0) {
    return h("div", {
      ...base,
      backgroundImage: `radial-gradient(circle, ${rgba(t.ink, 0.16)} 2.4px, transparent 3.4px)`,
      backgroundSize: "32px 32px",
    });
  }
  if (artwork === 1) {
    return h("div", {
      ...base,
      backgroundImage: `repeating-linear-gradient(-45deg, ${rgba(t.ink, 0.06)} 0px, ${rgba(t.ink, 0.06)} 3px, transparent 3px, transparent 34px)`,
    });
  }
  return h("div", {
    ...base,
    backgroundImage: `repeating-radial-gradient(circle at 105% -5%, ${rgba(t.ink, 0.09)} 0px, ${rgba(t.ink, 0.09)} 3px, transparent 3px, transparent 48px)`,
  });
}

/** Simple airplane glyph (Material "flight" path, rotated to point right). */
function plane(color: string): El {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path transform="rotate(90 12 12)" fill="${color}" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;
  return {
    type: "img",
    props: {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      width: 44,
      height: 44,
      style: { opacity: 0.8 },
    },
  };
}

function titleSize(title: string): number {
  const longestWord = Math.max(...title.split(/\s+/).map((w) => w.length));
  const byLength = title.length <= 12 ? 151 : title.length <= 18 ? 130 : title.length <= 26 ? 108 : 91;
  return Math.min(byLength, Math.floor(648 / (0.62 * longestWord)));
}

export type PosterData = Pick<
  Hackathon,
  | "title"
  | "organiser"
  | "mode"
  | "city"
  | "venue"
  | "deadline"
  | "start"
  | "end"
  | "teamMin"
  | "teamMax"
  | "isFree"
  | "feeText"
  | "prizeShort"
  | "themes"
  | "registerUrl"
  | "posterStyle"
>;

export function posterTemplate(d: PosterData): El {
  const { theme: t, artwork } = resolveStyle(d.posterStyle);
  const words = d.title.trim().split(/\s+/);
  const line1 = words.length > 1 ? words.slice(0, -1).join(" ") : d.title;
  let line2 = words.length > 1 ? words[words.length - 1]! : "";
  if (/[a-z]$/i.test(line2)) line2 += ".";
  const fs = titleSize(d.title);

  const modeLabel = MODE_LABEL[d.mode];
  const city = (d.city ?? "").toUpperCase();
  const tag = d.isFree ? "FREE ENTRY" : d.themes[0] ? `THEME: ${d.themes[0].toUpperCase()}` : "NOW OPEN";
  const sub = d.mode === "online" || !city ? "BUILDERS · ONLINE" : `BUILDERS · ${city}`;
  const closes = d.deadline ? deadlineInstant(d.deadline) : null;
  const stamp = closes
    ? ["CLOSES BY", dayMonth(closes).toUpperCase(), "REGISTRATION"]
    : ["STARTS", d.start ? dayMonth(d.start.at).toUpperCase() : "SOON", "SEATS LIMITED"];
  const fare = d.isFree ? "Free" : d.feeText ? d.feeText.split(/[\s·,(]/)[0]! : "TBA";
  const to = ["DEMO", "SHIP", "PITCH"][artwork]!;
  const host = hostOf(d.registerUrl);
  const url = host
    ? host === "luma.com" || host === "lu.ma"
      ? `${host}${new URL(d.registerUrl!).pathname}`
      : host
    : "";
  const mono = (size: number, extra: Style = {}): Style => ({
    fontFamily: MONO,
    fontSize: size,
    letterSpacing: size * 0.08,
    textTransform: "uppercase",
    ...extra,
  });
  const field = (label: string, value: string, highlight = false) =>
    h(
      "div",
      { display: "flex", flexDirection: "column" },
      h("div", mono(16, { opacity: 0.6 }), label),
      h(
        "div",
        {
          display: "flex",
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: -0.6,
          marginTop: 5,
          ...(highlight
            ? { backgroundColor: t.accent, color: t.highlightInk, padding: "0 9px", marginLeft: -9 }
            : {}),
        },
        value,
      ),
    );

  return h(
    "div",
    {
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      display: "flex",
      flexDirection: "column",
      position: "relative",
      backgroundColor: t.bg,
      color: t.ink,
      fontFamily: SANS,
      padding: "76px 76px 70px",
    },
    artworkLayer(t, artwork),

    // top row
    h(
      "div",
      { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
      h(
        "div",
        mono(25, { color: t.accent, maxWidth: 560, lineHeight: 1.3 }),
        `${d.organiser ?? "arinjilley?"} presents`,
      ),
      h(
        "div",
        mono(21, {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          lineHeight: 1.55,
          opacity: 0.92,
        }),
        h("div", {}, "NOW BOARDING"),
        h("div", {}, sub),
        h(
          "div",
          { marginTop: 9, backgroundColor: t.accent, color: t.bg, padding: "4px 13px", fontWeight: 600 },
          tag,
        ),
      ),
    ),

    // title
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        marginTop: 49,
        maxWidth: 650,
        fontSize: fs,
        fontWeight: 700,
        letterSpacing: -0.045 * fs,
        lineHeight: 0.93,
      },
      h("div", { display: "flex" }, line1),
      line2 ? h("div", { display: "flex", color: t.accent }, line2) : null,
    ),

    // stamp
    h(
      "div",
      {
        position: "absolute",
        right: 65,
        top: 292,
        width: 248,
        height: 248,
        borderRadius: 124,
        border: `5px solid ${t.accent}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: t.accent,
        transform: "rotate(9deg)",
      },
      h("div", {
        position: "absolute",
        top: 22,
        left: 22,
        width: 194,
        height: 194,
        borderRadius: 97,
        border: `3px dashed ${rgba(t.accent, 0.7)}`,
      }),
      h("div", mono(17), stamp[0]!),
      h("div", { fontSize: 47, fontWeight: 700, letterSpacing: -1.4, margin: "4px 0" }, stamp[1]!),
      h("div", mono(17), stamp[2]!),
    ),

    // ticket
    h(
      "div",
      {
        marginTop: "auto",
        display: "flex",
        position: "relative",
        backgroundColor: t.paper,
        color: t.paperInk,
        borderRadius: 24,
        transform: "rotate(-2deg)",
        boxShadow: "0 22px 54px rgba(0,0,0,0.35)",
      },
      h("div", {
        position: "absolute",
        left: "71.8%",
        top: -24,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: t.bg,
      }),
      h("div", {
        position: "absolute",
        left: "71.8%",
        bottom: -24,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: t.bg,
      }),
      h(
        "div",
        { width: "74%", display: "flex", flexDirection: "column", padding: "39px 39px 32px" },
        h("div", mono(16, { opacity: 0.6 }), `BOARDING PASS · ${modeLabel.toUpperCase()} HACKATHON`),
        h(
          "div",
          { display: "flex", justifyContent: "space-between", marginTop: 24 },
          h("div", mono(16, { opacity: 0.6 }), "FROM"),
          h("div", mono(16, { opacity: 0.6 }), "TO"),
        ),
        h(
          "div",
          {
            display: "flex",
            alignItems: "center",
            margin: "13px 0 26px",
            fontSize: 71,
            fontWeight: 700,
            letterSpacing: -2.8,
            lineHeight: 1,
          },
          h("div", {}, "IDEA"),
          h("div", { flexGrow: 1, margin: "0 18px", borderTop: `4px dashed ${rgba(t.paperInk, 0.45)}` }),
          plane(t.paperInk),
          h("div", { flexGrow: 1, margin: "0 18px", borderTop: `4px dashed ${rgba(t.paperInk, 0.45)}` }),
          h("div", {}, to),
        ),
        h("div", { borderTop: `3px solid ${rgba(t.paperInk, 0.85)}`, marginBottom: 24 }),
        h(
          "div",
          { display: "flex", justifyContent: "space-between" },
          field("DATE", d.start ? dateRange(d.start, d.end) : "Rolling"),
          field("MODE", modeLabel, true),
          field("SEAT", teamText(d)),
          field("FARE", fare.length > 9 ? fare.slice(0, 9) : fare),
        ),
      ),
      h(
        "div",
        {
          width: "26%",
          display: "flex",
          flexDirection: "column",
          padding: "39px 32px 32px",
          borderLeft: `3px dashed ${rgba(t.paperInk, 0.4)}`,
        },
        h("div", mono(16, { opacity: 0.6 }), "PRIZE"),
        h(
          "div",
          { fontSize: 50, fontWeight: 700, letterSpacing: -2, lineHeight: 1, margin: "11px 0 26px" },
          d.prizeShort ?? "—",
        ),
        h("div", mono(16, { opacity: 0.6 }), closes ? "CLOSES" : "STARTS"),
        h(
          "div",
          { fontSize: 31, fontWeight: 700, marginTop: 6 },
          closes ? dayMonth(closes).toUpperCase() : d.start ? dayMonth(d.start.at).toUpperCase() : "—",
        ),
        h("div", {
          marginTop: "auto",
          height: 108,
          display: "flex",
          backgroundImage: `repeating-linear-gradient(90deg, ${t.paperInk} 0px, ${t.paperInk} 4px, transparent 4px, transparent 8px, ${t.paperInk} 8px, ${t.paperInk} 15px, transparent 15px, transparent 19px, ${t.paperInk} 19px, ${t.paperInk} 21px, transparent 21px, transparent 28px)`,
        }),
      ),
    ),

    // theme chips
    d.themes.length
      ? h(
          "div",
          { display: "flex", flexWrap: "wrap", marginTop: 54 },
          ...d.themes.slice(0, 3).map((theme, i) =>
            h(
              "div",
              {
                border: `3.5px solid ${t.accent}`,
                borderRadius: 97,
                padding: "10px 28px",
                marginRight: 17,
                fontSize: 27,
                fontWeight: 600,
                color: i === 0 ? t.bg : t.accent,
                backgroundColor: i === 0 ? t.accent : "transparent",
              },
              theme,
            ),
          ),
        )
      : null,

    // footer
    h(
      "div",
      { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 45 },
      h(
        "div",
        { display: "flex", flexDirection: "column" },
        h("div", mono(20, { color: t.accent }), "Register at"),
        h(
          "div",
          {
            fontSize: 50,
            fontWeight: 700,
            letterSpacing: -1.5,
            lineHeight: 1.1,
            marginTop: 9,
            maxWidth: 670,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          },
          url || "see listing",
        ),
      ),
      h(
        "div",
        { fontSize: 22, textAlign: "right", opacity: 0.85, lineHeight: 1.4, maxWidth: 300 },
        d.venue ?? d.city ?? "",
      ),
    ),
  );
}
