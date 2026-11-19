"use client";

import { useState } from "react";
import { SkyHero } from "@/components/dashboard/sky-hero";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { AheadStrip } from "@/components/dashboard/ahead-strip";
import { DayTimeline } from "@/components/dashboard/day-timeline";
import { CreateItemSheet } from "@/components/todos/create-item-sheet";
import { TimezoneNudge } from "@/components/dashboard/timezone-nudge";
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
  const [pressing, ...ahead] = agenda.ahead;
  const { high, medium, low } = agenda.priorityCounts;

  return (
    <main className="safe-bottom">
      <SkyHero
        name={userName}
        timezone={timezone}
        today={today}
        pressing={pressing}
        openCount={high + medium + low}
        highCount={high}
      />
      <TimezoneNudge timezone={timezone} />
      <WeekStrip days={agenda.strip} selected={selected} today={today} onSelect={setSelected} />
      <DayTimeline
        items={entries}
        date={selected}
        isToday={selected === today}
        timezone={timezone}
        onAdd={() => setAdding(true)}
      />
      <AheadStrip items={ahead} selectableDates={agenda.strip.map((d) => d.date)} onSelect={setSelected} />

      {/* Keyed by day so a different day picked on the strip re-seeds the due date. */}
      <CreateItemSheet
        key={selected}
        open={adding}
        onClose={() => setAdding(false)}
        categories={agenda.categories}
        defaultDueDate={selected}
      />
    </main>
  );
}
