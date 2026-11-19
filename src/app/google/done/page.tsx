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
    <main className="min-h-dvh flex items-center justify-center px-8 py-10 bg-background">
      <div className="w-full max-w-xs text-center">
        <Image src="/logo.png" alt="" width={72} height={72} className="mx-auto rounded-full sepia-[0.2] brightness-[0.96]" priority />
        <h1 className={`mt-6 font-serif text-[2rem] leading-tight font-semibold ${message.ok ? "text-foreground" : "text-alarm"}`}>
          {message.title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{message.detail}</p>
      </div>
    </main>
  );
}
