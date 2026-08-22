"use client";

import { Greeting } from "@/components/dashboard/greeting";
import { StatsRow } from "@/components/dashboard/stats-row";
import { DayTimeline } from "@/components/dashboard/day-timeline";
import { buildTimeline } from "@/lib/timeline";
import type { Item } from "@/lib/mock-data";
import type { Priority } from "@/generated/prisma/enums";

type Props = {
  userName: string;
  items: Item[];
  timezone: string;
  /** Today's "YYYY-MM-DD" in `timezone`, settled on the server so both renders agree. */
  today: string;
};

export function DashboardClient({ userName, items, timezone, today }: Props) {
  const timeline = buildTimeline(items, timezone, today);

  const priorityCounts = items.reduce<Record<Priority, number>>(
    (acc, item) => {
      if (item.status !== "done") acc[item.priority] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );

  return (
    <main className="safe-bottom pb-8">
      <Greeting name={userName} />
      <StatsRow counts={priorityCounts} />
      <DayTimeline items={timeline} />
    </main>
  );
}
