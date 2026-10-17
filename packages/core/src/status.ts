import { DAY, deadlineInstant, istDayKey } from "./time";
import type { Hackathon } from "./types";

/**
 * Public status of a live listing (SPEC §8.3):
 * - open:     deadline more than 48 h away
 * - last:     deadline within 48 h ("LAST CALL")
 * - closed:   deadline passed earlier today (IST)
 * - rolling:  no deadline, hackathon not over yet
 * - archived: the day after the deadline, or for rolling listings the day after the hackathon ends
 */
export type BoardStatus = "open" | "last" | "closed" | "rolling" | "archived";

export const LAST_CALL_WINDOW = 2 * DAY;

export function boardStatus(h: Pick<Hackathon, "deadline" | "start" | "end">, now = Date.now()): BoardStatus {
  if (h.deadline) {
    const closes = deadlineInstant(h.deadline);
    if (now > closes) return istDayKey(now) === istDayKey(closes) ? "closed" : "archived";
    return closes - now < LAST_CALL_WINDOW ? "last" : "open";
  }
  const lastDay = h.end ?? h.start;
  if (lastDay && istDayKey(now) > istDayKey(lastDay.at)) return "archived";
  return "rolling";
}

export const STATUS_LABEL: Record<BoardStatus, string> = {
  open: "OPEN",
  last: "LAST CALL",
  closed: "CLOSED",
  rolling: "OPEN",
  archived: "DEPARTED",
};
