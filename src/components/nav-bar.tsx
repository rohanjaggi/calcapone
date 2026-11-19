"use client";

import Link, { useLinkStatus } from "next/link";
import { motion } from "motion/react";
import { Home, ListTodo, CalendarDays, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { haptic } from "@/lib/telegram-webapp";

const navItems = [
  { icon: Home, label: "Home", href: "/" },
  { icon: ListTodo, label: "Tasks", href: "/todos" },
  { icon: CalendarDays, label: "Calendar", href: "/calendar" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

/** Pages that render outside the app: no tabs to go to from there. */
const BARE_ROUTES = ["/login", "/google/done"];

/** A tab owns its whole branch, so a list page under /todos still lights Tasks. */
function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The tab's icon and label. Lives inside the <Link> because `useLinkStatus` only reports on
 * the link it's rendered under.
 *
 * The tab you tapped lights up the moment you tap it rather than when the server answers —
 * the hour-coloured underline still waits for the route to commit, so it arrives with the
 * page instead of racing ahead of it. If the wait runs long the tab breathes; that's delayed
 * in CSS, so a quick navigation lands before it ever shows.
 */
function NavItemContent({
  icon: Icon,
  label,
  isActive,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  isActive: boolean;
}) {
  const { pending } = useLinkStatus();
  const tint = isActive || pending ? "text-foreground" : "text-faint";
  const breathe = pending ? "nav-pending" : "";

  return (
    <>
      <Icon strokeWidth={isActive ? 2 : 1.6} className={`w-5 h-5 relative transition-colors duration-200 ${tint} ${breathe}`} />
      <span className={`text-xs relative transition-colors duration-200 ${tint} ${isActive ? "font-semibold" : "font-medium"} ${breathe}`}>
        {label}
      </span>
    </>
  );
}

export function NavBar() {
  const pathname = usePathname();
  if (BARE_ROUTES.some((route) => pathname.startsWith(route))) return null;

  return (
    <nav aria-label="Main" className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="mx-4 sm:mx-auto sm:max-w-[34rem] mb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pointer-events-auto">
        <div className="bg-raised border border-border rounded-[1.375rem] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.85)] px-1.5 h-16 grid grid-cols-4">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => !active && haptic("select")}
                className="relative flex flex-col items-center justify-center gap-1 rounded-2xl active:scale-95 transition-transform duration-150"
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    aria-hidden="true"
                    className="absolute bottom-1.5 h-[3px] w-5 rounded-full bg-hour"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <NavItemContent icon={item.icon} label={item.label} isActive={active} />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
