"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Calendar,
  CheckCircle2,
  Bell,
  LinkIcon,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { editItem, removeItemWithGcalSync } from "@/app/actions";
import { priorityColors, priorityLabels } from "@/lib/task-constants";
import type { Item } from "@/lib/mock-data";
import type { Category } from "@/lib/mock-data";
import type { Priority } from "@/generated/prisma/enums";

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
  categories: Category[];
};

export function CalendarClient({ items, googleEvents, hasGoogleCalendar, categories }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);

  const router = useRouter();
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("medium");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = (item: Item) => {
    setEditTitle(item.title);
    setEditDescription(item.description ?? "");
    setEditDueDate(item.dueDate ?? "");
    setEditDueTime(item.dueTime ?? "");
    setEditPriority(item.priority as Priority);
    setEditCategoryId(item.category.id);
    setEditingItem(item);
  };

  const handleEditSave = async () => {
    if (!editingItem || !editTitle.trim()) return;
    setEditSaving(true);
    await editItem(editingItem.id, {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      dueDate: editDueDate || null,
      dueTime: editDueTime || null,
      priority: editPriority,
      categoryId: editCategoryId,
    });
    setEditSaving(false);
    setEditingItem(null);
    router.refresh();
  };

  const handleDelete = async (itemId: string) => {
    setDeletingId(itemId);
    await removeItemWithGcalSync(itemId);
    setDeletingId(null);
    router.refresh();
  };

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
    const linkedIds = new Set(
      items.filter((item) => item.googleEventId).map((item) => item.googleEventId!)
    );
    for (const e of googleEvents) {
      if (linkedIds.has(e.id)) continue;
      const d = new Date(e.startTime);
      dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    return dates;
  }, [items, googleEvents]);

  const selectedItems = useMemo(() => {
    const result: Array<{
      id: string;
      type: "event" | "item";
      title: string;
      time: string | null;
      color: string;
      subtitle: string;
      isReminder: boolean;
      itemData: Item | null;
    }> = [];

    // Collect googleEventIds from in-app items so we can deduplicate
    const linkedGcalIds = new Set(
      items.filter((item) => item.googleEventId).map((item) => item.googleEventId!)
    );

    for (const e of googleEvents) {
      // Skip Google Calendar events that have a linked in-app item (shown below with edit/delete)
      if (linkedGcalIds.has(e.id)) continue;

      if (isSameDay(new Date(e.startTime), selectedDate)) {
        const start = new Date(e.startTime);
        const end = new Date(e.endTime);
        const duration = Math.round((end.getTime() - start.getTime()) / 60000);
        result.push({
          id: e.id, type: "event", title: e.title, time: e.startTime,
          color: "#4A6FA5", subtitle: `${duration} min`, isReminder: false,
          itemData: null,
        });
      }
    }

    for (const item of items) {
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
          itemData: item,
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
              const canEdit = item.type === "item" && item.itemData;
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
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() => openEdit(item.itemData!)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
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

      {/* Edit item sheet */}
      <AnimatePresence>
        {editingItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[55]"
              onClick={() => setEditingItem(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-2xl border-t border-border/50 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] max-h-[90dvh] flex flex-col"
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 shrink-0" />
              <div className="overflow-y-auto px-5 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-serif text-xl font-normal text-foreground">Edit Event</h3>
                  <button onClick={() => setEditingItem(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Event title"
                    autoFocus
                    className="w-full h-12 px-4 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />

                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none"
                  />

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">Priority</label>
                    <div className="flex gap-2">
                      {(["low", "medium", "high"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setEditPriority(p)}
                          className={`flex-1 h-9 rounded-lg text-xs font-medium border transition-all duration-150 flex items-center justify-center gap-1.5 ${
                            editPriority === p
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border/50 text-muted-foreground"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: priorityColors[p] }} />
                          {priorityLabels[p]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">Category</label>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setEditCategoryId(c.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs border transition-all duration-150 flex items-center gap-1.5 ${
                            editCategoryId === c.id
                              ? "border-primary bg-primary/5 text-foreground font-medium"
                              : "border-border/50 text-muted-foreground"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">Date</label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                  </div>

                  {editDueDate && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-2">Time</label>
                      <input
                        type="time"
                        value={editDueTime}
                        onChange={(e) => setEditDueTime(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      />
                    </div>
                  )}

                  <button
                    onClick={handleEditSave}
                    disabled={!editTitle.trim() || editSaving}
                    className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {editSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </main>
  );
}
