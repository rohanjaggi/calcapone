import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse an ISO-ish datetime string the way the user means it:
 *  - explicit offset / Z  → as-is
 *  - "YYYY-MM-DD"         → local midnight in `tz`
 *  - naive "YYYY-MM-DDTHH:mm[:ss]" → wall-clock time in `tz`
 * Returns null for unparseable input.
 */
export function parseInTz(input: string | null | undefined, tz: string): Date | null {
  if (!input) return null;
  const str = input.trim();
  if (!str) return null;
  if (DATE_ONLY.test(str)) {
    const d = fromZonedTime(`${str}T00:00:00`, tz);
    return isNaN(d.getTime()) ? null : d;
  }
  if (HAS_OFFSET.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  // Naive datetime (optionally with a space instead of "T")
  const normalized = str.replace(" ", "T");
  const d = fromZonedTime(normalized, tz);
  return isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD" for the given instant in `tz`. */
export function formatDateInTz(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd");
}

/** "HH:mm" (24h) for the given instant in `tz`. */
export function formatHHmmInTz(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "HH:mm");
}

/** "+08:00"-style UTC offset for `tz` at the given instant. */
export function offsetInTz(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "xxx");
}

/** Today's date string in `tz`. */
export function todayInTz(tz: string, now: Date = new Date()): string {
  return formatDateInTz(now, tz);
}

/** Long weekday name ("Monday") in `tz`. */
export function weekdayInTz(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "EEEE");
}

/** Instant at local midnight of `dateStr` (YYYY-MM-DD) in `tz`. */
export function startOfDayInTz(dateStr: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T00:00:00`, tz);
}

/** Instant at local midnight of the day after `dateStr` in `tz` (exclusive end). */
export function endOfDayInTz(dateStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, tz);
}

/** Combine a YYYY-MM-DD and HH:mm in `tz` into an instant. */
export function combineDateTimeInTz(dateStr: string, timeStr: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr.length === 5 ? `${timeStr}:00` : timeStr}`, tz);
}

/** Minutes since midnight for "HH:mm". */
export function hhmmToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Does `tz` work with Intl? Lenient — use it to sanity-check values already in the database. */
export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Is `tz` acceptable as *new* user input?
 *
 * Stricter than `isValidTz` because Intl also accepts ambiguous legacy aliases — "PST" is
 * accepted but doesn't track US daylight saving, so a user setting it would silently get
 * reminders an hour off for half the year. Require a real Region/City zone, or plain UTC.
 */
export function isSelectableTz(tz: string): boolean {
  if (tz === "UTC") return true;
  if (!/^[A-Za-z][A-Za-z_+-]*\/[A-Za-z0-9_+\-\/]+$/.test(tz)) return false;
  return isValidTz(tz);
}

/** "2026-08-20 15:04" in `tz` — minute precision, for prompts and logs. */
export function formatInTz(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd HH:mm");
}
