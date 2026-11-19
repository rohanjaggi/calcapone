"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { toggleItemStatus } from "@/app/actions";
import { TaskCheck } from "@/components/todos/task-row";
import { useToast } from "@/components/ui/toast";
import { haptic } from "@/lib/telegram-webapp";
import type { TimelineItem } from "@/lib/types";
import { SEVERITY_STYLES } from "@/lib/severity";
import { listColor } from "@/lib/list-colors";

function UrgencyBadge({ urgency }: { urgency: NonNullable<TimelineItem["urgency"]> }) {
  const style = SEVERITY_STYLES[urgency.severity] ?? SEVERITY_STYLES.upcoming;
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums ${style.bg} ${style.text}`}>
      {urgency.label}
    </span>
  );
}

/** In the user's zone, not the device's: both renders then print the same time. */
function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

/** `now` is null until after hydration — see DayTimeline. */
function isPast(time: string, now: number | null) {
  return now !== null && new Date(time).getTime() < now;
}

/**
 * Defined at module scope rather than picked into a local `Icon` during render: binding a
 * component to a variable inside render makes React treat it as a brand-new component type
 * on every pass, remounting the subtree instead of updating it.
 */
function TypeIcon({ item, className }: { item: TimelineItem; className?: string }) {
  return item.type === "event" ? <Calendar className={className} aria-label="Event" /> : null;
}

/** Time column, rail column, line: the same three columns every row uses, so they align. */
function NowLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={`Now, ${label}`}>
      <span className="w-12 shrink-0 text-right text-xs font-semibold text-hour tabular-nums">{label}</span>
      <span className="w-2 shrink-0 flex justify-center">
        <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-hour now-pulse" />
      </span>
      <span className="h-px flex-1 bg-hour/50" />
    </div>
  );
}

function Row({
  item,
  past,
  timeZone,
  done,
  onToggle,
}: {
  item: TimelineItem;
  past: boolean;
  timeZone: string;
  done: boolean;
  onToggle: () => void;
}) {
  const tone = past || done ? "text-faint" : "text-muted-foreground";
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className={`w-12 shrink-0 text-right text-[13px] pt-0.5 tabular-nums ${tone}`}>
        {item.allDay ? "All day" : formatTime(item.time, timeZone)}
      </span>
      <span className="w-2 shrink-0 flex justify-center pt-2">
        <span className="w-2 h-2 rounded-full ring-4 ring-card" style={{ backgroundColor: listColor(item.color) }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Tasks tick off right here; before, Home was read-only and you had to find it in Tasks. */}
          {item.type === "item" ? (
            <TaskCheck done={done} size="sm" onToggle={onToggle} label={`Mark ${item.title} as done`} />
          ) : (
            <TypeIcon item={item} className={`w-3.5 h-3.5 shrink-0 ${tone}`} />
          )}
          <p className={`text-base font-medium truncate ${past || done ? "text-faint" : "text-foreground"} ${done ? "line-through" : ""}`}>{item.title}</p>
          {item.urgency && <UrgencyBadge urgency={item.urgency} />}
        </div>
        <p className={`text-[13px] mt-0.5 capitalize ${tone}`}>{item.subtitle}</p>
      </div>
    </div>
  );
}

function longDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`)
  );
}

/**
 * The selected day as a page. The "Now" marker only renders when the day is today — on any
 * other day there is no present moment to mark, and drawing the line would imply the rows
 * above it had already passed.
 */
export function DayTimeline({
  items,
  date,
  isToday,
  timezone,
  onAdd,
}: {
  items: TimelineItem[];
  date: string;
  isToday: boolean;
  timezone: string;
  onAdd: () => void;
}) {
  /**
   * "Now" is read after mount, never during render: the server renders at a different
   * instant than the browser, so reading the clock during render made the first client
   * paint disagree with the server's HTML.
   */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);

  // Ticked rows stay struck through until the refresh drops them (Home lists open work only).
  const router = useRouter();
  const { notify } = useToast();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const tick = async (id: string) => {
    if (ticked.has(id)) return;
    setTicked((prev) => new Set(prev).add(id));
    haptic("success");
    try {
      await toggleItemStatus(id, "done");
      router.refresh();
    } catch {
      setTicked((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      notify("Couldn't update that task — please try again.");
    }
  };

  const nowLabel = now === null ? "" : formatTime(new Date(now).toISOString(), timezone);
  // The marker goes after the last timed row already past; -1 puts it above everything.
  const lastPast = items.reduce((idx, item, i) => (!item.allDay && isPast(item.time, now) ? i : idx), -1);
  const showNow = isToday && now !== null && items.length > 0;
  const title = isToday ? "Today" : longDate(date);

  return (
    <section className="mx-4 mt-2 bg-card rounded-[1.5rem] px-5 pt-5 pb-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[1.75rem] leading-tight font-semibold text-foreground">{title}</h2>
        <Link href="/calendar" className="min-h-11 -mr-2 px-2 shrink-0 flex items-center gap-1 text-sm text-muted-foreground active:text-foreground">
          Calendar
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="pt-1 pb-2">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Nothing booked {isToday ? "today" : "this day"}. Tell the bot, or add one here.
          </p>
          <button
            onClick={onAdd}
            className="mt-4 w-full h-12 rounded-2xl border border-hour/50 text-hour text-[15px] font-medium flex items-center justify-center gap-2 active:bg-hour/10 transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add a task
          </button>
        </div>
      ) : (
        <>
          <div className="relative mt-2">
            <div className="timeline-line" aria-hidden="true" />
            {showNow && lastPast === -1 && <NowLine label={nowLabel} />}
            {items.map((item, i) => (
              <div key={item.id} className="relative">
                <Row
                  item={item}
                  past={isToday && !item.allDay && isPast(item.time, now)}
                  timeZone={timezone}
                  done={ticked.has(item.id)}
                  onToggle={() => void tick(item.id)}
                />
                {showNow && i === lastPast && <NowLine label={nowLabel} />}
              </div>
            ))}
          </div>
          <button
            onClick={onAdd}
            className="mt-1 min-h-11 flex items-center gap-2 text-[15px] text-muted-foreground active:text-foreground"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add a task
          </button>
        </>
      )}
    </section>
  );
}
