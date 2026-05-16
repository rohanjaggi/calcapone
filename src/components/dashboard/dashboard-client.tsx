"use client";

import { Greeting } from "@/components/dashboard/greeting";
import { StatsRow } from "@/components/dashboard/stats-row";
import { DayTimeline } from "@/components/dashboard/day-timeline";
import { ItemsSection } from "@/components/dashboard/todo-section";
import { NavBar } from "@/components/nav-bar";
import type { Item, TimelineItem } from "@/lib/mock-data";

function buildTimeline(items: Item[]): TimelineItem[] {
  const timelineItems: TimelineItem[] = [];

  for (const item of items) {
    const time = item.remindAt ?? (item.dueDate && item.dueTime ? `${item.dueDate}T${item.dueTime}:00` : null);
    if (!time) continue;

    timelineItems.push({
      id: item.id,
      type: "item",
      title: item.title,
      time,
      subtitle: `${item.category.name} · ${item.priority}`,
      color: item.category.color,
      isReminder: !!item.remindAt,
      status: item.status,
    });
  }

  timelineItems.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return timelineItems;
}

type Props = {
  userName: string;
  items: Item[];
  eventCount: number;
};

export function DashboardClient({ userName, items, eventCount }: Props) {
  const timeline = buildTimeline(items);
  const pendingItems = items.filter((i) => i.status !== "done").length;
  const pendingReminders = items.filter((i) => i.remindAt && i.status !== "done").length;

  return (
    <main className="safe-bottom pb-8">
      <Greeting name={userName} />
      <StatsRow taskCount={pendingItems} eventCount={eventCount} reminderCount={pendingReminders} />
      <DayTimeline items={timeline} />
      <ItemsSection items={items} />
      <NavBar />
    </main>
  );
}
