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
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That didn&apos;t load. Try again — your tasks are safe.
        </p>
        <button
          onClick={reset}
          className="mt-5 h-11 w-full rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
