"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { getAiRecommendation } from "@/app/actions";
import type { Item } from "@/lib/mock-data";

const CACHE_KEY = "calcapone-ai-priorities";
const CACHE_HASH_KEY = "calcapone-ai-priorities-hash";

type Priority = { task: string; reason: string };

type Props = {
  items: Item[];
};

function computeItemsHash(items: Item[]): string {
  const pending = items.filter((i) => i.status !== "done");
  return pending.map((i) => `${i.id}:${i.status}:${i.priority}`).sort().join("|");
}

export function AiRecommendation({ items }: Props) {
  const [priorities, setPriorities] = useState<Priority[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchRecommendation = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await getAiRecommendation(
        items.map((i) => ({
          title: i.title,
          priority: i.priority,
          status: i.status,
          dueDate: i.dueDate,
          dueTime: i.dueTime,
          remindAt: i.remindAt,
          category: i.category,
        }))
      );
      if (result.priorities) {
        setPriorities(result.priorities);
        const hash = computeItemsHash(items);
        localStorage.setItem(CACHE_KEY, JSON.stringify(result.priorities));
        localStorage.setItem(CACHE_HASH_KEY, hash);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [items]);

  /** Hash of the item set the current suggestions were computed for. */
  const lastHash = useRef<string | null>(null);

  useEffect(() => {
    const currentHash = computeItemsHash(items);
    if (lastHash.current === currentHash) return;
    lastHash.current = currentHash;

    // localStorage is an external system, so it's read inside the effect — but the state it
    // produces is applied from a callback rather than synchronously in the effect body,
    // which would commit a throwaway render first.
    let cached: string | null = null;
    try {
      if (localStorage.getItem(CACHE_HASH_KEY) === currentHash) cached = localStorage.getItem(CACHE_KEY);
    } catch {
      // private mode / storage disabled — fall through to a fresh fetch
    }

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Priority[];
        queueMicrotask(() => {
          setPriorities(parsed);
          setLoading(false);
        });
        return;
      } catch {
        // corrupt cache entry — fetch instead
      }
    }

    void fetchRecommendation();
  }, [items, fetchRecommendation]);

  if (error && !priorities) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
      className="mt-7 px-5"
    >
      <div className="bg-card border border-border/50 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-2">
            <span className="sparkle-icon text-sm ai-sparkle select-none">✦</span>
            <span className="text-xs font-medium text-muted-foreground tracking-wide">
              Focus on next
            </span>
          </div>
          <button
            onClick={fetchRecommendation}
            disabled={loading}
            className="text-muted-foreground/40 hover:text-muted-foreground active:scale-90 transition-all disabled:opacity-30"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="px-4 pb-3.5">
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-secondary/60 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 bg-secondary/80 rounded-full w-3/5 animate-pulse" />
                    <div className="h-2.5 bg-secondary/40 rounded-full w-2/5 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {priorities?.map((item, i) => (
                <motion.div
                  key={item.task}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                  className="flex items-start gap-3 py-1.5"
                >
                  <span className="w-5 h-5 rounded-full bg-secondary/80 flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {item.task}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70">
                      {item.reason}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
