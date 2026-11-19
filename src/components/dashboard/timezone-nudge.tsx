"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTimezone } from "@/app/settings/actions";
import { useToast } from "@/components/ui/toast";

const DISMISS_KEY = "calcapone:tz-nudge-dismissed";

/**
 * Everyone starts on the default timezone and nothing told them, so a London user's
 * "remind me at 9" rang at 2am. When the phone's zone differs from the saved one, offer the
 * switch once (per phone zone); switching keeps existing reminders at their local times.
 */
export function TimezoneNudge({ timezone }: { timezone: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [phoneZone, setPhoneZone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Read after mount: the server has no phone zone, and both renders must agree.
  useEffect(() => {
    const id = setTimeout(() => {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let dismissed: string | null = null;
      try {
        dismissed = localStorage.getItem(DISMISS_KEY);
      } catch {
        // Storage blocked: the nudge just shows again next time.
      }
      if (zone && zone !== timezone && zone !== dismissed) setPhoneZone(zone);
    }, 0);
    return () => clearTimeout(id);
  }, [timezone]);

  if (!phoneZone) return null;
  const city = (zone: string) => zone.split("/").pop()!.replace(/_/g, " ");

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, phoneZone);
    } catch {
      // Storage blocked: nothing to remember it in.
    }
    setPhoneZone(null);
  };

  const accept = async () => {
    setSaving(true);
    try {
      await saveTimezone(phoneZone);
      notify(`Now using ${city(phoneZone)} time — your reminders kept their clock times.`, { tone: "info" });
      setPhoneZone(null);
      router.refresh();
    } catch {
      notify("Couldn't change your timezone — try it in Settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-4 mt-3 bg-card rounded-[1.5rem] px-5 py-4" aria-label="Timezone">
      <p className="text-[15px] leading-relaxed text-foreground">
        Your phone is on <b>{city(phoneZone)}</b> time, but reminders are set for <b>{city(timezone)}</b>.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={accept}
          disabled={saving}
          className="flex-1 min-h-11 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {saving ? "Switching…" : `Use ${city(phoneZone)}`}
        </button>
        <button onClick={dismiss} className="min-h-11 px-4 rounded-2xl text-[15px] text-muted-foreground active:bg-secondary">
          Keep
        </button>
      </div>
    </section>
  );
}
