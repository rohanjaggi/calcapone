"use client";

import { motion } from "motion/react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(date: Date) {
  return {
    weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
    monthDay: date.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
  };
}

export function Greeting({ name }: { name: string }) {
  const { weekday, monthDay } = formatDate(new Date());
  const greeting = getGreeting();

  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="px-5 pt-6 pb-2"
    >
      <p className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
        {weekday}
      </p>
      <h1 className="date-gradient text-[3.25rem] leading-none font-bold mt-0.5 tracking-tighter">
        {monthDay}
      </h1>
      <p className="text-muted-foreground text-base mt-1.5">
        {greeting},{" "}
        <span className="text-foreground font-semibold">{name}</span>
      </p>
    </motion.header>
  );
}
