"use client";

import { useEffect } from "react";
import { minuteInTz, skyAt, skyVars } from "@/lib/sky";

/**
 * Moves the sky on as the user's day goes by. Writes straight to the root element's style, so
 * every page that reads the sky variables follows it; the registered properties in
 * globals.css make each step a slow cross-fade rather than a jump.
 */
export function SkyTicker({ timezone }: { timezone: string }) {
  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout>;

    const paint = () => {
      const sky = skyAt(minuteInTz(timezone));
      for (const [name, value] of Object.entries(skyVars(sky))) root.style.setProperty(name, value);
      root.dataset.phase = sky.phase.toLowerCase();
      // Land on the next minute boundary rather than drifting by a minute per hour.
      timer = setTimeout(paint, 60_000 - (Date.now() % 60_000) + 50);
    };

    paint();
    // Turn the minute-to-minute cross-fade on only after this first paint has landed.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset.skyLive = "")));
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [timezone]);

  return null;
}
