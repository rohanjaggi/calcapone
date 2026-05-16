"use client";

import { Greeting } from "@/components/dashboard/greeting";
import { StatsRow } from "@/components/dashboard/stats-row";
import { DayTimeline } from "@/components/dashboard/day-timeline";
import { TodoSection } from "@/components/dashboard/todo-section";
import { ReminderSection } from "@/components/dashboard/reminder-section";
import { NavBar } from "@/components/nav-bar";
import type { Todo, Reminder, TimelineItem } from "@/lib/mock-data";

function buildTimeline(todos: Todo[], reminders: Reminder[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const t of todos) {
    if (t.dueDate) {
      items.push({
        id: t.id,
        type: "todo",
        title: t.title,
        time: t.dueDate,
        subtitle: `${t.category?.name ?? "Uncategorized"} · ${t.priority}`,
        color: t.category?.color ?? "#92785C",
        status: t.status,
      });
    }
  }

  for (const r of reminders) {
    items.push({
      id: r.id,
      type: "reminder",
      title: r.message,
      time: r.remindAt,
      subtitle:
        r.recurring !== "none"
          ? `${r.recurring} · ${r.category?.name ?? ""}`
          : r.category?.name ?? "",
      color: r.category?.color ?? "#B87D6B",
    });
  }

  items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return items;
}

type Props = {
  userName: string;
  todos: Todo[];
  reminders: Reminder[];
  eventCount: number;
};

export function DashboardClient({ userName, todos, reminders, eventCount }: Props) {
  const timeline = buildTimeline(todos, reminders);
  const pendingTasks = todos.filter((t) => t.status !== "done").length;
  const pendingReminders = reminders.filter((r) => r.status === "pending").length;

  return (
    <main className="safe-bottom pb-8">
      <Greeting name={userName} />

      <StatsRow
        taskCount={pendingTasks}
        eventCount={eventCount}
        reminderCount={pendingReminders}
      />

      <DayTimeline items={timeline} />

      <TodoSection todos={todos} />

      <ReminderSection reminders={reminders} />

      <NavBar />
    </main>
  );
}
