"use client";

import { haptic } from "@/lib/telegram-webapp";

/** The one on/off control. On takes the hour's colour, like every other "this is live" mark. */
export function Switch({
  checked,
  onChange,
  label,
  labelledBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name, when no visible label is wired up through `labelledBy`. */
  label?: string;
  labelledBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      onClick={() => {
        haptic("select");
        onChange(!checked);
      }}
      className={`relative shrink-0 w-[3.25rem] h-8 rounded-full transition-colors duration-200 ${checked ? "bg-hour" : "bg-input"}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1 left-1 w-6 h-6 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          checked ? "translate-x-5 bg-background" : "bg-foreground"
        }`}
      />
    </button>
  );
}
