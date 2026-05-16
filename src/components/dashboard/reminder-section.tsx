"use client";

import { motion } from "motion/react";
import { ArrowRight, Bell, Repeat } from "lucide-react";
import Link from "next/link";
import type { Reminder } from "@/lib/mock-data";

function formatTimeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Overdue";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `In ${hours}h ${minutes > 0 ? `${minutes}m` : ""}`;
  return `In ${minutes}m`;
}

function formatReminderTime(iso: string) {
  const d = new Date(iso);
  const isToday =
    d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return isToday ? `Today at ${time}` : d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function ReminderItem({
  reminder,
  index,
}: {
  reminder: Reminder;
  index: number;
}) {
  const isPast = new Date(reminder.remindAt).getTime() < Date.now();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1],
        delay: index * 0.05 + 0.6,
      }}
      className={`flex items-start gap-3 px-4 py-3 ${
        index > 0 ? "border-t border-border/40" : ""
      }`}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 shrink-0"
        style={{
          backgroundColor: reminder.category
            ? `${reminder.category.color}12`
            : "rgba(184, 125, 107, 0.08)",
        }}
      >
        <Bell
          className="w-3.5 h-3.5"
          style={{
            color: reminder.category?.color ?? "#B87D6B",
          }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{reminder.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-muted-foreground">
            {formatReminderTime(reminder.remindAt)}
          </span>
          {reminder.recurring !== "none" && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Repeat className="w-2.5 h-2.5" />
              <span className="capitalize">{reminder.recurring}</span>
            </span>
          )}
        </div>
      </div>

      <span
        className={`text-[11px] font-medium mt-1 shrink-0 ${
          isPast ? "text-destructive" : "text-primary"
        }`}
      >
        {formatTimeUntil(reminder.remindAt)}
      </span>
    </motion.div>
  );
}

export function ReminderSection({ reminders }: { reminders: Reminder[] }) {
  const pending = reminders.filter((r) => r.status === "pending");

  if (pending.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.55 }}
      className="mt-7 px-5"
    >
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-xl font-normal text-foreground">
          Reminders
        </h2>
        <Link href="/todos" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          See all
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {pending.map((reminder, i) => (
          <ReminderItem key={reminder.id} reminder={reminder} index={i} />
        ))}
      </div>
    </motion.section>
  );
}
