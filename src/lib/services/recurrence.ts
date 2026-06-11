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

export function getNextOccurrence(rruleStr: string, after: Date): Date | null {
  const rule = RRule.fromString(rruleStr);
  return rule.after(after);
}

export function describeRecurrence(rruleStr: string): string {
  try {
    const rule = RRule.fromString(rruleStr);
    return rule.toText();
  } catch {
    return rruleStr;
  }
}
