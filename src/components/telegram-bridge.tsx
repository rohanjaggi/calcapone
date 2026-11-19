"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { telegramSupports, telegramWebApp } from "@/lib/telegram-webapp";

/** The app's ground; Telegram's own chrome is painted to match so the Mini App has no seam. */
export const INK = "#0E1220";

function call(fn: () => void) {
  try {
    fn();
  } catch {
    // An older client without this method: leave Telegram's default.
  }
}

/**
 * Wires the Telegram chrome to the app: matching header and background, the native back
 * button on pages below a tab, and no swipe-to-close while a sheet or row is being dragged.
 */
export function TelegramBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const app = telegramWebApp();
    if (!app) return;
    call(() => app.ready?.());
    call(() => app.expand?.());
    if (telegramSupports("6.1")) call(() => app.setBackgroundColor?.(INK));
    if (telegramSupports("7.10")) call(() => app.setBottomBarColor?.(INK));
    if (telegramSupports("7.7")) call(() => app.disableVerticalSwipes?.());
  }, []);

  useEffect(() => {
    if (!telegramSupports("6.1")) return;
    const app = telegramWebApp();
    // Home paints the header from its sky (see SkyHero); every other page sits on ink.
    if (pathname !== "/") call(() => app?.setHeaderColor?.(INK));

    const back = app?.BackButton;
    if (!back) return;
    // A list page is one level below Tasks; everything else is a tab and has no "back".
    const nested = pathname.startsWith("/todos/");
    const goBack = () => router.push("/todos");
    if (nested) {
      call(() => back.onClick(goBack));
      call(() => back.show());
    } else {
      call(() => back.hide());
    }
    return () => {
      call(() => back.offClick(goBack));
    };
  }, [pathname, router]);

  // Coming back to the app shows what changed while it was away: a Google Calendar just
  // connected in the browser, a task added in chat, or a new day. Most clients fire
  // visibilitychange when the Mini App returns; newer ones also send "activated".
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 2000) return; // both can fire at once
      last = Date.now();
      router.refresh();
    };
    const app = telegramWebApp();
    document.addEventListener("visibilitychange", refresh);
    if (telegramSupports("8.0")) call(() => app?.onEvent?.("activated", refresh));
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      if (telegramSupports("8.0")) call(() => app?.offEvent?.("activated", refresh));
    };
  }, [router]);

  return null;
}
