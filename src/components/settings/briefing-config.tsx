"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Sun, Check } from "lucide-react";

type Props = { enabled: boolean; time: string | null; onSave: (data: { briefingEnabled: boolean; briefingTime: string | null }) => Promise<void> };

export function BriefingConfig({ enabled, time, onSave }: Props) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [briefingTime, setBriefingTime] = useState(time ?? "08:00");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = isEnabled !== enabled || briefingTime !== (time ?? "08:00");

  const handleSave = async () => { setSaving(true); await onSave({ briefingEnabled: isEnabled, briefingTime: isEnabled ? briefingTime : null }); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }} className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-terracotta-light flex items-center justify-center"><Sun className="w-3.5 h-3.5 text-terracotta" /></div>
        <h3 className="text-sm font-medium text-foreground">Morning Briefing</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Daily summary via Telegram</span>
          <button onClick={() => setIsEnabled(!isEnabled)} className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isEnabled ? "bg-primary" : "bg-muted"}`}>
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isEnabled ? "translate-x-5" : ""}`} />
          </button>
        </div>
        {isEnabled && <div><label className="text-xs font-medium text-muted-foreground block mb-1.5">Briefing time</label><input type="time" value={briefingTime} onChange={(e) => setBriefingTime(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all" /></div>}
        {changed && <button onClick={handleSave} disabled={saving} className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2">{saved ? <><Check className="w-4 h-4" /> Saved</> : saving ? "Saving..." : "Save"}</button>}
      </div>
    </motion.div>
  );
}
