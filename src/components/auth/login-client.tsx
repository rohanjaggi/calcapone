"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Image from "next/image";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } };
  }
}

export function LoginClient() {
  const [status, setStatus] = useState<"idle" | "working" | "outside" | "failed">("idle");

  // Exchange Telegram Mini App initData for a session cookie, then load the app.
  const signIn = async () => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setStatus("outside");
      return;
    }
    setStatus("working");
    try {
      window.Telegram?.WebApp?.ready?.();
      window.Telegram?.WebApp?.expand?.();
      const res = await fetch("/api/auth/telegram/miniapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      window.location.replace("/");
    } catch {
      setStatus("failed");
    }
  };

  // If the SDK is already available (cached), attempt sign-in without waiting for onLoad.
  useEffect(() => {
    if (window.Telegram?.WebApp?.initData) signIn();
  }, []);

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
