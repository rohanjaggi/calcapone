"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SearchDialog } from "@/components/search/search-dialog";
import { SEVERITY_STYLES } from "@/lib/severity";
import { listColor } from "@/lib/list-colors";
import { minuteInTz, skyAt } from "@/lib/sky";
import { telegramSupports, telegramWebApp } from "@/lib/telegram-webapp";
import type { AheadItem } from "@/lib/services/agenda";

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "2026-11-19" → its weekday, month and day, read as a calendar date (no timezone shift). */
function parts(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(d);
  return { weekday: fmt({ weekday: "long" }), month: fmt({ month: "long" }), day: String(d.getUTCDate()) };
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/** What the hero says about the most pressing item: overdue ones say since when. */
export function pressingLabel(item: AheadItem) {
  if (item.urgency.severity === "overdue") return `Overdue since ${shortDate(item.dueDate)}`;
  return item.urgency.label.charAt(0).toUpperCase() + item.urgency.label.slice(1);
}

type Clock = { time: string; phase: string; greeting: string };

function readClock(timezone: string): Clock {
  const minute = minuteInTz(timezone);
  return {
    time: new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date()),
    phase: skyAt(minute).phase,
    greeting: greetingFor(Math.floor(minute / 60)),
  };
}

/**
 * Home's first screen: the sky over the user's day, the date set in the hour's foil, the
 * greeting, and directly beneath it the one thing that most needs them.
 *
 * The date comes from the server's `today` (the user's zone), so it is in the first paint. The
 * clock-dependent parts — the time, the phase, which greeting — are read after mount, because
 * the server renders at a different instant and would disagree with the client's first paint.
 */
export function SkyHero({
  name,
  timezone,
  today,
  pressing,
  openCount,
  highCount,
}: {
  name: string;
  timezone: string;
  today: string;
  pressing: AheadItem | undefined;
  openCount: number;
  highCount: number;
}) {
  const [clock, setClock] = useState<Clock | null>(null);
  const { weekday, month, day } = parts(today);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setClock(readClock(timezone));
      // Telegram's header takes the top of the sky, so the app runs edge to edge.
      const zenith = getComputedStyle(document.documentElement).getPropertyValue("--sky-zenith").trim();
      if (zenith.startsWith("#") && telegramSupports("6.1")) {
        try {
          telegramWebApp()?.setHeaderColor?.(zenith);
        } catch {
          // Older clients can't recolour the header.
        }
      }
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [timezone]);

  const style = pressing ? SEVERITY_STYLES[pressing.urgency.severity] ?? SEVERITY_STYLES.upcoming : null;
  const barColor =
    pressing?.urgency.severity === "overdue"
      ? "var(--alarm)"
      : pressing?.urgency.severity === "urgent"
      ? "var(--urgent)"
      : listColor(pressing?.color);

  return (
    <header>
      <section className="sky-band relative overflow-hidden px-6 pt-3 pb-14">
        <span className="sky-stars" aria-hidden="true" />
        <div className="relative flex items-center justify-between h-11">
          <p className="text-sm text-foreground/85 tabular-nums min-w-[8rem]">
            {clock ? `${clock.phase} · ${clock.time}` : ""}
          </p>
          <div className="-mr-2.5">
            <SearchDialog />
          </div>
        </div>

        <h1 className="relative rise mt-5 flex items-end gap-4">
          <span className="sr-only">{`${weekday} ${day} ${month}`}</span>
          <span aria-hidden="true" className="foil font-serif font-semibold text-[8.75rem] leading-[0.8] tracking-[-0.03em] pb-2">
            {day}
          </span>
          <span aria-hidden="true" className="font-serif italic font-medium text-[1.75rem] leading-[1.06] pb-4">
            {weekday},
            <br />
            {month}
          </span>
        </h1>

        <div className="relative rise-late mt-4 min-h-[3.25rem]">
          <p className="text-[17px] text-foreground">
            {clock ? `${clock.greeting}, ` : ""}
            <span className="font-semibold">{name}</span>
          </p>
          {openCount > 0 && (
            <Link href="/todos" className="inline-block mt-1 text-[15px] text-foreground/90 underline-offset-4 decoration-foreground/30 active:underline">
              {openCount} open {openCount === 1 ? "task" : "tasks"}
              {highCount > 0 ? ` · ${highCount} high priority` : ""}
            </Link>
          )}
        </div>
      </section>

      {pressing && style && (
        <Link
          href={`/todos/${pressing.categoryId}`}
          className="mx-6 -mt-2 flex items-center gap-4 py-4 border-b border-border active:opacity-70 transition-opacity"
        >
          <span className="w-[3px] self-stretch rounded-full shrink-0" style={{ backgroundColor: barColor }} aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className={`block text-[13px] font-semibold ${style.text}`}>{pressingLabel(pressing)}</span>
            <span className="block text-xl font-medium tracking-[-0.01em] text-foreground truncate mt-0.5">{pressing.title}</span>
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: listColor(pressing.color) }} aria-hidden="true" />
              {pressing.categoryName}
            </span>
          </span>
          <ChevronRight className="w-5 h-5 text-faint shrink-0" aria-hidden="true" />
        </Link>
      )}
    </header>
  );
}
