"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarDays, Unlink, ExternalLink, ChevronDown } from "lucide-react";

type Props = { isConnected: boolean; calendarId: string | null; onConnect: () => Promise<void>; onDisconnect: () => Promise<void> };

export function GoogleCalendarCard({ isConnected, calendarId, onConnect, onDisconnect }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleAction = async () => { setLoading(true); if (isConnected) await onDisconnect(); else await onConnect(); setLoading(false); };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors hover:bg-muted/30 ${open ? "border-b border-border/40" : ""}`}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sage-light flex items-center justify-center"><CalendarDays className="w-3.5 h-3.5 text-sage" /></div>
          <div><h3 className="text-sm font-medium text-foreground">Google Calendar</h3><p className="text-[11px] text-muted-foreground">{isConnected ? `Connected · ${calendarId ?? "primary"}` : "Not connected"}</p></div>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4">
              <button onClick={handleAction} disabled={loading} className={`w-full h-10 rounded-lg text-sm font-medium transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 ${isConnected ? "border border-destructive/30 text-destructive hover:bg-destructive/5" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
                {loading ? "Loading..." : isConnected ? <><Unlink className="w-4 h-4" />Disconnect</> : <><ExternalLink className="w-4 h-4" />Connect Google Calendar</>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
