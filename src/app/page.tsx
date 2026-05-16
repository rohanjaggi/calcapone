"use client";

import { Greeting } from "@/components/dashboard/greeting";
import { StatsRow } from "@/components/dashboard/stats-row";
import { DayTimeline } from "@/components/dashboard/day-timeline";
import { TodoSection } from "@/components/dashboard/todo-section";
import { ReminderSection } from "@/components/dashboard/reminder-section";
import { NavBar } from "@/components/nav-bar";
import {
  mockUser,
  mockEvents,
  mockTodos,
  mockReminders,
  buildTimeline,
} from "@/lib/mock-data";

export default function Dashboard() {
  const timeline = buildTimeline(mockEvents, mockTodos, mockReminders);
  const pendingTasks = mockTodos.filter((t) => t.status !== "done").length;
  const pendingReminders = mockReminders.filter(
    (r) => r.status === "pending"
  ).length;

  return (
    <main className="flex-1 safe-bottom pb-8">
      <Greeting name={mockUser.name} />

      <StatsRow
        taskCount={pendingTasks}
        eventCount={mockEvents.length}
        reminderCount={pendingReminders}
      />

      <DayTimeline items={timeline} />

      <TodoSection todos={mockTodos} />

      <ReminderSection reminders={mockReminders} />

      <NavBar />
    </main>
  );
}
