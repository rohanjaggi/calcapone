"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { BriefingConfig } from "@/components/settings/briefing-config";
import { GoogleCalendarCard } from "@/components/settings/google-calendar-card";
import { NavBar } from "@/components/nav-bar";
import {
  saveAiConfig,
  saveTimezone,
  saveBriefing,
  getGoogleAuthUrl,
  disconnectGoogle,
} from "@/app/settings/actions";

type Props = {
  userId: string;
  settings: {
    timezone: string;
    briefingEnabled: boolean;
    briefingTime: string | null;
    aiProvider: string | null;
    aiModel: string | null;
    hasAiApiKey: boolean;
    hasGoogleCalendar: boolean;
    googleCalendarId: string | null;
  };
};

export function SettingsClient({ userId, settings }: Props) {
  const router = useRouter();

  const handleSaveAi = async (data: { aiProvider: string; aiApiKey?: string; aiModel: string }) => {
    await saveAiConfig(data);
    router.refresh();
  };

  const handleSaveTimezone = async (timezone: string) => {
    await saveTimezone(timezone);
    router.refresh();
  };

  const handleSaveBriefing = async (data: { briefingEnabled: boolean; briefingTime: string | null }) => {
    await saveBriefing(data);
    router.refresh();
  };

  const handleConnectGoogle = async () => {
    const url = await getGoogleAuthUrl();
    window.location.href = url;
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
        <p className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
          Configuration
        </p>
        <h1 className="font-serif text-[2rem] leading-tight font-light text-foreground mt-0.5 tracking-tight">
          Settings
        </h1>
      </motion.header>
      <div className="px-5 mt-5 space-y-4">
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
        <BriefingConfig
          enabled={settings.briefingEnabled}
          time={settings.briefingTime}
          onSave={handleSaveBriefing}
        />
        <GoogleCalendarCard
          isConnected={settings.hasGoogleCalendar}
          calendarId={settings.googleCalendarId}
          onConnect={handleConnectGoogle}
          onDisconnect={handleDisconnectGoogle}
        />
      </div>
      <NavBar />
    </main>
  );
}
