"use client";

import { SEVERITY_STYLES } from "@/lib/severity";

type Day = {
  date: string;
  taskCount: number;
  eventCount: number;
  /** Worst deadline severity on the day, or null when nothing on it is pressing. */
  severity: "overdue" | "urgent" | "soon" | "upcoming" | null;
};

/**
 * Weekday initial from a "YYYY-MM-DD".
 *
 * Parsed as UTC deliberately: the string is already a calendar day in the user's zone, so
 * routing it through a local-time Date would shift it by the browser's offset and label the
 * wrong weekday for anyone west of the user.
 */
function weekdayInitial(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return ["S", "M", "T", "W", "T", "F", "S"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function dayOfMonth(date: string): string {
  return String(Number(date.split("-")[2]));
}

/**
 * The seven-day picker above the timeline. Presentational: the selected day lives in
 * DashboardClient, because the timeline below is driven by the same value.
 */
export function WeekStrip({
  days,
  selected,
  today,
  onSelect,
}: {
  days: Day[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="flex gap-1.5 px-5 mt-5" role="group" aria-label="Pick a day">
      {days.map((day) => {
        const isSelected = day.date === selected;
        const isToday = day.date === today;
        const total = day.taskCount + day.eventCount;

        return (
          <button
            key={day.date}
            onClick={() => onSelect(day.date)}
            aria-pressed={isSelected}
            aria-label={`${day.date}${isToday ? " (today)" : ""}, ${total} item${total === 1 ? "" : "s"}${day.severity === "overdue" ? ", overdue" : day.severity === "urgent" ? ", due soon" : ""}`}
            className={`relative flex-1 rounded-xl py-2 flex flex-col items-center gap-1 border transition-colors ${
              isSelected
                ? "bg-primary/10 border-primary/40"
                : "bg-card border-border/50 hover:bg-secondary/30"
            }`}
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {weekdayInitial(day.date)}
            </span>
            <span
              className={`text-sm font-semibold tabular-nums ${
                isToday ? "text-primary" : "text-foreground"
              }`}
            >
              {dayOfMonth(day.date)}
            </span>
            <span className="h-1 flex items-center" aria-hidden="true">
              {total > 0 && (
                <span
                  className={`w-1 h-1 rounded-full ${
                    // A deadline colours the dot; a day that is merely busy stays neutral,
                    // so colour means "something is due", not "something is on".
                    day.severity
                      ? SEVERITY_STYLES[day.severity].dot
                      : isSelected
                      ? "bg-primary"
                      : "bg-muted-foreground/50"
                  }`}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
