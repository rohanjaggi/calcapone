"use client";

import { motion } from "motion/react";
import { Home, ListTodo, CalendarDays, Settings } from "lucide-react";
import { useState } from "react";

const navItems = [
  { icon: Home, label: "Home", href: "/" },
  { icon: ListTodo, label: "Tasks", href: "/todos" },
  { icon: CalendarDays, label: "Calendar", href: "/calendar" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function NavBar() {
  const [active, setActive] = useState(0);

  return (
    <motion.nav
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        delay: 0.7,
      }}
      className="fixed bottom-0 left-0 right-0 z-50"
    >
      <div className="mx-4 mb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
        <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] px-2 py-1.5 flex items-center justify-around">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            const isActive = i === active;

            return (
              <button
                key={item.label}
                onClick={() => setActive(i)}
                className="relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors duration-200 active:scale-95"
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 bg-primary/8 rounded-xl"
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    }}
                  />
                )}
                <Icon
                  className={`w-[18px] h-[18px] relative z-10 transition-colors duration-200 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-[10px] relative z-10 transition-colors duration-200 ${
                    isActive
                      ? "text-primary font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
