"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Without one, a thrown server action or render error dropped
 * the user on Next's default screen with no way back — inside Telegram there is no address
 * bar to recover with, so the retry button is the only exit.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] render error:", error);
  }, [error]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-8">
      <div className="rise w-full max-w-xs text-center">
        <h1 className="font-serif text-[2rem] leading-tight font-semibold text-foreground">That page didn&apos;t load</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Try again — your tasks are safe. If it keeps happening, the bot in Telegram still works.
        </p>
        <button
          onClick={reset}
          className="mt-7 h-[3.25rem] w-full rounded-2xl bg-primary text-primary-foreground text-base font-semibold transition-transform active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
