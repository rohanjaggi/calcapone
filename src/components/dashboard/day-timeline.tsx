"use client";

import { motion } from "motion/react";
import { Calendar, CheckCircle2, Bell, ArrowRight } from "lucide-react";
import type { TimelineItem } from "@/lib/mock-data";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function isNowBetween(time: string, nextTime: string | undefined) {
  const now = Date.now();
  const t = new Date(time).getTime();
  const n = nextTime ? new Date(nextTime).getTime() : t + 3600000;
  return now >= t && now < n;
}

function isPast(time: string) {
  return new Date(time).getTime() < Date.now();
}

const typeIcon = {
  event: Calendar,
  todo: CheckCircle2,
  reminder: Bell,
};

const typeLabel = {
  event: "Event",
  todo: "Task",
  reminder: "Reminder",
};

function TimelineCard({
  item,
  index,
  showNow,
}: {
  item: TimelineItem;
  index: number;
  showNow: boolean;
}) {
  const Icon = typeIcon[item.type];
  const past = isPast(item.time);

  return (
    <>
      {showNow && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.5, delay: index * 0.06 + 0.1 }}
          className="flex items-center gap-3 pl-[2.75rem]"
          style={{ transformOrigin: "left" }}
        >
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-primary now-pulse" />
          </div>
          <div className="h-px flex-1 bg-primary/20" />
          <span className="text-[10px] font-medium text-primary tracking-wider uppercase pr-1">
            Now
          </span>
        </motion.div>
      )}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: 0.45,
          ease: [0.22, 1, 0.36, 1],
          delay: index * 0.06 + 0.3,
        }}
        className={`flex items-start gap-3 ${past && !showNow ? "opacity-45" : ""}`}
      >
        <span className="w-[3rem] text-right text-xs text-muted-foreground pt-1.5 shrink-0 tabular-nums">
          {formatTime(item.time)}
        </span>

        <div className="relative mt-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: item.color }}
          />
        </div>

        <div className="flex-1 min-w-0 bg-card border border-border/50 rounded-lg px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-[0.98] transition-transform duration-150">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Icon
              className="w-3 h-3 shrink-0"
              style={{ color: item.color }}
            />
            <span
              className="text-[10px] font-medium tracking-wider uppercase"
              style={{ color: item.color }}
            >
              {typeLabel[item.type]}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground truncate">
            {item.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
            {item.subtitle}
          </p>
        </div>
      </motion.div>
    </>
  );
}

export function DayTimeline({ items }: { items: TimelineItem[] }) {
  let nowInserted = false;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="mt-7 px-5"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif text-xl font-normal text-foreground">
          Today
        </h2>
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          Full schedule
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="relative space-y-3">
        <div className="timeline-line" />

        {items.map((item, i) => {
          let showNow = false;
          if (!nowInserted) {
            const nextTime = items[i + 1]?.time;
            if (isNowBetween(item.time, nextTime) || (!isPast(item.time) && i === 0)) {
              // Don't show now before first item if first item is in the future
            }
            if (isPast(item.time) && items[i + 1] && !isPast(items[i + 1].time)) {
              showNow = true;
              nowInserted = true;
            }
          }

          return (
            <TimelineCard
              key={item.id}
              item={item}
              index={i}
              showNow={showNow}
            />
          );
        })}

        {!nowInserted && items.length > 0 && items.every((i) => isPast(i.time)) && (
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.5, delay: items.length * 0.06 + 0.3 }}
            className="flex items-center gap-3 pl-[2.75rem]"
            style={{ transformOrigin: "left" }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-primary now-pulse" />
            <div className="h-px flex-1 bg-primary/20" />
            <span className="text-[10px] font-medium text-primary tracking-wider uppercase pr-1">
              Now
            </span>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}
