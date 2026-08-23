"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Greeting } from "@/components/dashboard/greeting";
import { StatsRow } from "@/components/dashboard/stats-row";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { AheadStrip } from "@/components/dashboard/ahead-strip";
import { DayTimeline } from "@/components/dashboard/day-timeline";
import { CreateItemSheet } from "@/components/todos/create-item-sheet";
import type { Agenda } from "@/lib/services/agenda";

type Props = {
  userName: string;
  timezone: string;
  /** Today's "YYYY-MM-DD" in `timezone`, settled on the server so both renders agree. */
  today: string;
  agenda: Agenda;
};

export function DashboardClient({ userName, timezone, today, agenda }: Props) {
  const [selected, setSelected] = useState(today);
  const [adding, setAdding] = useState(false);

  const entries = agenda.byDay[selected] ?? [];

  return (
    <main className="safe-bottom pb-8">
      <Greeting name={userName} timezone={timezone} />
      <StatsRow counts={agenda.priorityCounts} />
      <AheadStrip
        items={agenda.ahead}
        selectableDates={agenda.strip.map((d) => d.date)}
        onSelect={setSelected}
      />
      <WeekStrip days={agenda.strip} selected={selected} today={today} onSelect={setSelected} />
      <DayTimeline items={entries} isToday={selected === today} />

      <button
        onClick={() => setAdding(true)}
        className="mx-5 mt-6 w-[calc(100%-2.5rem)] flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card py-3 text-sm font-medium text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.03)] active:scale-[0.99] transition-transform"
      >
        <Plus className="w-4 h-4" />
        Add task
      </button>

      <CreateItemSheet
        open={adding}
        onClose={() => setAdding(false)}
        categories={agenda.categories}
      />
    </main>
  );
}
