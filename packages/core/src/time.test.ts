import { describe, expect, it } from "vitest";
import { boardStatus } from "./status";
import { countdown, dateRange, deadlineInstant, formatIstInput, fullDate, istDayKey, parseIst } from "./time";

const at = (s: string) => parseIst(s)!.at;

describe("parseIst", () => {
  it("reads IST wall time", () => {
    expect(new Date(at("2026-10-25T23:59")).toISOString()).toBe("2026-10-25T18:29:00.000Z");
  });
  it("marks date-only values", () => {
    expect(parseIst("2026-10-25")).toEqual({ at: Date.parse("2026-10-24T18:30:00Z"), dateOnly: true });
  });
  it("rejects impossible dates and junk", () => {
    expect(parseIst("2026-02-31")).toBeNull();
    expect(parseIst("25 Oct")).toBeNull();
    expect(parseIst("")).toBeNull();
  });
  it("round-trips through formatIstInput", () => {
    for (const s of ["2026-10-25", "2026-10-25T09:05"]) expect(formatIstInput(parseIst(s)!)).toBe(s);
  });
});

describe("formatting", () => {
  it("formats full dates", () => {
    expect(fullDate(parseIst("2026-10-25T23:59")!)).toBe("Sun, 25 Oct, 11:59 PM");
    expect(fullDate(parseIst("2026-10-25")!)).toBe("Sun, 25 Oct");
  });
  it("formats ranges", () => {
    expect(dateRange(parseIst("2026-11-13"), parseIst("2026-11-14"))).toBe("13–14 Nov");
    expect(dateRange(parseIst("2026-10-30"), parseIst("2026-11-01"))).toBe("30 Oct – 1 Nov");
    expect(dateRange(parseIst("2026-10-20"), parseIst("2027-03-02"))).toBe("20 Oct – 2 Mar 2027");
    expect(dateRange(parseIst("2026-10-17T11:30"), parseIst("2026-10-17T18:00"))).toBe("Sat, 17 Oct");
  });
  it("formats countdowns", () => {
    expect(countdown(2 * 86_400_000 + 5 * 3_600_000 + 59_000)).toBe("2d 5h");
    expect(countdown(3 * 3_600_000 + 10 * 60_000)).toBe("3h 10m");
    expect(countdown(-5)).toBe("0m");
  });
  it("uses IST calendar days, not UTC", () => {
    // 00:30 IST on 25 Oct is still 24 Oct in UTC
    expect(istDayKey(at("2026-10-25T00:30"))).toBe(20261025);
  });
});

describe("boardStatus", () => {
  const listing = (deadline: string | null, start?: string, end?: string) => ({
    deadline: parseIst(deadline),
    start: parseIst(start),
    end: parseIst(end),
  });

  it("is open more than 48h before the deadline", () => {
    expect(boardStatus(listing("2026-10-25T23:59"), at("2026-10-20T10:00"))).toBe("open");
  });
  it("is LAST CALL within 48h", () => {
    expect(boardStatus(listing("2026-10-25T23:59"), at("2026-10-24T10:00"))).toBe("last");
  });
  it("is closed for the rest of the deadline day, then archived", () => {
    const l = listing("2026-10-25T12:00");
    expect(boardStatus(l, at("2026-10-25T18:00"))).toBe("closed");
    expect(boardStatus(l, at("2026-10-26T00:01"))).toBe("archived");
  });
  it("treats date-only deadlines as closing at 23:59 IST", () => {
    const l = listing("2026-10-24");
    expect(deadlineInstant(l.deadline!)).toBe(at("2026-10-24T23:59"));
    expect(boardStatus(l, at("2026-10-24T23:00"))).toBe("last");
  });
  it("keeps rolling listings until the day after the hackathon ends", () => {
    const l = listing(null, "2026-10-24T17:00", "2026-10-25T11:00");
    expect(boardStatus(l, at("2026-10-25T20:00"))).toBe("rolling");
    expect(boardStatus(l, at("2026-10-26T08:00"))).toBe("archived");
  });
  it("keeps listings with no dates at all", () => {
    expect(boardStatus(listing(null), at("2030-01-01T00:00"))).toBe("rolling");
  });
});
