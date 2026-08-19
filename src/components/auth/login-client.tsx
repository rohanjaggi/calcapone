"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Image from "next/image";
import { telegramWebApp } from "@/lib/telegram-webapp";

export function LoginClient() {
  const [status, setStatus] = useState<"idle" | "working" | "outside" | "failed">("idle");
  /** Both the Script onLoad and the mount check can fire; only one sign-in POST should go out. */
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
    try {
      webApp?.ready?.();
      webApp?.expand?.();
      const res = await fetch("/api/auth/telegram/miniapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      window.location.replace("/");
    } catch {
      started.current = false;
      setStatus("failed");
    }
  }, []);

  // The SDK may already be cached from a previous open, in which case onLoad won't tell us
  // anything new. Run the check from a timer callback rather than the effect body so the
  // status update lands in its own render pass instead of cascading out of this one.
  useEffect(() => {
    const id = setTimeout(() => {
      if (telegramWebApp()?.initData) void signIn();
    }, 0);
    return () => clearTimeout(id);
  }, [signIn]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onLoad={signIn} />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Image src="/logo.png" alt="Calcapone" width={64} height={64} className="mx-auto mb-4 rounded-xl" />
        <h1 className="text-2xl font-semibold tracking-tight">Calcapone</h1>

        {status === "working" && <p className="mt-4 text-sm text-muted-foreground">Signing you in…</p>}

        {(status === "outside" || status === "idle") && (
          <p className="mt-3 text-sm text-muted-foreground">
            Open Calcapone from Telegram — tap the menu button in your chat with the bot to launch the app.
          </p>
        )}

        {status === "failed" && (
          <p className="mt-4 text-sm text-destructive">
            Couldn&apos;t sign you in. Please reopen Calcapone from the bot&apos;s menu button.
          </p>
        )}
      </div>
    </main>
  );
}
