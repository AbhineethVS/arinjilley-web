// All dates are shown in IST. India has no daylight saving, so a fixed +5:30 offset is exact.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const IST_OFFSET = 5.5 * HOUR;

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A moment in time, plus whether only the date (not the time of day) is known. */
export interface DateField {
  at: number; // epoch ms; for date-only values this is 00:00 IST that day
  dateOnly: boolean;
}

export interface IstParts {
  year: number;
  month: number; // 0-11
  day: number;
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
}

export function istParts(at: number): IstParts {
  const d = new Date(at + IST_OFFSET);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Sortable number for the IST calendar day, e.g. 20261025. */
export function istDayKey(at: number): number {
  const p = istParts(at);
  return p.year * 10_000 + (p.month + 1) * 100 + p.day;
}

/** Parses "2026-10-25" (date only) or "2026-10-25T23:59" (IST wall time). Returns null if invalid. */
export function parseIst(value: string | null | undefined): DateField | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dateOnly = h === undefined;
  const at = Date.UTC(+y!, +mo! - 1, +d!, dateOnly ? 0 : +h!, dateOnly ? 0 : +mi!) - IST_OFFSET;
  const back = istParts(at);
  if (back.year !== +y! || back.month !== +mo! - 1 || back.day !== +d!) return null; // e.g. 31 Feb
  return { at, dateOnly };
}

/** "2026-10-25" or "2026-10-25T23:59": the inverse of parseIst. */
export function formatIstInput(field: DateField): string {
  const p = istParts(field.at);
  const date = `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
  return field.dateOnly ? date : `${date}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** The effective instant a deadline closes: date-only deadlines close at 23:59 IST that day. */
export function deadlineInstant(field: DateField): number {
  return field.dateOnly ? field.at + DAY - MINUTE : field.at;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "25 Oct" */
export const dayMonth = (at: number) => {
  const p = istParts(at);
  return `${p.day} ${MONTHS[p.month]}`;
};
/** "Sun" */
export const weekdayShort = (at: number) => WEEKDAYS[istParts(at).weekday]!.slice(0, 3);
/** "Sunday" */
export const weekdayLong = (at: number) => WEEKDAYS[istParts(at).weekday]!;
/** "11:59 PM" */
export const time12 = (at: number) => {
  const p = istParts(at);
  return `${p.hour % 12 || 12}:${pad(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`;
};
/** "Sun, 25 Oct, 11:59 PM" (time left out for date-only values) */
export const fullDate = (field: DateField) =>
  `${weekdayShort(field.at)}, ${dayMonth(field.at)}${field.dateOnly ? "" : `, ${time12(field.at)}`}`;

/** "13–14 Nov", "30 Oct – 1 Nov", "Sat, 24 Oct", "Until 24 Oct" */
export function dateRange(start: DateField | null, end: DateField | null): string {
  if (!start && !end) return "";
  if (!start) return `Until ${dayMonth(end!.at)}`;
  if (!end || istDayKey(start.at) === istDayKey(end.at))
    return `${weekdayShort(start.at)}, ${dayMonth(start.at)}`;
  const a = istParts(start.at);
  const b = istParts(end.at);
  if (a.month === b.month && a.year === b.year) return `${a.day}–${b.day} ${MONTHS[a.month]}`;
  return `${dayMonth(start.at)} – ${dayMonth(end.at)}${a.year !== b.year ? ` ${b.year}` : ""}`;
}

/** "2d 5h", "3h 10m", "12m" */
export function countdown(ms: number): string {
  const t = Math.max(0, ms);
  const d = Math.floor(t / DAY);
  const h = Math.floor((t % DAY) / HOUR);
  const m = Math.floor((t % HOUR) / MINUTE);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
