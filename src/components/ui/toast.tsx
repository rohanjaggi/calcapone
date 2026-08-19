"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Toast = { id: number; message: string; tone: "error" | "info" };

type ToastApi = {
  /** Show a transient message. Optimistic updates use this to explain a rollback. */
  notify: (message: string, tone?: Toast["tone"]) => void;
};

const ToastContext = createContext<ToastApi>({ notify: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const DURATION_MS = 4000;
let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: Toast["tone"] = "error") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), DURATION_MS);
  }, []);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Above the nav bar, inside the safe area — the Mini App sits under Telegram's chrome. */}
      <div
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`w-full max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg border ${
                toast.tone === "error"
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "bg-card border-border text-foreground"
              }`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
