import { parseIst } from "@arinjilley/core";
import { describe, expect, it } from "vitest";
import { fromParts, toParts } from "./form";
import { isKerala, type WebListing } from "./listing";
import {
  applyFilters,
  archiveGroups,
  boardGroups,
  card,
  DEFAULT_FILTERS,
  esc,
  type FilterState,
  filterBarHtml,
  filterDefs,
  upcomingGroups,
} from "./render";

const NOW = parseIst("2026-10-20T12:00")!.at;

function listing(over: Partial<WebListing> & { slug: string }): WebListing {
  return {
    title: over.slug,
    organiser: null,
    summary: null,
    howItWorks: [],
    mode: "online",
    city: null,
    venue: null,
    deadline: null,
    start: null,
    end: null,
    teamMin: null,
    teamMax: null,
    eligibility: null,
    feeText: null,
    isFree: false,
    prizeText: null,
    prizeShort: null,
    themes: [],
    registerUrl: null,
    posterKind: "generated",
    posterStyle: 0,
    publishedAt: null,
    posterUrl: null,
    thumbUrl: null,
    kerala: false,
    ...over,
  };
}

describe("admin form dates", () => {
  it("splits and rejoins date + time", () => {
    const f = parseIst("2026-10-25T23:59");
    expect(toParts(f)).toEqual({ date: "2026-10-25", time: "23:59" });
    expect(fromParts(toParts(f))).toEqual(f);
  });
  it("keeps date-only values date-only", () => {
    expect(toParts(parseIst("2026-10-25"))).toEqual({ date: "2026-10-25", time: "" });
    expect(fromParts({ date: "2026-10-25", time: "" })).toEqual(parseIst("2026-10-25"));
  });
  it("treats an empty date as no date", () => {
    expect(toParts(null)).toEqual({ date: "", time: "" });
    expect(fromParts({ date: "", time: "10:00" })).toBeNull();
    expect(fromParts(undefined)).toBeNull();
  });
});

describe("isKerala", () => {
  it("matches Kerala cities in city or venue", () => {
    expect(isKerala({ city: "Kochi", venue: null })).toBe(true);
    expect(isKerala({ city: null, venue: "CUSAT, Kalamassery" })).toBe(true);
    expect(isKerala({ city: "Bengaluru", venue: null })).toBe(false);
  });
});

describe("filters", () => {
  const list = [
    listing({ slug: "a", mode: "online", isFree: true, teamMin: 1, teamMax: 4, themes: ["AI", "Web"] }),
    listing({
      slug: "b",
      mode: "offline",
      city: "Kochi",
      kerala: true,
      teamMin: 2,
      teamMax: 4,
      themes: ["AI"],
    }),
    listing({ slug: "c", mode: "hybrid", teamMin: 1, teamMax: 1, themes: ["Web"], organiser: "Devfolio" }),
  ];
  const run = (s: Partial<FilterState>) =>
    applyFilters(list, { ...DEFAULT_FILTERS, ...s }).map((h) => h.slug);

  it("shows everything by default", () => expect(run({})).toEqual(["a", "b", "c"]));
  it("filters by where", () => {
    expect(run({ where: "online" })).toEqual(["a", "c"]);
    expect(run({ where: "inperson" })).toEqual(["b", "c"]);
    expect(run({ where: "kerala" })).toEqual(["b"]);
  });
  it("filters by fee and team", () => {
    expect(run({ fee: "free" })).toEqual(["a"]);
    expect(run({ team: "solo" })).toEqual(["a", "c"]);
    expect(run({ team: "team" })).toEqual(["a", "b"]);
  });
  it("only offers themes used more than once", () => {
    expect(filterDefs(list).theme.opts.map((o) => o.v)).toEqual(["any", "AI", "Web"]);
    expect(run({ theme: "AI" })).toEqual(["a", "b"]);
  });
  it("searches title, organiser, place and themes", () => {
    expect(run({ q: "devfolio" })).toEqual(["c"]);
    expect(run({ q: "  KOCHI " })).toEqual(["b"]);
  });
  it("ignores unknown filter values (old links)", () =>
    expect(run({ where: "mars" })).toEqual(["a", "b", "c"]));
});

describe("timeline groups", () => {
  const list = [
    listing({ slug: "later", deadline: parseIst("2026-10-25") }),
    listing({ slug: "today", deadline: parseIst("2026-10-20T18:00") }),
    listing({ slug: "tomorrow", deadline: parseIst("2026-10-21T10:00") }),
    listing({ slug: "rolling" }),
    listing({ slug: "past", deadline: parseIst("2026-09-01") }),
  ];

  it("groups upcoming by deadline day, rolling last, without past ones", () => {
    const g = upcomingGroups(list, NOW);
    expect(g.map((x) => [x.label, x.sub, x.items.map((h) => h.slug)])).toEqual([
      ["Today", "Tuesday", ["today"]],
      ["21 Oct", "Tomorrow", ["tomorrow"]],
      ["25 Oct", "Sunday", ["later"]],
      ["Rolling", "No fixed deadline", ["rolling"]],
    ]);
    expect(g[0]!.today).toBe(true);
  });
  it("puts past listings in the archive by month", () => {
    expect(archiveGroups(list, NOW).map((x) => [x.label, x.sub, x.items.map((h) => h.slug)])).toEqual([
      ["Sep", "2026", ["past"]],
    ]);
  });
});

describe("escaping", () => {
  it("escapes HTML in listing text", () => {
    expect(esc(`<script>"x" & 'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
    );
    const html = card(listing({ slug: "x", title: "<img src=x onerror=alert(1)>" }), NOW);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("sorting", () => {
  const list = [
    listing({ slug: "a", deadline: parseIst("2026-10-30"), start: parseIst("2026-11-20"), publishedAt: 3 }),
    listing({ slug: "b", deadline: parseIst("2026-11-05"), start: parseIst("2026-11-01"), publishedAt: 1 }),
    listing({
      slug: "running",
      deadline: parseIst("2026-10-28"),
      start: parseIst("2026-10-15"),
      publishedAt: 2,
    }),
    listing({ slug: "tba", deadline: parseIst("2026-10-25") }),
  ];
  const slugs = (g: ReturnType<typeof boardGroups>) => g.flatMap((x) => x.items.map((h) => h.slug));

  it("closing soonest is the default", () => {
    expect(slugs(boardGroups(list, NOW, "upcoming"))).toEqual(["tba", "running", "a", "b"]);
  });
  it("starting soonest groups by event start, ongoing first, undated last", () => {
    const g = boardGroups(list, NOW, "upcoming", "starting");
    expect(slugs(g)).toEqual(["running", "b", "a", "tba"]);
    expect(g.map((x) => x.kicker)).toEqual(["Event started", "Event starts", "Event starts", undefined]);
    expect(g.at(-1)!.label).toBe("Dates TBA");
  });
  it("recently added is newest first", () => {
    expect(slugs(boardGroups(list, NOW, "upcoming", "added"))).toEqual(["a", "running", "b", "tba"]);
  });
  it("the archive ignores the sort", () => {
    const past = [listing({ slug: "old", deadline: parseIst("2026-09-01") })];
    expect(slugs(boardGroups(past, NOW, "archive", "added"))).toEqual(["old"]);
  });
  it("the bar shows the sort only on upcoming, and Reset only when filtered", () => {
    const defs = filterDefs(list);
    const up = filterBarHtml(DEFAULT_FILTERS, defs, "upcoming", 4);
    expect(up).toContain('data-f="sort"');
    expect(up).toContain("4 hackathons");
    expect(up).not.toContain('id="reset"');
    const ar = filterBarHtml({ ...DEFAULT_FILTERS, fee: "free" }, defs, "archive", 1);
    expect(ar).not.toContain('data-f="sort"');
    expect(ar).toContain("1 hackathon<");
    expect(ar).toContain('id="reset"');
  });
});
