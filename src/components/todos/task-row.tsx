"use client";

import { useRef, useState } from "react";
import { motion, animate, useMotionValue, useTransform } from "motion/react";
import { Bell, Pencil, Repeat, Trash2 } from "lucide-react";
import { formatDueDate, formatTime } from "@/lib/task-constants";
import type { Item } from "@/lib/types";

/** Two 64px actions behind the row. */
const OPEN = -128;
const SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;

/** The tick: an open ring that fills and draws its check when the task is done. */
export function TaskCheck({
  done,
  inProgress,
  size = "md",
  onToggle,
  label,
}: {
  done: boolean;
  inProgress?: boolean;
  size?: "md" | "sm";
  onToggle: () => void;
  label: string;
}) {
  const box = size === "md" ? "w-[22px] h-[22px]" : "w-[18px] h-[18px]";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={done}
      aria-label={done ? `Mark “${label}” not done` : `Mark “${label}” done`}
      className="shrink-0 w-11 h-11 -m-2.5 flex items-center justify-center active:scale-90 transition-transform duration-150"
    >
      <span
        className={`${box} rounded-full border-[1.5px] flex items-center justify-center transition-colors duration-300 ${
          done ? "bg-done border-done" : inProgress ? "border-hour" : "border-faint"
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-[70%] h-[70%]" fill="none" aria-hidden="true">
          <motion.path
            d="M5 12.5l4.2 4.2L19 7"
            stroke="var(--background)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
            transition={{ duration: done ? 0.32 : 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      </span>
    </button>
  );
}

function Meta({ item, showDue, today }: { item: Item; showDue: boolean; today?: string }) {
  const bits: React.ReactNode[] = [];
  if (item.remindLocal) {
    const [day, time] = item.remindLocal.split("T");
    bits.push(
      <span key="r" className="inline-flex items-center gap-1">
        <Bell className="w-3 h-3" aria-label="Reminder" />
        {day !== item.dueDate ? `${formatDueDate(day)} ${formatTime(time)}` : formatTime(time)}
      </span>
    );
  }
  if (item.dueTime) bits.push(<span key="t">{formatTime(item.dueTime)}</span>);
  // "YYYY-MM-DD" strings in the same zone compare correctly as text.
  const overdue = !!today && !!item.dueDate && item.dueDate < today;
  if (showDue && item.dueDate)
    bits.push(
      <span key="d" className={overdue ? "text-alarm font-medium" : undefined}>
        {overdue ? `Overdue · ${formatDueDate(item.dueDate)}` : formatDueDate(item.dueDate)}
      </span>
    );
  if (item.repeat) bits.push(<span key="p" className="inline-flex items-center gap-1"><Repeat className="w-3 h-3" aria-hidden="true" />{item.repeat}</span>);
  if (item.priority === "high" && item.status !== "done") bits.push(<span key="h" className="text-foreground font-medium">High</span>);
  if (bits.length === 0) return null;
  return <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-muted-foreground">{bits}</span>;
}

/**
 * One task. Swipe left to reveal Edit and Delete — the row snaps open or shut and never deletes
 * on release; tap the row to edit; tap the ring to complete. In edit mode the swipe gives way
 * to a drag handle.
 */
export function TaskRow({
  item,
  first,
  editMode = false,
  showDue = true,
  showDescription = false,
  today,
  onToggle,
  onDelete,
  onEdit,
}: {
  item: Item;
  first: boolean;
  editMode?: boolean;
  showDue?: boolean;
  showDescription?: boolean;
  /** The user's today, "YYYY-MM-DD"; with it, a past due date reads as overdue. */
  today?: string;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
}) {
  const isDone = item.status === "done";
  const x = useMotionValue(0);
  const actionsOpacity = useTransform(x, [OPEN, OPEN / 3, 0], [1, 0.6, 0]);
  const [open, setOpen] = useState(false);
  const dragged = useRef(false);

  const settle = (to: "open" | "closed") => {
    setOpen(to === "open");
    animate(x, to === "open" ? OPEN : 0, SPRING);
  };

  return (
    // Rows inside a list are ruled from the text column in; a full-width rule starts a new list.
    <div className={`relative ${first ? "" : "before:absolute before:z-10 before:top-0 before:left-14 before:right-0 before:h-px before:bg-border"}`}>
      <motion.div
        className="absolute inset-y-0 right-0 flex"
        style={{ opacity: actionsOpacity }}
        aria-hidden={!open}
      >
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            settle("closed");
            onEdit(item);
          }}
          aria-label={`Edit “${item.title}”`}
          className="w-16 h-full flex flex-col items-center justify-center gap-1 bg-secondary text-foreground text-xs"
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            settle("closed");
            onDelete(item.id);
          }}
          aria-label={`Delete “${item.title}”`}
          className="w-16 h-full flex flex-col items-center justify-center gap-1 bg-alarm text-background text-xs font-medium"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          Delete
        </button>
      </motion.div>

      <motion.div
        className="relative bg-card flex items-start gap-3.5 px-4 py-3.5 min-h-14"
        drag={editMode ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: OPEN, right: 0 }}
        dragElastic={{ left: 0.08, right: 0 }}
        style={{ x, touchAction: "pan-y" }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          const flick = info.velocity.x < -300 || info.offset.x < OPEN / 3;
          settle(open ? (info.offset.x > 24 || info.velocity.x > 300 ? "closed" : "open") : flick ? "open" : "closed");
          setTimeout(() => (dragged.current = false), 0);
        }}
        onClick={() => {
          if (dragged.current || editMode) return;
          if (open) settle("closed");
          else onEdit(item);
        }}
      >
        <span className="pt-0.5">
          <TaskCheck
            done={isDone}
            inProgress={item.status === "in_progress"}
            label={item.title}
            onToggle={() => onToggle(item.id, item.status)}
          />
        </span>

        <span className="flex-1 min-w-0">
          <span
            className={`block text-base leading-snug transition-colors duration-300 ${
              isDone ? "line-through decoration-faint text-faint" : "text-foreground"
            }`}
          >
            {item.title}
          </span>
          {showDescription && item.description && !isDone && (
            <span className="block mt-0.5 text-[13px] text-muted-foreground line-clamp-2">{item.description}</span>
          )}
          {!isDone && <Meta item={item} showDue={showDue} today={today} />}
        </span>
      </motion.div>

      {item.subtasks && item.subtasks.length > 0 && (
        <ul className="pl-14 pr-4 pb-2 bg-card">
          {item.subtasks.map((sub) => (
            <li key={sub.id} className="flex items-center gap-3 min-h-11">
              <TaskCheck size="sm" done={sub.status === "done"} label={sub.title} onToggle={() => onToggle(sub.id, sub.status)} />
              <span className={`text-[15px] truncate ${sub.status === "done" ? "line-through decoration-faint text-faint" : "text-muted-foreground"}`}>
                {sub.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
