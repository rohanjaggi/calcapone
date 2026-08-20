"use client";

import { Greeting } from "@/components/dashboard/greeting";
import { StatsRow } from "@/components/dashboard/stats-row";
import { DayTimeline } from "@/components/dashboard/day-timeline";
import { AiInput } from "@/components/dashboard/ai-input";
import { AiRecommendation } from "@/components/dashboard/ai-recommendation";
import { useStreamed } from "@/lib/use-streamed";
import { buildTimeline } from "@/lib/timeline";
import type { Item } from "@/lib/mock-data";

type Props = {
  userName: string;
  items: Item[];
  /** Streams in after the first paint — the stats row counts up from 0 when it lands. */
  eventCountPromise: Promise<number>;
  aiSuggestionEnabled: boolean;
  timezone: string;
  /** Today's "YYYY-MM-DD" in `timezone`, settled on the server so both renders agree. */
  today: string;
};

export function DashboardClient({ userName, items, eventCountPromise, aiSuggestionEnabled, timezone, today }: Props) {
  const eventCount = useStreamed(eventCountPromise, 0);
  const timeline = buildTimeline(items, timezone, today);
  const pendingItems = items.filter((i) => i.status !== "done").length;
  const pendingReminders = items.filter((i) => i.remindAt && i.status !== "done").length;

  return (
    <main className="safe-bottom pb-8">
      <Greeting name={userName} />
      <StatsRow taskCount={pendingItems} eventCount={eventCount} reminderCount={pendingReminders} />
      <AiInput />
      <DayTimeline items={timeline} />
      {aiSuggestionEnabled && <AiRecommendation items={items} />}
    </main>
  );
}
