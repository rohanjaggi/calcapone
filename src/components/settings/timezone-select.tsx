"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Globe, Check } from "lucide-react";

const COMMON_TIMEZONES = ["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto","Europe/London","Europe/Paris","Europe/Berlin","Asia/Tokyo","Asia/Shanghai","Asia/Kolkata","Asia/Dubai","Australia/Sydney","Pacific/Auckland"];

type Props = { currentTimezone: string; onSave: (timezone: string) => Promise<void> };

export function TimezoneSelect({ currentTimezone, onSave }: Props) {
  const [timezone, setTimezone] = useState(currentTimezone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = timezone !== currentTimezone;

  const handleSave = async () => { setSaving(true); await onSave(timezone); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-slate-blue-light flex items-center justify-center"><Globe className="w-3.5 h-3.5 text-slate-blue" /></div>
        <h3 className="text-sm font-medium text-foreground">Timezone</h3>
      </div>
      <div className="p-4">
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all appearance-none">
          {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
        </select>
        {changed && <button onClick={handleSave} disabled={saving} className="mt-3 w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2">{saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? "Saving..." : "Update Timezone"}</button>}
      </div>
    </motion.div>
  );
}
