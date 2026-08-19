// src/lib/due-format.ts
import { parseInTz, formatDateInTz } from "@/lib/tz";

/**
 * A model can hand `due_date` back as "Friday", a full datetime, or a plain date. Anything
 * that isn't exactly "YYYY-MM-DD" breaks the string comparisons in `/today` and the overdue
 * filter, and NaN-poisons every escalation check in the reminders cron — silently disabling
 * that item's alerts forever rather than erroring. `parseInTz` already knows how to read an
 * offset/Z datetime, a naive datetime, or a bare date, and already rejects impossible
 * calendar dates (Feb 31, month 13); re-rendering the resulting instant with `formatDateInTz`
 * gives back the calendar day as the user would actually see it in their own zone, so a
 * UTC-midnight-crossing timestamp doesn't land on the wrong day.
 */
export function normalizeDueDate(input: unknown, tz: string): string | null {
  if (typeof input !== "string") return null;
  const instant = parseInTz(input, tz);
  return instant ? formatDateInTz(instant, tz) : null;
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/**
 * Same failure mode as `normalizeDueDate`, for `due_time`: only a zero-padded "HH:mm" is safe
 * to store, so a bare hour or trailing ":ss" is normalized away rather than rejected, but
 * anything that isn't a real clock time ("9am", "noon") is rejected outright — guessing at
 * the intended time is exactly how bad data gets written in the first place.
 */
export function normalizeDueTime(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const match = TIME_RE.exec(input.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
