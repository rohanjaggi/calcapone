"use client";

import { CalendarClock } from "lucide-react";
import { SEVERITY_STYLES } from "@/lib/severity";
import type { AheadItem } from "@/lib/services/agenda";

/**
 * The nearest deadlines, independent of which day is selected below.
 *
 * The timeline answers "what is on this day". Without this the dashboard had no way to answer
 * "what is coming that I should worry about" — you had to tap through the week to find out,
 * and anything past seven days was invisible entirely. This reaches as far as it needs to.
 */
export function AheadStrip({
  items,
  selectableDates,
  onSelect,
}: {
  items: AheadItem[];
  /** Days the strip below can actually show. A deadline further out is listed, not linked. */
  selectableDates: string[];
  onSelect: (date: string) => void;
}) {
  if (items.length === 0) return null;

  const inWindow = new Set(selectableDates);

  return (
    <section className="px-5 mt-5" aria-label="Upcoming deadlines">
      <div className="flex items-center gap-1.5 mb-2">
        <CalendarClock className="w-3 h-3 text-muted-foreground" />
        <h2 className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
          Coming up
        </h2>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {items.map((item, i) => {
          const style = SEVERITY_STYLES[item.urgency.severity] ?? SEVERITY_STYLES.upcoming;
          // Jumping the strip to a day it cannot show would blank the timeline, so a deadline
          // outside the window is a row rather than a button.
          const linkable = inWindow.has(item.dueDate);
          const Row = linkable ? "button" : "div";
          return (
            <Row
              key={item.id}
              {...(linkable ? { onClick: () => onSelect(item.dueDate) } : {})}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                linkable ? "hover:bg-secondary/30" : ""
              } ${i > 0 ? "border-t border-border/30" : ""}`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0 text-[13px] text-foreground truncate">
                {item.title}
              </span>
              <span className={`shrink-0 text-[11px] font-medium tabular-nums ${style.text}`}>
                {item.urgency.label}
              </span>
            </Row>
          );
        })}
      </div>
    </section>
  );
}
