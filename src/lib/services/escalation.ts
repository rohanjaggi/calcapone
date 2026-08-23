export type Rung = {
  /** Fire once the deadline is this many hours away or nearer. 0 means "at or past due". */
  hoursBefore: number;
  /** Headline for the alert, e.g. "Due soon". */
  label: string;
};

/**
 * One ladder for every item, ordered nearest-deadline-last so a rung's array index doubles
 * as its 1-based stage number.
 */
export const LADDER: Rung[] = [
  { hoursBefore: 24, label: "Due" },
  { hoursBefore: 2, label: "Due soon" },
  { hoursBefore: 0, label: "Overdue" },
];

/** `notificationStage` counts 0..this, so the candidate query bounds on it. */
export const MAX_ESCALATION_STAGE = LADDER.length;

/**
 * The rung this item should be on now, or null if it is already there (or past everything).
 * Stage numbers are 1-based positions in the ladder.
 *
 * Picks the LAST rung whose threshold is still `>= hoursUntilDue` — i.e. the tightest one the
 * deadline currently satisfies — rather than the first. An item the cron only starts watching
 * once it's 30 minutes out must land on "Due soon" immediately; walking the ladder from the
 * top would fire the 24h rung for an item that was never seen 24h out.
 */
export function nextEscalation(
  hoursUntilDue: number,
  currentStage: number
): { stage: number; label: string } | null {
  let matchIndex = -1;
  for (let i = 0; i < LADDER.length; i++) {
    if (LADDER[i].hoursBefore >= hoursUntilDue) matchIndex = i;
  }
  if (matchIndex === -1) return null;

  const stage = matchIndex + 1;
  if (stage <= currentStage) return null;

  return { stage, label: LADDER[matchIndex].label };
}

/**
 * How close a deadline is, for display. Distinct from the ladder above, which decides *when
 * to push a notification*; this decides *how to colour and label a row the user is already
 * looking at*. The thresholds are read off LADDER so the two can't drift apart — a row turns
 * amber at exactly the hour the "Due soon" push would fire.
 */
export type Severity = "overdue" | "urgent" | "soon" | "upcoming";

export type Urgency = { label: string; severity: Severity };

const URGENT_HOURS = LADDER[1].hoursBefore; // 2
const SOON_HOURS = LADDER[0].hoursBefore; // 24

function severityFor(hoursUntilDue: number): Severity {
  if (hoursUntilDue < 0) return "overdue";
  if (hoursUntilDue <= URGENT_HOURS) return "urgent";
  if (hoursUntilDue <= SOON_HOURS) return "soon";
  return "upcoming";
}

/**
 * Natural-language countdown.
 *
 * Days come from the calendar-day gap rather than `hours / 24`, because "tomorrow" is a
 * property of the date, not of elapsed time: something due at 09:00 tomorrow is 30 hours out
 * but is still tomorrow, and "in 1 day" would read as wrong.
 */
function countdownLabel(daysUntilDue: number, hoursUntilDue: number, minutesUntilDue: number): string {
  if (hoursUntilDue < 0) return "overdue";
  if (daysUntilDue <= 0) {
    if (minutesUntilDue < 60) return `in ${Math.max(1, Math.round(minutesUntilDue))}m`;
    return `in ${Math.round(hoursUntilDue)}h`;
  }
  if (daysUntilDue === 1) return "tomorrow";
  if (daysUntilDue < 14) return `in ${daysUntilDue} days`;
  return `in ${Math.round(daysUntilDue / 7)} weeks`;
}

/**
 * The badge for one deadline, or null when there is no deadline to describe.
 *
 * An item with a due date but no due time is treated as due at end of day — the same
 * assumption the escalation cron makes (`item.dueTime ?? "23:59"`), so a row and its push
 * agree about when "today" runs out.
 */
export function deadlineUrgency(
  dueDate: string | null,
  dueTime: string | null,
  todayStr: string,
  now: Date,
  combine: (dateStr: string, timeStr: string) => Date
): Urgency | null {
  if (!dueDate) return null;

  const dueAt = combine(dueDate, dueTime ?? "23:59");
  const minutesUntilDue = (dueAt.getTime() - now.getTime()) / 60000;
  const hoursUntilDue = minutesUntilDue / 60;
  const daysUntilDue = calendarDaysBetween(todayStr, dueDate);

  return {
    label: countdownLabel(daysUntilDue, hoursUntilDue, minutesUntilDue),
    severity: severityFor(hoursUntilDue),
  };
}

/** Whole-day gap between two YYYY-MM-DD strings, via UTC so no local offset creeps in. */
export function calendarDaysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}
