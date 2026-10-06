import { DateTime } from "luxon";

export type SendingWindow = {
  timezone: string;
  sendingStartHour: number; // inclusive, 0-23
  sendingEndHour: number; // exclusive, 1-24
  sendOnWeekends: boolean;
};

function zoneOf(w: SendingWindow) {
  return DateTime.local().setZone(w.timezone).isValid ? w.timezone : "Europe/London";
}

function isAllowedDay(dt: DateTime, w: SendingWindow) {
  return w.sendOnWeekends || dt.weekday <= 5;
}

export function isWithinSendingWindow(at: Date, w: SendingWindow): boolean {
  const local = DateTime.fromJSDate(at, { zone: zoneOf(w) });
  return isAllowedDay(local, w) && local.hour >= w.sendingStartHour && local.hour < w.sendingEndHour;
}

/** The earliest moment at or after `from` that falls inside the sending window. */
export function nextSendingTime(from: Date, w: SendingWindow): Date {
  let local = DateTime.fromJSDate(from, { zone: zoneOf(w) });
  for (let i = 0; i < 10; i++) {
    if (isAllowedDay(local, w)) {
      if (local.hour < w.sendingStartHour) return local.set({ hour: w.sendingStartHour, minute: 0, second: 0, millisecond: 0 }).toJSDate();
      if (local.hour < w.sendingEndHour) return local.toJSDate();
    }
    local = local.plus({ days: 1 }).set({ hour: w.sendingStartHour, minute: 0, second: 0, millisecond: 0 });
  }
  return local.toJSDate();
}

/**
 * When follow-up N should be sent: `delayDays` calendar days after the quote was sent,
 * at the start of the business's sending window (e.g. 09:00 local), never in the past.
 */
export function followUpTime(quoteSentAt: Date, delayDays: number, w: SendingWindow, now = new Date()): Date {
  const target = DateTime.fromJSDate(quoteSentAt, { zone: zoneOf(w) })
    .startOf("day")
    .plus({ days: delayDays })
    .set({ hour: w.sendingStartHour });
  const candidate = nextSendingTime(target.toJSDate(), w);
  return candidate < now ? nextSendingTime(now, w) : candidate;
}

/** Start of "today" in the business's time zone — used for daily send limits. */
export function startOfLocalDay(at: Date, timezone: string): Date {
  return DateTime.fromJSDate(at, { zone: timezone }).startOf("day").toJSDate();
}

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

/** Human-friendly relative time: "Tomorrow at 09:00", "Mon 14 Oct at 09:00". */
export function describeWhen(at: Date, timezone: string, now = new Date()): string {
  const local = DateTime.fromJSDate(at, { zone: timezone });
  const today = DateTime.fromJSDate(now, { zone: timezone }).startOf("day");
  const diff = Math.round(local.startOf("day").diff(today, "days").days);
  const time = local.toFormat("HH:mm");
  if (diff === 0) return `Today at ${time}`;
  if (diff === 1) return `Tomorrow at ${time}`;
  if (diff === -1) return `Yesterday at ${time}`;
  if (diff > 1 && diff < 7) return `${local.toFormat("cccc")} at ${time}`;
  return `${local.toFormat("ccc d LLL")} at ${time}`;
}

export function timeAgo(at: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
