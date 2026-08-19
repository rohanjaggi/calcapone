"use client";

import { useEffect, useState } from "react";

/**
 * Read a promise handed down from a Server Component without holding up the first paint.
 *
 * A page that awaits a slow external call (Google Calendar) can't render until it returns;
 * passing the promise instead lets the page paint with everything it already has, and the
 * value swaps in when it streams down. On rejection the fallback stands — callers that care
 * about the failure should surface it themselves.
 */
export function useStreamed<T>(promise: Promise<T>, fallback: T): T {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    let active = true;
    promise.then(
      (resolved) => {
        if (active) setValue(resolved);
      },
      () => {}
    );
    return () => {
      active = false;
    };
  }, [promise]);

  return value;
}
