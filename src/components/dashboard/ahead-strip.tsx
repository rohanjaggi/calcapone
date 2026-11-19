"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SEVERITY_STYLES } from "@/lib/severity";
import { listColor } from "@/lib/list-colors";
import type { AheadItem } from "@/lib/services/agenda";

/**
 * The deadlines after the one the hero shows, independent of which day is selected above.
 *
 * The day page answers "what is on this day". This answers "what is coming that I should
 * worry about", however far out it is. A deadline inside the week jumps the strip to its day;
 * one beyond it opens its list, so no row is a dead end.
 */
export function AheadStrip({
  items,
  selectableDates,
  onSelect,
}: {
  items: AheadItem[];
  /** Days the strip above can show. */
  selectableDates: string[];
  onSelect: (date: string) => void;
}) {
  if (items.length === 0) return null;

  const inWindow = new Set(selectableDates);

  return (
    <section className="px-6 mt-8" aria-labelledby="coming-up">
      <h2 id="coming-up" className="font-serif text-xl font-semibold text-foreground">
        Coming up
      </h2>
      <ul className="mt-2">
        {items.map((item, i) => {
          const style = SEVERITY_STYLES[item.urgency.severity] ?? SEVERITY_STYLES.upcoming;
          const body = (
            <>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: listColor(item.color) }} aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] text-foreground truncate">{item.title}</span>
                <span className="block text-[13px] text-muted-foreground truncate">{item.categoryName}</span>
              </span>
              <span className={`shrink-0 text-[13px] font-medium tabular-nums ${style.text}`}>{item.urgency.label}</span>
              <ChevronRight className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
            </>
          );
          const rowClass = `w-full min-h-14 flex items-center gap-3 py-2 text-left active:opacity-70 transition-opacity ${
            i > 0 ? "border-t border-border" : ""
          }`;
          return (
            <li key={item.id}>
              {inWindow.has(item.dueDate) ? (
                <button onClick={() => onSelect(item.dueDate)} className={rowClass}>
                  {body}
                </button>
              ) : (
                <Link href={`/todos/${item.categoryId}`} className={rowClass}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
