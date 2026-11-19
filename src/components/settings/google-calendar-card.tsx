"use client";
import { useState } from "react";
import { CalendarDays, Unlink, ExternalLink } from "lucide-react";
import { SettingsCard } from "@/components/settings/settings-card";

type Props = {
  isConnected: boolean;
  calendarId: string | null;
  /** Minutes before an event starts that the bot pings; null when off. Set with /alerts in chat. */
  eventAlertMinutes: number | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
};

export function GoogleCalendarCard({ isConnected, calendarId, eventAlertMinutes, onConnect, onDisconnect }: Props) {
  const [loading, setLoading] = useState(false);
  const handleAction = async () => {
    setLoading(true);
    try {
      if (isConnected) await onDisconnect();
      else await onConnect();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsCard
      icon={CalendarDays}
      title="Google Calendar"
      value={isConnected ? `Connected · ${calendarId ?? "primary"}` : "Not connected"}
    >
      <p className="text-[15px] text-muted-foreground">
        {isConnected
          ? "Events show on Home and in Calendar, and you can change them here or in chat."
          : "Sign-in opens in your browser — Google doesn't allow it inside Telegram. Come back here when it's done."}
      </p>
      {/* The only switch for event alerts lives in chat; without this nobody learned it existed. */}
      {isConnected && (
        <p className="text-[15px] text-muted-foreground">
          {eventAlertMinutes == null ? (
            <>Event alerts are off. Send <code>/alerts 15</code> to the bot to get a ping 15 minutes before each event.</>
          ) : (
            <>The bot pings you {eventAlertMinutes} min before each event. Change it with <code>/alerts</code>.</>
          )}
        </p>
      )}
      <button
        onClick={handleAction}
        disabled={loading}
        className={`w-full h-12 rounded-2xl text-[15px] font-semibold transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 ${
          isConnected ? "border border-alarm/40 text-alarm" : "bg-primary text-primary-foreground"
        }`}
      >
        {loading ? (
          "Working…"
        ) : isConnected ? (
          <>
            <Unlink className="w-4 h-4" aria-hidden="true" />
            Disconnect
          </>
        ) : (
          <>
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            Connect Google Calendar
          </>
        )}
      </button>
    </SettingsCard>
  );
}
