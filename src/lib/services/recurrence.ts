import { RRule, Weekday } from "rrule";

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
 * Next occurrence strictly after `after`, anchored to `after` as DTSTART when the stored
 * rule has none (rrule would otherwise default DTSTART to *now* and return "now" for
 * every daily rule). If `notBefore` is given, skips occurrences that are already in the past.
 */
export function getNextOccurrence(rruleStr: string, after: Date, notBefore?: Date): Date | null {
  let options: Partial<ConstructorParameters<typeof RRule>[0]>;
  try {
    options = RRule.parseString(rruleStr);
  } catch {
    return null;
  }
  const rule = new RRule({ ...options, dtstart: options.dtstart ?? after } as ConstructorParameters<typeof RRule>[0]);

  let next = rule.after(after, false);
  if (notBefore) {
    let guard = 0;
    while (next && next <= notBefore && guard < 1000) {
      next = rule.after(next, false);
      guard++;
    }
  }
  return next;
}

export function describeRecurrence(rruleStr: string): string {
  try {
    const rule = RRule.fromString(rruleStr);
    return rule.toText();
  } catch {
    return rruleStr;
  }
}
