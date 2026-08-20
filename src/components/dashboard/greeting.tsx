"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type Clock = { weekday: string; monthDay: string; greeting: string };

function readClock(timezone?: string): Clock {
  const now = new Date();
  const opts = timezone ? { timeZone: timezone } : {};
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { ...opts, hour: "numeric", hour12: false }).format(now)
  );
  return {
    weekday: new Intl.DateTimeFormat("en-US", { ...opts, weekday: "long" }).format(now),
    monthDay: new Intl.DateTimeFormat("en-US", { ...opts, month: "long", day: "numeric" }).format(now),
    greeting: greetingFor(hour),
  };
}

/**
 * `timezone` is the user's saved zone; pass it and the date is right no matter where they
 * open the Mini App from. The clock is read after mount rather than during render because
 * the server renders at a different instant — and, without the prop, in a different zone —
 * so rendering it directly made the first paint disagree with the server's HTML.
 */
export function Greeting({ name, timezone }: { name: string; timezone?: string }) {
  const [clock, setClock] = useState<Clock | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setClock(readClock(timezone)), 0);
    return () => clearTimeout(id);
  }, [timezone]);

  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="px-5 pt-6 pb-2"
    >
      {/* Reserve the line's height so nothing shifts when the date lands. */}
      <p className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase min-h-4">
        {clock?.weekday ?? ""}
      </p>
      {/* `date-gradient` clips its background to the glyphs, and that background only covers
          the element's own box — so with `leading-none` the descenders in "August"/"January"
          fall outside it and render transparent. `pb-1.5` gives them room; the greeting below
          drops its top margin by the same amount so the layout is unchanged. */}
      <h1 className="date-gradient text-[3.25rem] leading-none font-bold mt-0.5 tracking-tighter pb-1.5 min-h-[3.625rem]">
        {clock?.monthDay ?? ""}
      </h1>
      <p className="text-muted-foreground text-base min-h-6">
        {clock ? (
          <>
            {clock.greeting},{" "}
            <span className="text-foreground font-semibold">{name}</span>
          </>
        ) : (
          <span className="text-foreground font-semibold">{name}</span>
        )}
      </p>
    </motion.header>
  );
}
