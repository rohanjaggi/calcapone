"use client";

import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "motion/react";
import { ChevronsUp, Equal, ChevronsDown } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { priorityColors, priorityLabels } from "@/lib/task-constants";
import type { Priority } from "@/generated/prisma/enums";

function AnimatedNumber({ value }: { value: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));

  useEffect(() => {
    const controls = animate(count, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
    });
    return controls.stop;
  }, [count, value]);

  return <motion.span>{rounded}</motion.span>;
}

function StatCard({
  icon,
  value,
  label,
  accentColor,
  delay,
  reduceMotion,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  accentColor: string;
  delay: number;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        delay,
      }}
      className="flex-1 bg-card rounded-xl px-4 py-3.5 border border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center mb-2.5"
        style={{ backgroundColor: `${accentColor}12` }}
        aria-hidden="true"
      >
        <div style={{ color: accentColor }} className="w-3.5 h-3.5">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-serif font-bold text-foreground leading-none">
        <span className="sr-only">{value}</span>
        <span aria-hidden="true">
          {reduceMotion ? value : <AnimatedNumber value={value} />}
        </span>
      </p>
      <p className="text-[11px] text-muted-foreground mt-1 tracking-wide uppercase">
        {label}
      </p>
    </motion.div>
  );
}

const PRIORITY_ICONS: Record<Priority, ReactNode> = {
  high: <ChevronsUp className="w-full h-full" />,
  medium: <Equal className="w-full h-full" />,
  low: <ChevronsDown className="w-full h-full" />,
};

const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];

/**
 * Pending work split by priority. The three numbers are parts of one whole — every task
 * that isn't done lands in exactly one card — so the row reads as "what's left, and how
 * much of it is urgent" rather than three unrelated tallies.
 */
export function StatsRow({ counts }: { counts: Record<Priority, number> }) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <div className="flex gap-2.5 px-5 mt-5" role="group" aria-label="Pending tasks by priority">
      {PRIORITY_ORDER.map((priority, i) => (
        <StatCard
          key={priority}
          icon={PRIORITY_ICONS[priority]}
          value={counts[priority]}
          label={priorityLabels[priority]}
          accentColor={priorityColors[priority]}
          delay={0.15 + i * 0.07}
          reduceMotion={reduceMotion}
        />
      ))}
    </div>
  );
}
