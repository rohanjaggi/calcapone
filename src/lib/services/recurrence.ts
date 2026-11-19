import { RRule, Weekday } from "rrule";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type RecurrenceParams = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  byDay?: string[];
  byMonthDay?: number[];
  bySetPos?: number;
  until?: string;
  count?: number;
};

const DAY_MAP: Record<string, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

const FREQ_MAP: Record<string, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
};

export function paramsToRRule(params: RecurrenceParams, dtstart?: Date): string {
  const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
    freq: FREQ_MAP[params.frequency],
    interval: params.interval ?? 1,
  };

  // COUNT and UNTIL only mean anything against a fixed DTSTART: with none, `getNextOccurrence`
  // re-anchors the rule to each occurrence in turn and the window never runs out.
  if (dtstart) options.dtstart = dtstart;
  if (params.byDay) {
    options.byweekday = params.byDay.map((d) => DAY_MAP[d]).filter(Boolean);
  }
  if (params.byMonthDay) options.bymonthday = params.byMonthDay;
  if (params.bySetPos !== undefined) options.bysetpos = [params.bySetPos];
  if (params.until) options.until = new Date(params.until);
  if (params.count) options.count = params.count;

  const rule = new RRule(options as ConstructorParameters<typeof RRule>[0]);
  return rule.toString();
}

/**
 * DTSTART for a rule that hangs off a due *date* rather than a reminder time.
 *
 * UTC midnight, because that's the anchor `nextDueDate` reads occurrences back out with — a
 * zoned midnight would render as the previous day everywhere east of UTC.
 */
export function dueDateAnchor(dueDate: string): Date {
  return new Date(`${dueDate}T00:00:00.000Z`);
}

/**
 * rrule does its weekday and month-day arithmetic in UTC. "Every Tuesday 07:00" in Singapore
 * is Monday 23:00 UTC, so evaluated as-is it lands on Wednesdays, and a London daily 09:00
 * shifts an hour at each DST change. The fix is rrule's documented "floating" mode: hand it
 * the user's wall-clock time dressed as UTC, then read the answer back as wall-clock in `tz`.
 */
const toFloating = (instant: Date, tz: string) => new Date(`${formatInTimeZone(instant, tz, "yyyy-MM-dd'T'HH:mm:ss.SSS")}Z`);
const fromFloating = (floating: Date, tz: string) => fromZonedTime(floating.toISOString().slice(0, 23), tz);

/**
 * Next occurrence strictly after `after`, anchored to `after` as DTSTART when the stored
 * rule has none (rrule would otherwise default DTSTART to *now* and return "now" for
 * every daily rule). If `notBefore` is given, skips occurrences that are already in the past.
 * `tz` is the zone the rule's times mean; date-only rules (see `nextDueDate`) stay in UTC.
 */
export function getNextOccurrence(rruleStr: string, after: Date, notBefore?: Date, tz = "UTC"): Date | null {
  let options: Partial<ConstructorParameters<typeof RRule>[0]>;
  try {
    options = RRule.parseString(rruleStr);
  } catch {
    return null;
  }
  const rule = new RRule({
    ...options,
    dtstart: toFloating(options.dtstart ?? after, tz),
    ...(options.until ? { until: toFloating(options.until, tz) } : {}),
  } as ConstructorParameters<typeof RRule>[0]);

  let next = rule.after(toFloating(after, tz), false);
  if (notBefore) {
    const floor = toFloating(notBefore, tz);
    let guard = 0;
    while (next && next <= floor && guard < 1000) {
      next = rule.after(next, false);
      guard++;
    }
  }
  return next ? fromFloating(next, tz) : null;
}

/** The same rule restarted at `dtstart` — used when a repeating reminder is moved to a new time. */
export function reanchorRule(rruleStr: string, dtstart: Date): string | null {
  try {
    return new RRule({ ...RRule.parseString(rruleStr), dtstart } as ConstructorParameters<typeof RRule>[0]).toString();
  } catch {
    return null;
  }
}

export function describeRecurrence(rruleStr: string): string {
  try {
    const rule = RRule.fromString(rruleStr);
    return rule.toText();
  } catch {
    return rruleStr;
  }
}
