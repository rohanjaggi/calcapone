"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Calendar,
  CheckCircle2,
  Bell,
  LinkIcon,
} from "lucide-react";
import { NavBar } from "@/components/nav-bar";
import type { Item } from "@/lib/mock-data";

type GoogleEvent = { id: string; title: string; startTime: string; endTime: string };

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

type Props = {
  items: Item[];
  googleEvents: GoogleEvent[];
  hasGoogleCalendar: boolean;
};

export function CalendarClient({ items, googleEvents, hasGoogleCalendar }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const datesWithItems = useMemo(() => {
    const dates = new Set<string>();
    for (const item of items) {
      if (item.dueDate) {
        // dueDate is "YYYY-MM-DD" string — parse it
        const [y, m, d] = item.dueDate.split("-").map(Number);
        dates.add(`${y}-${m - 1}-${d}`); // month is 0-indexed in our key
      }
      if (item.remindAt) {
        const dt = new Date(item.remindAt);
        dates.add(`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`);
      }
    }
    for (const e of googleEvents) {
      const d = new Date(e.startTime);
      dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    return dates;
  }, [items, googleEvents]);

  const selectedItems = useMemo(() => {
    const result: Array<{ id: string; type: "event" | "item"; title: string; time: string | null; color: string; subtitle: string; isReminder: boolean }> = [];

    for (const e of googleEvents) {
      if (isSameDay(new Date(e.startTime), selectedDate)) {
        const start = new Date(e.startTime);
        const end = new Date(e.endTime);
        const duration = Math.round((end.getTime() - start.getTime()) / 60000);
        result.push({
          id: e.id, type: "event", title: e.title, time: e.startTime,
          color: "#4A6FA5", subtitle: `${duration} min`, isReminder: false,
        });
      }
    }

    for (const item of items) {
      // Check if item falls on selected day via dueDate or remindAt
      let matchesDay = false;
      let itemTime: string | null = null;

      if (item.dueDate) {
        const [y, m, d] = item.dueDate.split("-").map(Number);
        if (isSameDay(new Date(y, m - 1, d), selectedDate)) {
          matchesDay = true;
          if (item.dueTime) {
            itemTime = `${item.dueDate}T${item.dueTime}:00`;
          }
        }
      }

      if (item.remindAt && isSameDay(new Date(item.remindAt), selectedDate)) {
        matchesDay = true;
        itemTime = item.remindAt;
      }

      if (matchesDay) {
        result.push({
          id: item.id, type: "item", title: item.title, time: itemTime,
          color: item.category.color, subtitle: `${item.category.name} · ${item.priority}`,
          isReminder: !!item.remindAt,
        });
      }
    }

    result.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return new Date(a.time).getTime() - new Date(b.time).getTime();
    });

    return result;
  }, [items, googleEvents, selectedDate]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  const isToday = (day: number) => isSameDay(new Date(viewYear, viewMonth, day), today);
  const isSelected = (day: number) => isSameDay(new Date(viewYear, viewMonth, day), selectedDate);
  const hasItemsOnDay = (day: number) => datesWithItems.has(`${viewYear}-${viewMonth}-${day}`);

  return (
    <main className="safe-bottom pb-8">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="px-5 pt-6 pb-2"
      >
        <div className="flex items-center gap-2 mb-0.5">
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
            Schedule
          </p>
        </div>
        <h1 className="font-serif text-[2rem] leading-tight font-light text-foreground tracking-tight">
          Calendar
        </h1>
      </motion.header>

      {/* Month navigation */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        className="px-5 mt-4"
      >
        <div className="bg-card border border-border/50 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors active:scale-90">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <span className="font-serif text-base text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors active:scale-90">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 px-3 pt-3 pb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const selected = isSelected(day);
              const todayMark = isToday(day);
              const hasItem = hasItemsOnDay(day);

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(new Date(viewYear, viewMonth, day))}
                  className={`relative w-full aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-all duration-150 active:scale-90 ${
                    selected
                      ? "bg-primary text-primary-foreground font-medium"
                      : todayMark
                      ? "bg-primary/8 text-primary font-medium"
                      : "text-foreground hover:bg-secondary/50"
                  }`}
                >
                  {day}
                  {hasItem && (
                    <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${
                      selected ? "bg-primary-foreground/60" : "bg-primary/50"
                    }`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Selected day items */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        className="px-5 mt-5"
      >
        <h2 className="font-serif text-lg font-normal text-foreground mb-3">
          {isSameDay(selectedDate, today)
            ? "Today"
            : selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </h2>

        {selectedItems.length === 0 ? (
          <div className="bg-card border border-border/50 rounded-xl p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <p className="text-sm text-muted-foreground">Nothing scheduled</p>
          </div>
        ) : (
          <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            {selectedItems.map((item, i) => {
              const Icon = item.type === "event" ? Calendar : item.isReminder ? Bell : CheckCircle2;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 + 0.25 }}
                  className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? "border-t border-border/30" : ""}`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 shrink-0"
                    style={{ backgroundColor: `${item.color}12` }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{item.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {item.time && (
                        <span className="text-[11px] text-muted-foreground">{formatTime(item.time)}</span>
                      )}
                      {item.subtitle && (
                        <>
                          <span className="text-[11px] text-muted-foreground/30">·</span>
                          <span className="text-[11px] text-muted-foreground capitalize">{item.subtitle}</span>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Google Calendar prompt */}
      {!hasGoogleCalendar && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
          className="px-5 mt-5"
        >
          <div className="bg-card border border-border/50 rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center shrink-0">
                <LinkIcon className="w-4 h-4 text-sage" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Connect Google Calendar</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  See your events alongside tasks and reminders
                </p>
                <a href="/settings" className="inline-flex items-center gap-1 text-xs text-primary font-medium mt-2 hover:opacity-80 transition-opacity">
                  Go to Settings
                  <ChevronRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <NavBar />
    </main>
  );
}
