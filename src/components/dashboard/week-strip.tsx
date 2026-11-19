"use client";

import { motion } from "motion/react";
import { SEVERITY_STYLES } from "@/lib/severity";
import { haptic } from "@/lib/telegram-webapp";

type Day = {
  date: string;
  taskCount: number;
  eventCount: number;
  /** Worst deadline severity on the day, or null when nothing on it is pressing. */
  severity: "overdue" | "urgent" | "soon" | "upcoming" | null;
};

/**
 * Weekday from a "YYYY-MM-DD".
 *
 * Parsed as UTC deliberately: the string is already a calendar day in the user's zone, so
 * routing it through a local-time Date would shift it by the browser's offset and label the
 * wrong weekday for anyone west of the user.
 */
function weekday(date: string, style: "short" | "long"): string {
  const [y, m, d] = date.split("-").map(Number);
  const name = new Intl.DateTimeFormat("en-GB", { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return style === "short" ? name.slice(0, 2) : name;
}

function dayOfMonth(date: string): string {
  return String(Number(date.split("-")[2]));
}

/**
 * The seven day tabs above the day's page. Presentational: the selected day lives in
 * DashboardClient, because the page below is driven by the same value. Today carries the
 * hour's ribbon; the selected day lifts onto the page colour.
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
    <div className="grid grid-cols-7 gap-1 px-4 mt-6" role="group" aria-label="Pick a day">
      {days.map((day) => {
        const isSelected = day.date === selected;
        const isToday = day.date === today;
        const total = day.taskCount + day.eventCount;

        return (
          <button
            key={day.date}
            onClick={() => {
              if (!isSelected) haptic("select");
              onSelect(day.date);
            }}
            aria-pressed={isSelected}
            aria-label={`${weekday(day.date, "long")} ${dayOfMonth(day.date)}${isToday ? " (today)" : ""}, ${total} item${total === 1 ? "" : "s"}${day.severity === "overdue" ? ", overdue" : day.severity === "urgent" ? ", due soon" : ""}`}
            className="relative h-[4.5rem] flex flex-col items-center justify-center gap-1 rounded-2xl"
          >
            {isSelected && (
              <motion.span
                layoutId="week-selected"
                className="absolute inset-0 rounded-2xl bg-card"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                aria-hidden="true"
              />
            )}
            {isToday && <span className="ribbon absolute -top-3 left-1/2 -ml-[5px] w-2.5 h-[0.875rem]" aria-hidden="true" />}
            <span className={`relative text-xs ${isSelected ? "text-muted-foreground" : "text-faint"}`}>
              {weekday(day.date, "short")}
            </span>
            <span
              className={`relative font-serif text-[1.375rem] leading-none font-semibold tabular-nums ${
                isSelected || isToday ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {dayOfMonth(day.date)}
            </span>
            <span className="relative h-1 flex items-center" aria-hidden="true">
              {total > 0 && (
                <span
                  className={`w-1 h-1 rounded-full ${
                    // A deadline colours the dot; a day that is merely busy stays neutral,
                    // so colour means "something is due", not "something is on".
                    day.severity === "overdue" || day.severity === "urgent"
                      ? SEVERITY_STYLES[day.severity].dot
                      : "bg-muted-foreground/70"
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
