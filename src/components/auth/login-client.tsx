"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { telegramWebApp } from "@/lib/telegram-webapp";
import { submitClass } from "@/components/ui/bottom-sheet";

/**
 * - `rejected`: Telegram's initData didn't verify (stale or tampered); only reopening helps.
 * - `unavailable`: our server or database is down; retrying the same initData can work.
 */
type Status = "idle" | "working" | "outside" | "rejected" | "unavailable";

export function LoginClient() {
  const [status, setStatus] = useState<Status>("idle");
  /** Guards the retry button against a second POST while one is in flight. */
  const started = useRef(false);

  // Exchange Telegram Mini App initData for a session cookie, then load the app.
  const signIn = useCallback(async () => {
    const webApp = telegramWebApp();
    const initData = webApp?.initData;
    if (!initData) {
      setStatus("outside");
      return;
    }
    if (started.current) return;
    started.current = true;
    setStatus("working");
    webApp?.ready?.();
    webApp?.expand?.();
    let res: Response;
    try {
      res = await fetch("/api/auth/telegram/miniapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
    } catch {
      res = new Response(null, { status: 503 }); // offline / network error: worth a retry
    }
    if (res.ok) {
      window.location.replace("/");
      return;
    }
    started.current = false;
    setStatus(res.status === 400 || res.status === 401 ? "rejected" : "unavailable");
  }, []);

  // The root layout loads the Telegram SDK before hydration, so it is ready by now. A timer
  // callback rather than the effect body keeps the status update in its own render pass.
  useEffect(() => {
    const id = setTimeout(() => void signIn(), 0);
    return () => clearTimeout(id);
  }, [signIn]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-8 py-10 bg-background">
      <div className="rise w-full max-w-xs text-center">
        {/* The mark is a white medallion; a touch of sepia warms it to the page's ivory. */}
        <Image src="/logo.png" alt="" width={88} height={88} priority className="mx-auto rounded-full sepia-[0.2] brightness-[0.96]" />
        <h1 className="mt-6 font-serif text-[2.5rem] leading-none font-semibold text-foreground">Calcapone</h1>

        {(status === "working" || status === "idle") && <p className="mt-4 text-[15px] text-muted-foreground">Opening your diary…</p>}

        {status === "outside" && (
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Open Calcapone from Telegram — tap the menu button in your chat with the bot to launch the app.
          </p>
        )}

        {status === "rejected" && (
          <p className="mt-4 text-[15px] leading-relaxed text-alarm">
            Telegram&apos;s sign-in data couldn&apos;t be verified. Close Calcapone and reopen it from the bot&apos;s menu button.
          </p>
        )}

        {status === "unavailable" && (
          <>
            <p className="mt-4 text-[15px] leading-relaxed text-alarm">
              Calcapone&apos;s server isn&apos;t responding right now. This isn&apos;t a problem with your Telegram.
            </p>
            <button className={`mt-4 ${submitClass}`} onClick={() => void signIn()}>
              Try again
            </button>
          </>
        )}
      </div>
    </main>
  );
}
