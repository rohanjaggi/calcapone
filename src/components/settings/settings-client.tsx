"use client";

import { Children, type ReactNode } from "react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HelpCircle, ChevronRight, LogOut, Settings } from "lucide-react";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { NotificationsConfig } from "@/components/settings/notifications-config";
import { GoogleCalendarCard } from "@/components/settings/google-calendar-card";
import {
  saveAiConfig,
  saveTimezone,
  saveNotifications,
  getGoogleAuthUrl,
  disconnectGoogle,
} from "@/app/settings/actions";
import { openExternal } from "@/lib/telegram-webapp";

type Props = {
  settings: {
    timezone: string;
    briefingEnabled: boolean;
    briefingTime: string | null;
    weeklyDigestEnabled: boolean;
    aiSuggestionEnabled: boolean;
    aiProvider: string | null;
    aiModel: string | null;
    hasAiApiKey: boolean;
    hasGoogleCalendar: boolean;
    googleCalendarId: string | null;
    quietStart: string | null;
    quietEnd: string | null;
    notifyMinPriority: string;
    digestDay: number;
    digestTime: string;
  };
};

/**
 * Entry choreography for the settings list. Each row fades and rises on the same curve, offset
 * by its position, so the page assembles top-down.
 *
 * The stagger is derived from child order rather than written onto each row: rows used to carry
 * their own `delay`, and the cards animated themselves on top of that, so every addition was a
 * chance to pick a number that didn't match. Anything dropped into the list below is now animated
 * by virtue of being in it — which is also why the cards themselves are plain, unanimated divs.
 */
function StaggeredRows({ children }: { children: ReactNode }) {
  return (
    <div className="px-5 mt-5 space-y-4">
      {Children.map(children, (row, i) => (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.06 + i * 0.06 }}
        >
          {row}
        </motion.div>
      ))}
    </div>
  );
}

export function SettingsClient({ settings }: Props) {
  const router = useRouter();

  const handleSaveAi = async (data: { aiProvider: string; aiApiKey?: string; aiModel: string }) => {
    await saveAiConfig(data);
    router.refresh();
  };

  const handleSaveTimezone = async (timezone: string) => {
    await saveTimezone(timezone);
    router.refresh();
  };

  const handleSaveNotifications = async (data: {
    briefingEnabled: boolean;
    briefingTime: string | null;
    weeklyDigestEnabled: boolean;
    aiSuggestionEnabled: boolean;
    quietStart: string | null;
    quietEnd: string | null;
    notifyMinPriority: string;
    digestDay: number;
    digestTime: string;
  }) => {
    await saveNotifications(data);
    router.refresh();
  };

  const handleConnectGoogle = async () => {
    const url = await getGoogleAuthUrl();
    // System browser, not the Mini App webview: Google rejects OAuth in embedded webviews.
    openExternal(url);
  };

  const handleDisconnectGoogle = async () => {
    await disconnectGoogle();
    router.refresh();
  };

  return (
    <main className="safe-bottom pb-8">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="px-5 pt-6 pb-2"
      >
        <div className="flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-primary shrink-0" />
          <h1 className="font-serif text-[2rem] leading-tight font-bold text-foreground tracking-tight">
            Settings
          </h1>
        </div>
      </motion.header>
      <StaggeredRows>
        <AiProviderForm
          currentProvider={settings.aiProvider}
          currentModel={settings.aiModel}
          hasApiKey={settings.hasAiApiKey}
          onSave={handleSaveAi}
        />
        <TimezoneSelect
          currentTimezone={settings.timezone}
          onSave={handleSaveTimezone}
        />
        <NotificationsConfig
          briefingEnabled={settings.briefingEnabled}
          briefingTime={settings.briefingTime}
          weeklyDigestEnabled={settings.weeklyDigestEnabled}
          aiSuggestionEnabled={settings.aiSuggestionEnabled}
          quietStart={settings.quietStart}
          quietEnd={settings.quietEnd}
          notifyMinPriority={settings.notifyMinPriority}
          digestDay={settings.digestDay}
          digestTime={settings.digestTime}
          onSave={handleSaveNotifications}
        />
        <GoogleCalendarCard
          isConnected={settings.hasGoogleCalendar}
          calendarId={settings.googleCalendarId}
          onConnect={handleConnectGoogle}
          onDisconnect={handleDisconnectGoogle}
        />
        <Link
          href="/how-to-use"
          className="flex items-center gap-2 bg-card border border-border/50 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] px-4 py-3 group transition-colors hover:bg-secondary/30"
        >
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <HelpCircle className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">How To Use</p>
            <p className="text-[11px] text-muted-foreground">
              Learn how to get the most out of CalCapone
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
        </Link>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="w-full flex items-center gap-2 bg-card border border-border/50 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] px-4 py-3 text-left transition-colors hover:bg-secondary/30"
          >
            <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <LogOut className="w-3.5 h-3.5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Log out</p>
              <p className="text-[11px] text-muted-foreground">Sign out of this device</p>
            </div>
          </button>
        </form>
      </StaggeredRows>
    </main>
  );
}
