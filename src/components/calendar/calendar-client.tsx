"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, Bell, Trash2 } from "lucide-react";
import { deleteGoogleCalendarEvent, editGoogleCalendarEvent, getCalendarMonth } from "@/app/actions";
import { EditItemSheet } from "@/components/todos/edit-item-sheet";
import { useOptimisticItems } from "@/components/todos/use-optimistic-items";
import { BottomSheet, Field, SheetFooter, fieldClass, submitClass, titleInputClass } from "@/components/ui/bottom-sheet";
import { useToast } from "@/components/ui/toast";
import { confirmAction, haptic } from "@/lib/telegram-webapp";
import { EVENT_COLOR, listColor } from "@/lib/list-colors";
import type { Item, Category } from "@/lib/types";

type GoogleEvent = { id: string; title: string; startTime: string; endTime: string; allDay: boolean };

type Row = {
  id: string;
  title: string;
  /** "HH:mm" in the user's zone; null for all-day events and undated-time tasks. */
  time: string | null;
  color: string;
  subtitle: string;
  isReminder: boolean;
  item?: Item;
  event?: GoogleEvent;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Everything here is keyed by "YYYY-MM-DD" in the user's own zone. Reading days off the
// browser clock made the server render (UTC) and the phone disagree, and put events near
// midnight on the wrong day.
const pad = (n: number) => String(n).padStart(2, "0");
/** Built from parts: `toLocaleDateString("en-CA")` depends on the browser's CLDR data. */
const dayKey = (iso: string, tz: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
};
const hhmm = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz });
const utcDate = (key: string) => new Date(`${key}T00:00:00Z`);
const nextDay = (key: string) => new Date(utcDate(key).getTime() + 86_400_000).toISOString().slice(0, 10);

function to12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

type Props = {
  items: Item[];
  categories: Category[];
  hasGoogleCalendar: boolean;
  timezone: string;
  /** Today in the user's zone, from the server, so both renders agree. */
  today: string;
};

export function CalendarClient({ items: serverItems, categories, hasGoogleCalendar, timezone: tz, today }: Props) {
  const { notify } = useToast();
  const { items, remove } = useOptimisticItems(serverItems);
  const [viewYear, setViewYear] = useState(Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(today.slice(5, 7)) - 1);
  /** Which way the last month change went, so the grid slides the right way. */
  const [direction, setDirection] = useState(0);
  const [selected, setSelected] = useState(today);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingEvent, setEditingEvent] = useState<GoogleEvent | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Google events for the month on screen, fetched on navigation and again after any change,
  // so nothing shown can be older than the last edit.
  const [events, setEvents] = useState<GoogleEvent[]>([]);
  const [connected, setConnected] = useState(hasGoogleCalendar);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!hasGoogleCalendar) return;
    let cancelled = false;
    getCalendarMonth(viewYear, viewMonth)
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setConnected(result.connected);
      })
      .catch(() => {
        if (!cancelled) notify("Couldn't load your Google Calendar — try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth, reload, hasGoogleCalendar, notify]);

  const rowsByDay = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    const add = (key: string, row: Row) => byDay.set(key, [...(byDay.get(key) ?? []), row]);

    for (const e of events) {
      if (e.allDay) {
        add(e.startTime, { id: e.id, title: e.title, time: null, color: EVENT_COLOR, subtitle: "All day", isReminder: false, event: e });
        continue;
      }
      const minutes = Math.round((Date.parse(e.endTime) - Date.parse(e.startTime)) / 60000);
      add(dayKey(e.startTime, tz), {
        id: e.id,
        title: e.title,
        time: hhmm(e.startTime, tz),
        color: EVENT_COLOR,
        subtitle: `${minutes} min`,
        isReminder: false,
        event: e,
      });
    }

    for (const item of items) {
      // The board's item set includes two weeks of completed work; a calendar of what's ahead
      // listed ticked-off tasks as if still open, dot and all.
      if (item.status === "done") continue;
      const row = (time: string | null): Row => ({
        id: item.id,
        title: item.title,
        time,
        color: listColor(item.category.color),
        subtitle: `${item.category.name} · ${item.priority}`,
        isReminder: !!item.remindAt,
        item,
      });
      const reminderDay = item.remindAt ? dayKey(item.remindAt, tz) : null;
      if (item.remindAt && reminderDay) add(reminderDay, row(hhmm(item.remindAt, tz)));
      if (item.dueDate && item.dueDate !== reminderDay) add(item.dueDate, row(item.dueTime));
    }

    for (const rows of byDay.values()) {
      rows.sort((a, b) => (a.time === b.time ? 0 : a.time === null ? 1 : b.time === null ? -1 : a.time < b.time ? -1 : 1));
    }
    return byDay;
  }, [events, items, tz]);

  const selectedRows = rowsByDay.get(selected) ?? [];

  const handleDeleteEvent = async (event: GoogleEvent) => {
    // Deleting an event you organised cancels it for every attendee, and Google has no undo,
    // so this one asks first.
    if (!(await confirmAction(`Delete "${event.title}" from Google Calendar?`))) return;
    setDeletingId(event.id);
    try {
      await deleteGoogleCalendarEvent(event.id);
      haptic("warning");
      setReload((n) => n + 1);
    } catch {
      notify("Couldn't delete that event — please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const monthStart = `${viewYear}-${pad(viewMonth + 1)}-01`;
  const firstDay = utcDate(monthStart).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const cellKey = (day: number) => `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
  const showingToday = today.startsWith(`${viewYear}-${pad(viewMonth + 1)}`) && selected === today;

  const shiftMonth = (by: 1 | -1) => {
    haptic("select");
    setDirection(by);
    const m = viewMonth + by;
    setViewYear(viewYear + Math.floor(m / 12));
    setViewMonth(((m % 12) + 12) % 12);
  };

  const goToday = () => {
    haptic("select");
    setDirection(0);
    setViewYear(Number(today.slice(0, 4)));
    setViewMonth(Number(today.slice(5, 7)) - 1);
    setSelected(today);
  };

  const openRow = (row: Row) => {
    if (row.item) setEditingItem(row.item);
    else if (row.event && !row.event.allDay) setEditingEvent(row.event);
  };

  return (
    <main className="safe-bottom sky-wash">
      <header className="rise px-6 pt-7 flex items-end justify-between gap-3">
        <h1 className="font-serif text-[2.5rem] leading-none font-semibold text-foreground">Calendar</h1>
        {!showingToday && (
          <button onClick={goToday} className="h-11 -mr-2 px-3 rounded-full text-[15px] font-semibold text-hour active:bg-hour/10">
            Today
          </button>
        )}
      </header>

      {/* One page: the month above, the chosen day ruled off beneath it. */}
      <section className="rise-late mx-4 mt-6 bg-card rounded-[1.5rem] overflow-hidden" aria-label="Month">
        <div className="flex items-center justify-between px-2 pt-2">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground active:bg-foreground/10">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-serif text-xl font-semibold text-foreground" aria-live="polite">
            {utcDate(monthStart).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
          </span>
          <button onClick={() => shiftMonth(1)} aria-label="Next month" className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground active:bg-foreground/10">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 px-3 pt-2 pb-1" aria-hidden="true">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-xs text-faint">
              {d}
            </div>
          ))}
        </div>

        <div className="relative overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout" custom={direction}>
            <motion.div
              key={monthStart}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-7 px-3 pb-3 gap-y-1"
            >
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const key = cellKey(i + 1);
                const isSelected = key === selected;
                const isToday = key === today;
                const count = rowsByDay.get(key)?.length ?? 0;

                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    aria-pressed={isSelected}
                    aria-label={`${utcDate(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}${isToday ? ", today" : ""}${count ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`}
                    className={`relative mx-auto w-11 h-11 flex flex-col items-center justify-center rounded-full font-serif text-[17px] transition-colors duration-200 active:scale-90 ${
                      isSelected && isToday
                        ? "bg-hour text-background font-semibold"
                        : isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : isToday
                        ? "text-hour font-semibold ring-1 ring-inset ring-hour/60"
                        : "text-foreground"
                    }`}
                  >
                    {i + 1}
                    {count > 0 && (
                      <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? "bg-background/70" : "bg-muted-foreground"}`} />
                    )}
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
        <section className="border-t border-border px-5 pt-5 pb-2" aria-label="Selected day">
          <h2 className="font-serif text-[1.625rem] leading-tight font-semibold text-foreground">
            {selected === today
              ? "Today"
              : utcDate(selected).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
          </h2>

          {selectedRows.length === 0 ? (
            <p className="pt-2 pb-4 text-[15px] text-muted-foreground">Nothing scheduled.</p>
          ) : (
            <ul className="mt-2">
              {selectedRows.map((row, i) => {
                const Icon = row.event ? Calendar : row.isReminder ? Bell : CheckCircle2;
                const event = row.event;
                const item = row.item;
                const editable = !!item || (!!event && !event.allDay);
                return (
                  <li key={row.id} className={`flex items-center gap-1 ${i > 0 ? "border-t border-border" : ""}`}>
                    <button
                      type="button"
                      onClick={() => openRow(row)}
                      disabled={!editable}
                      aria-label={editable ? `Edit ${row.title}` : undefined}
                      className="flex-1 min-w-0 min-h-14 py-2.5 flex items-start gap-3 text-left active:opacity-70 disabled:active:opacity-100"
                    >
                      <span className="w-14 shrink-0 pt-0.5 text-[13px] text-muted-foreground tabular-nums">{row.time ? to12h(row.time) : "All day"}</span>
                      <span className="w-2 h-2 mt-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="text-base text-foreground truncate">{row.title}</span>
                        </span>
                        <span className="block text-[13px] text-muted-foreground mt-0.5 capitalize">{row.subtitle}</span>
                      </span>
                    </button>
                    <button
                      onClick={() => (item ? remove(item.id) : handleDeleteEvent(event!))}
                      disabled={deletingId === row.id}
                      aria-label={`Delete ${row.title}`}
                      className="shrink-0 w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-faint active:text-alarm active:bg-alarm/10 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>

      {!connected && (
        <section className="mx-6 mt-6">
          <p className="text-[15px] font-medium text-foreground">Connect Google Calendar</p>
          <p className="text-[15px] text-muted-foreground mt-1">See your events here alongside tasks and reminders.</p>
          <Link href="/settings" className="inline-flex items-center gap-1 min-h-11 text-[15px] font-semibold text-hour">
            Open Settings
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </section>
      )}

      <EditItemSheet item={editingItem} categories={categories} onClose={() => setEditingItem(null)} onDelete={remove} />

      <BottomSheet open={!!editingEvent} title="Edit event" onClose={() => setEditingEvent(null)}>
        {editingEvent && (
          <EventForm
            key={editingEvent.id}
            event={editingEvent}
            tz={tz}
            onSaved={() => {
              setEditingEvent(null);
              setReload((n) => n + 1);
            }}
          />
        )}
      </BottomSheet>
    </main>
  );
}

function EventForm({ event, tz, onSaved }: { event: GoogleEvent; tz: string; onSaved: () => void }) {
  const { notify } = useToast();
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(dayKey(event.startTime, tz));
  const [start, setStart] = useState(hhmm(event.startTime, tz));
  const [end, setEnd] = useState(hhmm(event.endTime, tz));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await editGoogleCalendarEvent(event.id, {
        title: title.trim(),
        startTime: `${date}T${start}:00`,
        // An end at or before the start means the event runs past midnight.
        endTime: `${end <= start ? nextDay(date) : date}T${end}:00`,
      });
      haptic("success");
      onSaved();
    } catch {
      notify("Couldn't save that event — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Event title"
        aria-label="Event title"
        autoFocus
        className={titleInputClass}
      />
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Ends">
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={fieldClass} />
        </Field>
      </div>
      <SheetFooter>
        <button onClick={save} disabled={!title.trim() || !date || !start || !end || saving} className={submitClass}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </SheetFooter>
    </>
  );
}
