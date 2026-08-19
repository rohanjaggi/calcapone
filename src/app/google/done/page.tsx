import Image from "next/image";

/**
 * Public landing page for the Google OAuth callback. It renders in the system browser,
 * outside Telegram, so it must not require a session — it only tells the user what happened
 * and sends them back to the Mini App.
 */
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { title: string; detail: string; ok: boolean }> = {
  connected: {
    title: "Google Calendar connected",
    detail: "You can close this tab and go back to Calcapone in Telegram.",
    ok: true,
  },
  denied: {
    title: "Connection cancelled",
    detail: "You didn't grant access. Reopen Calcapone in Telegram to try again.",
    ok: false,
  },
  no_refresh_token: {
    title: "Google didn't return a refresh token",
    detail:
      "This happens when the account was already linked. Remove Calcapone at myaccount.google.com/permissions, then connect again.",
    ok: false,
  },
  invalid_state: {
    title: "That link has expired",
    detail: "Connection links are valid for 10 minutes and can only be used once. Start again from Settings.",
    ok: false,
  },
  missing_params: {
    title: "Something was missing from that link",
    detail: "Start the connection again from Settings in Calcapone.",
    ok: false,
  },
  failed: {
    title: "Couldn't finish connecting",
    detail: "Google turned down the request. Reopen Calcapone in Telegram and try again.",
    ok: false,
  },
};

export default async function GoogleDonePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const message = MESSAGES[status ?? ""] ?? MESSAGES.failed;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Image src="/logo.png" alt="Calcapone" width={64} height={64} className="mx-auto mb-4 rounded-xl" priority />
        <h1 className={`text-lg font-semibold tracking-tight ${message.ok ? "text-foreground" : "text-destructive"}`}>
          {message.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{message.detail}</p>
      </div>
    </main>
  );
}
