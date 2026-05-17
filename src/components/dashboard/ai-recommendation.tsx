"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { getAiRecommendation } from "@/app/actions";
import type { Item } from "@/lib/mock-data";

const CACHE_KEY = "calcapone-ai-suggestion";

type Props = {
  items: Item[];
};

export function AiRecommendation({ items }: Props) {
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchRecommendation = async () => {
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
      if (result.recommendation) {
        const clean = result.recommendation.replace(/\*+/g, "");
        setRecommendation(clean);
        sessionStorage.setItem(CACHE_KEY, clean);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      setRecommendation(cached);
      setLoading(false);
    } else {
      fetchRecommendation();
    }
  }, []);

  if (error && !recommendation) return null;

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
              AI Suggestion
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

        <div className="px-4 pb-4">
          {loading ? (
            <div className="space-y-2">
              <div className="h-3 bg-secondary/80 rounded-full w-full animate-pulse" />
              <div className="h-3 bg-secondary/60 rounded-full w-4/5 animate-pulse" />
              <div className="h-3 bg-secondary/40 rounded-full w-3/5 animate-pulse" />
            </div>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="text-sm text-foreground/80 leading-relaxed"
            >
              {recommendation}
            </motion.p>
          )}
        </div>
      </div>
    </motion.section>
  );
}
