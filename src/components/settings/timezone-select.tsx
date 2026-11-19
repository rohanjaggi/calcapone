"use client";
import { useState } from "react";
import { Globe } from "lucide-react";
import { SettingsCard, SaveButton } from "@/components/settings/settings-card";
import { fieldClass } from "@/components/ui/bottom-sheet";
import { useToast } from "@/components/ui/toast";

const COMMON_TIMEZONES = ["Asia/Singapore","America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto","Europe/London","Europe/Paris","Europe/Berlin","Asia/Tokyo","Asia/Shanghai","Asia/Kolkata","Asia/Dubai","Australia/Sydney","Pacific/Auckland"];

const label = (tz: string) => tz.replace(/_/g, " ");

type Props = { currentTimezone: string; onSave: (timezone: string) => Promise<void> };

export function TimezoneSelect({ currentTimezone, onSave }: Props) {
  const [timezone, setTimezone] = useState(currentTimezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = timezone !== currentTimezone;
  // A zone set from the bot (/timezone Europe/Lisbon) may not be in the short list; without
  // it the select silently showed the first option instead of the real setting.
  const zones = COMMON_TIMEZONES.includes(currentTimezone) ? COMMON_TIMEZONES : [currentTimezone, ...COMMON_TIMEZONES];

  const { notify } = useToast();
  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(timezone);
    } catch {
      notify("Couldn't change your timezone — please try again.");
      return;
    } finally {
      setSaving(false);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <SettingsCard icon={Globe} title="Timezone" value={label(currentTimezone)}>
      <select
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        aria-label="Timezone"
        className={fieldClass}
      >
        {zones.map((tz) => (
          <option key={tz} value={tz}>
            {label(tz)}
          </option>
        ))}
      </select>
      <p className="text-[13px] text-muted-foreground -mt-2">
        Today, reminders and the sky at the top of Home all follow this zone. Any other zone can be set from the bot with /timezone.
      </p>
      {(changed || saved) && <SaveButton onClick={handleSave} saving={saving} saved={saved} label="Update timezone" />}
    </SettingsCard>
  );
}
