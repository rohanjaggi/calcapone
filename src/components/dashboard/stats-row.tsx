"use client";

import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { CalendarDays, CheckSquare, Bell } from "lucide-react";
import { useEffect, type ReactNode } from "react";

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
}: {
  icon: ReactNode;
  value: number;
  label: string;
  accentColor: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
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
      >
        <div style={{ color: accentColor }} className="w-3.5 h-3.5">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-serif font-bold text-foreground leading-none">
        <AnimatedNumber value={value} />
      </p>
      <p className="text-[11px] text-muted-foreground mt-1 tracking-wide uppercase">
        {label}
      </p>
    </motion.div>
  );
}

export function StatsRow({
  taskCount,
  eventCount,
  reminderCount,
}: {
  taskCount: number;
  eventCount: number;
  reminderCount: number;
}) {
  return (
    <div className="flex gap-2.5 px-5 mt-5">
      <StatCard
        icon={<CheckSquare className="w-full h-full" />}
        value={taskCount}
        label="Tasks"
        accentColor="#92785C"
        delay={0.15}
      />
      <StatCard
        icon={<CalendarDays className="w-full h-full" />}
        value={eventCount}
        label="Events"
        accentColor="#4A6FA5"
        delay={0.22}
      />
      <StatCard
        icon={<Bell className="w-full h-full" />}
        value={reminderCount}
        label="Reminders"
        accentColor="#B87D6B"
        delay={0.29}
      />
    </div>
  );
}
