// HTML rendering shared by the server (first page load, link previews, search engines) and the browser
// (re-rendering after filters/search, the side panel). Plain string templates: cheap enough for the free plan.
import {
  type BoardStatus,
  boardStatus,
  countdown,
  DAY,
  dateRange,
  dayMonth,
  deadlineInstant,
  hostOf,
  istDayKey,
  istParts,
  MODE_LABEL,
  MONTHS,
  STATUS_LABEL,
  teamText,
  time12,
  WEEKDAYS,
  weekdayShort,
} from "@arinjilley/core";
import { posterMarkup } from "@arinjilley/core/poster";
import { ICONS } from "./icons";
import type { WebListing } from "./listing";

export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function icon(name: string, cls = "i"): string {
  return `<svg class="${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

const PILL: Record<BoardStatus, string> = {
  open: "open",
  last: "last",
  closed: "closed",
  rolling: "open",
  archived: "departed",
};

/** Poster: the generated boarding pass as HTML, or the uploaded image. */
export function art(h: WebListing, opts: { full?: boolean; alt?: boolean } = {}): string {
  if (h.posterKind !== "generated" && (h.thumbUrl || h.posterUrl)) {
    const src = opts.full ? (h.posterUrl ?? h.thumbUrl) : (h.thumbUrl ?? h.posterUrl);
    return `<img src="${esc(src)}" alt="${opts.alt ? `${esc(h.title)} poster` : ""}" loading="lazy" decoding="async">`;
  }
  return posterMarkup(h);
}

// ── Cards and the timeline ──

export function card(h: WebListing, now: number): string {
  const st = boardStatus(h, now);
  const closes = h.deadline ? deadlineInstant(h.deadline) : null;
  let time: string;
  if (st === "open") time = `<span class="card-time mono">CLOSES ${time12(closes!)}</span>`;
  else if (st === "last")
    time = `<span class="card-time mono last" data-cd="${closes}" data-fmt="caps">CLOSES IN ${countdown(closes! - now).toUpperCase()}</span>`;
  else if (st === "closed") time = `<span class="card-time mono">CLOSED ${time12(closes!)}</span>`;
  else if (st === "rolling")
    time = `<span class="card-time mono">NO DEADLINE${h.start ? ` · STARTS ${weekdayShort(h.start.at).toUpperCase()} ${dayMonth(h.start.at).toUpperCase()}` : ""}</span>`;
  else {
    const ended = closes ?? (h.end ?? h.start)?.at;
    time = `<span class="card-time mono">${closes ? "CLOSED" : "ENDED"} ${ended ? dayMonth(ended).toUpperCase() : ""}</span>`;
  }
  const place = [h.city, h.mode === "online" ? null : MODE_LABEL[h.mode]].filter(Boolean).join(" · ");
  const where =
    h.mode === "online"
      ? `${icon("globe-simple")}<span>Online${h.venue ? ` · ${esc(h.venue)}` : ""}</span>`
      : `${icon("map-pin")}<span>${esc(place || MODE_LABEL[h.mode])}</span>`;
  const fee = h.isFree ? "Free" : h.feeText && h.feeText.length <= 18 ? h.feeText : null;
  const facts = [
    h.start
      ? `<span class="fact">${icon("calendar-blank")}<span class="fact-k">Event</span>${esc(dateRange(h.start, h.end))}</span>`
      : "",
    h.teamMin != null || h.teamMax != null
      ? `<span class="fact">${icon("users")}${esc(teamText(h))}</span>`
      : "",
    h.prizeShort ? `<span class="fact">${icon("trophy")}${esc(h.prizeShort)}</span>` : "",
    fee ? `<span class="fact">${icon("ticket")}${esc(fee)}</span>` : "",
  ].join("");
  return `<a class="card${st === "archived" ? " archived" : ""}" href="/h/${esc(h.slug)}" data-slug="${esc(h.slug)}">
  <div class="card-body">
    <div class="card-top"><span class="pill ${PILL[st]}">${STATUS_LABEL[st]}</span>${time}</div>
    <h3 class="card-title">${esc(h.title)}</h3>
    ${h.organiser ? `<div class="meta">${icon("buildings")}<span>${esc(h.organiser)}</span></div>` : ""}
    <div class="meta">${where}</div>
    ${facts ? `<div class="facts">${facts}</div>` : ""}
  </div>
  <div class="card-thumb">${art(h)}</div>
</a>`;
}

interface Group {
  /** Small caption above the date, saying what the date means. */
  kicker?: string;
  label: string;
  sub: string;
  today?: boolean;
  items: WebListing[];
}

export function upcomingGroups(list: WebListing[], now: number): Group[] {
  const live = list.filter((h) => boardStatus(h, now) !== "archived");
  const dated = live
    .filter((h) => h.deadline)
    .sort(
      (a, b) =>
        deadlineInstant(a.deadline!) - deadlineInstant(b.deadline!) ||
        (a.start?.at ?? 0) - (b.start?.at ?? 0),
    );
  const rolling = live
    .filter((h) => !h.deadline)
    .sort((a, b) => (a.start?.at ?? Infinity) - (b.start?.at ?? Infinity));
  const todayK = istDayKey(now);
  const tomorrowK = istDayKey(now + DAY);
  const groups = new Map<number, Group>();
  for (const h of dated) {
    const at = deadlineInstant(h.deadline!);
    const k = istDayKey(at);
    if (!groups.has(k)) {
      groups.set(k, {
        kicker: "Registration closes",
        label: k === todayK ? "Today" : dayMonth(at),
        sub: k === tomorrowK ? "Tomorrow" : WEEKDAYS[istParts(at).weekday]!,
        today: k === todayK,
        items: [],
      });
    }
    groups.get(k)!.items.push(h);
  }
  const out = [...groups.values()];
  if (rolling.length) out.push({ label: "Rolling", sub: "No fixed deadline", items: rolling });
  return out;
}

/** One timeline group per IST day, captioned by `kicker`; items keep their order. */
function dayGroups(
  items: { h: WebListing; at: number }[],
  now: number,
  kicker: (k: number, todayK: number) => string,
): Group[] {
  const todayK = istDayKey(now);
  const groups = new Map<number, Group>();
  for (const { h, at } of items) {
    const k = istDayKey(at);
    if (!groups.has(k)) {
      const sub =
        k === todayK + 1 ? "Tomorrow" : k === todayK - 1 ? "Yesterday" : WEEKDAYS[istParts(at).weekday]!;
      groups.set(k, {
        kicker: kicker(k, todayK),
        label: k === todayK ? "Today" : dayMonth(at),
        sub,
        today: k === todayK,
        items: [],
      });
    }
    groups.get(k)!.items.push(h);
  }
  return [...groups.values()];
}

/** Upcoming, by the day the event starts (or started, for ones already running). */
export function startingGroups(list: WebListing[], now: number): Group[] {
  const live = list.filter((h) => boardStatus(h, now) !== "archived");
  const dated = live
    .filter((h) => h.start)
    .map((h) => ({ h, at: h.start!.at }))
    .sort((a, b) => a.at - b.at);
  const out = dayGroups(dated, now, (k, today) => (k < today ? "Event started" : "Event starts"));
  const undated = live.filter((h) => !h.start);
  if (undated.length) out.push({ label: "Dates TBA", sub: "No event date yet", items: undated });
  return out;
}

/** Upcoming, newest first, by the day each listing was published. */
export function addedGroups(list: WebListing[], now: number): Group[] {
  const live = list
    .filter((h) => boardStatus(h, now) !== "archived")
    .map((h) => ({ h, at: h.publishedAt ?? 0 }))
    .sort((a, b) => b.at - a.at);
  return dayGroups(live, now, () => "Added");
}

export type SortKey = "closing" | "starting" | "added";
export const SORTS: { v: SortKey; name: string }[] = [
  { v: "closing", name: "Closing soonest" },
  { v: "starting", name: "Starting soonest" },
  { v: "added", name: "Recently added" },
];

/** The timeline for a view: the archive is always by month; upcoming follows the chosen sort. */
export function boardGroups(
  list: WebListing[],
  now: number,
  view: "upcoming" | "archive",
  sort: SortKey = "closing",
): Group[] {
  if (view === "archive") return archiveGroups(list, now);
  if (sort === "starting") return startingGroups(list, now);
  if (sort === "added") return addedGroups(list, now);
  return upcomingGroups(list, now);
}

export function archiveGroups(list: WebListing[], now: number): Group[] {
  const items = list
    .filter((h) => boardStatus(h, now) === "archived")
    .map((h) => ({ h, at: h.deadline ? deadlineInstant(h.deadline) : ((h.end ?? h.start)?.at ?? 0) }))
    .sort((a, b) => b.at - a.at);
  const groups = new Map<number, Group>();
  for (const { h, at } of items) {
    const p = istParts(at);
    const k = p.year * 100 + p.month;
    if (!groups.has(k)) groups.set(k, { label: MONTHS[p.month]!, sub: String(p.year), items: [] });
    groups.get(k)!.items.push(h);
  }
  return [...groups.values()];
}

export function timelineHtml(groups: Group[], now: number, emptyHtml: string): string {
  if (!groups.length) return emptyHtml;
  return groups
    .map(
      (g) => `<section class="day${g.today ? " is-today" : ""}">
  <div class="day-date">${g.kicker ? `<div class="dk mono">${esc(g.kicker)}</div>` : ""}<div class="dd">${esc(g.label)}</div><div class="dw">${esc(g.sub)}</div></div>
  <div class="day-rail" aria-hidden="true"><span class="dot"></span></div>
  <div class="day-cards">${g.items.map((h) => card(h, now)).join("")}</div>
</section>`,
    )
    .join("");
}

export function emptyHtml(filtered: boolean, view: "upcoming" | "archive"): string {
  if (filtered) {
    return `<div class="empty"><b>Nothing matches that</b>Try a wider filter or a different search.<br><button class="btn btn-ghost btn-sm" id="emptyClear">Reset filters</button></div>`;
  }
  return view === "archive"
    ? `<div class="empty"><b>Nothing here yet</b>Past hackathons will show up here.</div>`
    : `<div class="empty"><b>No open hackathons right now</b>New ones are posted in the WhatsApp group first. Check back soon.</div>`;
}

export function soonHtml(list: WebListing[], now: number): string {
  const soon = list
    .filter(
      (h) => h.deadline && deadlineInstant(h.deadline) > now && deadlineInstant(h.deadline) - now < 7 * DAY,
    )
    .sort((a, b) => deadlineInstant(a.deadline!) - deadlineInstant(b.deadline!))
    .slice(0, 4);
  if (!soon.length) return "";
  return `<h2 class="sec-label mono" id="soon-h"><span class="live"></span>CLOSING THIS WEEK</h2><div class="soon-row">${soon
    .map((h) => {
      const closes = deadlineInstant(h.deadline!);
      const last = boardStatus(h, now) === "last";
      return `<a class="soon-tile" href="/h/${esc(h.slug)}" data-slug="${esc(h.slug)}"><div class="soon-thumb">${art(h)}</div><div class="soon-txt"><div class="soon-title">${esc(h.title)}</div><div class="soon-cd mono${last ? " last" : ""}" data-cd="${closes}" data-fmt="in">Closes in ${countdown(closes - now)}</div></div></a>`;
    })
    .join("")}</div>`;
}

export function statsHtml(list: WebListing[], now: number): string {
  const live = list.filter((h) => {
    const s = boardStatus(h, now);
    return s === "open" || s === "last" || s === "rolling";
  }).length;
  const week = list.filter(
    (h) => h.deadline && deadlineInstant(h.deadline) > now && deadlineInstant(h.deadline) - now < 7 * DAY,
  ).length;
  return `<span><b>${live}</b> OPEN NOW</span><span class="dot">·</span><span><b>${week}</b> CLOSING THIS WEEK</span>`;
}

// ── Filters (the editable sentence) ──

export interface FilterState {
  where: string;
  fee: string;
  team: string;
  theme: string;
  q: string;
  sort: SortKey;
}
export const DEFAULT_FILTERS: FilterState = {
  where: "any",
  fee: "any",
  team: "any",
  theme: "any",
  q: "",
  sort: "closing",
};

interface Opt {
  v: string;
  txt: string;
  name: string;
  test: (h: WebListing) => boolean;
}
const any = () => true;

export function filterDefs(
  list: WebListing[],
): Record<"where" | "fee" | "team" | "theme", { label: string; opts: Opt[] }> {
  const counts = new Map<string, number>();
  for (const h of list) for (const t of h.themes) counts.set(t, (counts.get(t) ?? 0) + 1);
  const themes = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([t]) => ({ v: t, txt: t, name: t, test: (h: WebListing) => h.themes.includes(t) }));
  return {
    where: {
      label: "WHERE",
      opts: [
        { v: "any", txt: "anywhere", name: "Anywhere", test: any },
        { v: "online", txt: "online", name: "Online", test: (h) => h.mode !== "offline" },
        { v: "inperson", txt: "in person", name: "In person", test: (h) => h.mode !== "online" },
        { v: "kerala", txt: "in Kerala", name: "In Kerala", test: (h) => h.kerala },
      ],
    },
    fee: {
      label: "ENTRY FEE",
      opts: [
        { v: "any", txt: "free or paid", name: "Free or paid", test: any },
        { v: "free", txt: "free to enter", name: "Free to enter", test: (h) => h.isFree },
      ],
    },
    team: {
      label: "TEAM",
      opts: [
        { v: "any", txt: "any team size", name: "Any team size", test: any },
        { v: "solo", txt: "solo-friendly", name: "Solo-friendly", test: (h) => h.teamMin === 1 },
        { v: "team", txt: "for teams", name: "For teams", test: (h) => h.teamMax == null || h.teamMax > 1 },
      ],
    },
    theme: { label: "THEME", opts: [{ v: "any", txt: "anything", name: "Anything", test: any }, ...themes] },
  };
}

export function applyFilters(list: WebListing[], s: FilterState, defs = filterDefs(list)): WebListing[] {
  const q = s.q.trim().toLowerCase();
  return list.filter(
    (h) =>
      (["where", "fee", "team", "theme"] as const).every((k) =>
        (defs[k].opts.find((o) => o.v === s[k]) ?? defs[k].opts[0]!).test(h),
      ) &&
      (!q || [h.title, h.organiser, h.city, h.venue, ...h.themes].join(" ").toLowerCase().includes(q)),
  );
}

export const isFiltered = (s: FilterState) =>
  s.where !== "any" || s.fee !== "any" || s.team !== "any" || s.theme !== "any";

/**
 * The filter bar, styled like a flight search: a labelled field per filter, then "Sort by" as the ticket stub.
 * Each field opens the shared option menu (see client/app.ts). The archive is always by month, so no sort there.
 */
export function filterBarHtml(
  s: FilterState,
  defs: ReturnType<typeof filterDefs>,
  view: "upcoming" | "archive",
  count: number,
): string {
  const field = (k: "where" | "fee" | "team" | "theme") => {
    const o = defs[k].opts.find((x) => x.v === s[k]) ?? defs[k].opts[0]!;
    return `<button class="fld${s[k] !== "any" ? " set" : ""}" data-f="${k}" aria-haspopup="listbox" aria-expanded="false"><span class="fl mono">${esc(defs[k].label)}</span><span class="fv">${esc(o.name)}</span>${icon("caret-down-bold")}</button>`;
  };
  const sort = SORTS.find((x) => x.v === s.sort) ?? SORTS[0]!;
  const sortField =
    view === "upcoming"
      ? `<button class="fld fsort" data-f="sort" aria-haspopup="listbox" aria-expanded="false"><span class="fl mono">Sort by</span><span class="fv">${esc(sort.name)}</span>${icon("caret-down-bold")}</button>`
      : "";
  const meta = `<div class="fmeta mono"><span>${count} ${count === 1 ? "hackathon" : "hackathons"}</span>${isFiltered(s) ? '<button class="reset" id="reset">Reset filters</button>' : ""}</div>`;
  return `<div class="fbar${sortField ? "" : " no-sort"}"><div class="fgrid">${field("where")}${field("fee")}${field("team")}${field("theme")}</div>${sortField}</div>${meta}`;
}

// ── Detail (side panel and full page) ──

function gcalDeadline(h: WebListing): string | null {
  if (!h.deadline) return null;
  const closes = deadlineInstant(h.deadline);
  const utc = (t: number) =>
    new Date(t)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const details = `Register: ${h.registerUrl ?? ""}\n\nvia arinjilley?`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Registration closes: ${h.title}`)}&dates=${utc(closes - 30 * 60_000)}/${utc(closes)}&details=${encodeURIComponent(details)}`;
}

function gcalEvent(h: WebListing): string | null {
  if (!h.start) return null;
  const s = h.start;
  const e = h.end ?? h.start;
  const utc = (t: number) =>
    new Date(t)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const ymd = (t: number) => {
    const p = istParts(t);
    return `${p.year}${String(p.month + 1).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
  };
  const dates = s.dateOnly || e.dateOnly ? `${ymd(s.at)}/${ymd(e.at + DAY)}` : `${utc(s.at)}/${utc(e.at)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(h.title)}&dates=${dates}&location=${encodeURIComponent(h.venue ?? h.city ?? "")}&details=${encodeURIComponent(h.registerUrl ?? "")}`;
}

function rangeSub(h: WebListing): string {
  const { start: s, end: e } = h;
  if (s && !s.dateOnly && e && !e.dateOnly) {
    return istDayKey(s.at) === istDayKey(e.at)
      ? `${time12(s.at)} – ${time12(e.at)}`
      : `${weekdayShort(s.at)} ${time12(s.at)} → ${weekdayShort(e.at)} ${time12(e.at)}`;
  }
  if (s && e) {
    const days = Math.round((e.at - s.at) / DAY) + 1;
    return days > 1 ? `${days} days` : "One day";
  }
  return "Event dates";
}

export function detailHtml(h: WebListing, now: number): string {
  const st = boardStatus(h, now);
  const closes = h.deadline ? deadlineInstant(h.deadline) : null;
  const host = hostOf(h.registerUrl);
  const deadlineRow = closes
    ? `<div class="row"><div class="ibox cal"><span class="mo">${MONTHS[istParts(closes).month]!.toUpperCase()}</span><span class="da">${istParts(closes).day}</span></div><div><b>Registration closes ${weekdayShort(closes)}, ${dayMonth(closes)}</b><span class="sub">${time12(closes)} IST</span></div></div>`
    : `<div class="row"><div class="ibox">${icon("hourglass-medium")}</div><div><b>No fixed deadline</b><span class="sub">Open until seats fill. Apply early.</span></div></div>`;
  const datesRow = h.start
    ? `<div class="row"><div class="ibox">${icon("calendar-blank")}</div><div><b>${esc(dateRange(h.start, h.end))}</b><span class="sub">${esc(rangeSub(h))}</span></div></div>`
    : "";
  const whereRow =
    h.mode === "online"
      ? `<div class="row"><div class="ibox">${icon("globe-simple")}</div><div><b>Online</b><span class="sub">${esc(h.venue ?? "Take part from anywhere")}</span></div></div>`
      : `<div class="row"><div class="ibox">${icon("map-pin")}</div><div><b>${esc(h.city ?? MODE_LABEL[h.mode])}${h.mode === "hybrid" ? " · Hybrid" : ""}</b><span class="sub">${esc(h.venue ?? "Venue to be announced")}</span></div></div>`;
  const fact = (ic: string, b: string | null, label: string) =>
    b
      ? `<div class="row"><div class="ibox">${icon(ic)}</div><div><b>${esc(b)}</b><span class="sub">${label}</span></div></div>`
      : "";

  let cd = "";
  let title = "";
  let text = "";
  if (st === "open" && closes) {
    cd = `<span class="cd-pill">Closes in <b data-cd="${closes}">${countdown(closes - now)}</b></span>`;
    title = "Registration is open";
    text = "Apply on the organiser's page. Rules can change, so double-check the details there.";
  } else if (st === "last" && closes) {
    cd = `<span class="cd-pill last">Closes in <b data-cd="${closes}">${countdown(closes - now)}</b></span>`;
    title = "Last call";
    text = "Registration closes in under 48 hours. If you're thinking about it, apply now.";
  } else if (st === "closed" && closes) {
    cd = `<span class="cd-pill">Closed at ${time12(closes)}</span>`;
    title = "Registration closed";
    text = "This one's done. It moves to the archive tomorrow.";
  } else if (st === "rolling") {
    cd =
      h.start && h.start.at > now
        ? `<span class="cd-pill">Starts in <b data-cd="${h.start.at}">${countdown(h.start.at - now)}</b></span>`
        : "";
    title = "Open until seats fill";
    text = "No deadline was announced and seats are limited, so apply early.";
  } else {
    title = "This hackathon has departed";
    text = "Registration is closed. Kept here for reference.";
  }
  const canDl = closes != null && closes > now;
  const canEv = h.start != null && (h.end ?? h.start).at > now;
  const dl = canDl ? gcalDeadline(h) : null;
  const ev = canEv ? gcalEvent(h) : null;
  const link = (href: string | null, ic: string, label: string) =>
    href
      ? `<a class="btn btn-ghost btn-sm" href="${esc(href)}" target="_blank" rel="noopener">${icon(ic)}${label}</a>`
      : `<span class="btn btn-ghost btn-sm" aria-disabled="true">${icon(ic)}${label}</span>`;

  return `<div class="pp">${art(h, { full: true, alt: true })}</div>
<h1 class="d-title display">${esc(h.title)}</h1>
${h.organiser ? `<div class="d-by"><span class="av">${icon("buildings")}</span>by ${esc(h.organiser)}</div>` : ""}
<div class="rows">${deadlineRow}${datesRow}${whereRow}</div>
<div class="grid2">
  ${fact("users", h.teamMin != null || h.teamMax != null ? teamText(h) : null, "Team size")}
  ${fact("trophy", h.prizeText, "Prizes")}
  ${fact("ticket", h.feeText ?? (h.isFree ? "Free" : null), "Entry fee")}
  ${fact("graduation-cap", h.eligibility, "Who can join")}
</div>
<div class="cta">
  <div class="cta-top"><span class="pill ${PILL[st]}">${STATUS_LABEL[st]}</span>${cd}</div>
  <h3>${title}</h3><p>${text}</p>
  <div class="cta-actions">
    ${h.registerUrl ? `<a class="btn btn-primary" href="${esc(h.registerUrl)}" target="_blank" rel="noopener">Register on ${esc(host)}${icon("arrow-up-right")}</a>` : ""}
    ${link(dl, "alarm", "Add deadline")}
    ${link(ev, "calendar-plus", "Add event dates")}
  </div>
</div>
${h.summary ? `<div class="psec"><h4>ABOUT</h4><p>${esc(h.summary)}</p></div>` : ""}
${h.howItWorks.length ? `<div class="psec"><h4>HOW IT WORKS</h4><ol class="how">${h.howItWorks.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>` : ""}
${h.themes.length ? `<div class="psec"><h4>THEMES</h4><div class="tags">${h.themes.map((t) => `<span>${esc(t)}</span>`).join("")}</div></div>` : ""}
<div class="src">${icon("info")}<span>Listed by arinjilley? admins. Always confirm dates and rules${h.registerUrl ? ` on <a href="${esc(h.registerUrl)}" target="_blank" rel="noopener">${esc(host)}</a>` : " with the organiser"}.</span></div>`;
}
