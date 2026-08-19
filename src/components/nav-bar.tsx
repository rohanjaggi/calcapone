"use client";

import Link, { useLinkStatus } from "next/link";
import { motion } from "motion/react";
import { Home, ListTodo, CalendarDays, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

const navItems = [
  { icon: Home, label: "Home", href: "/" },
  { icon: ListTodo, label: "Tasks", href: "/todos" },
  { icon: CalendarDays, label: "Calendar", href: "/calendar" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

/**
 * The tab's icon and label. Lives inside the <Link> because `useLinkStatus` only reports on
 * the link it's rendered under.
 *
 * The tab you tapped lights up the moment you tap it rather than when the server answers —
 * the pill itself still waits for the route to commit, so the highlight arrives with the
 * page instead of racing ahead of it. If the wait runs long the tab breathes; that's delayed
 * in CSS, so a quick navigation lands before it ever shows.
 */
function NavItemContent({
  icon: Icon,
  label,
  isActive,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
}) {
  const { pending } = useLinkStatus();
  const tint = isActive || pending ? "text-primary" : "text-muted-foreground";
  const breathe = pending ? "nav-pending" : "";

  return (
    <>
      <Icon className={`w-[18px] h-[18px] relative z-10 transition-colors duration-200 ${tint} ${breathe}`} />
      <span
        className={`text-[10px] relative z-10 transition-colors duration-200 ${tint} ${
          isActive || pending ? "font-medium" : ""
        } ${breathe}`}
      >
        {label}
      </span>
    </>
  );
}

export function NavBar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

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
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
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
                <NavItemContent icon={item.icon} label={item.label} isActive={isActive} />
              </Link>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
