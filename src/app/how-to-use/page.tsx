"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Sparkles,
  ListTodo,
  CalendarDays,
  Bell,
  Search,
  Settings,
  GripVertical,
} from "lucide-react";

const sections = [
  {
    icon: Sparkles,
    title: "AI Quick Add",
    color: "#B8860B",
    description:
      "On the home screen, use the AI input to add tasks, reminders, or events in natural language. Just type something like \"Buy groceries tomorrow\" or \"Remind me to call mom at 5pm\" and CalCapone will parse it automatically.",
    tips: [
      "Switch between Task, Reminder, and Event modes using the toggle",
      "Press Enter to submit or tap the send button",
      "You need to configure an AI provider in Settings first",
    ],
  },
  {
    icon: ListTodo,
    title: "Tasks & Categories",
    color: "#4A6FA5",
    description:
      "The Tasks tab organizes your to-dos into categories. Each category is a card with its own color, and tasks within show their priority level.",
    tips: [
      "Tap the + button to create a new task with a title, description, due date, priority, and category",
      "Tap the circle icon on a task to mark it complete",
      "Swipe a task left to reveal edit and delete options",
      "Tap \"Edit\" in the header to reorder categories by dragging, or drag tasks between categories",
      "Tap the category header to see all tasks in that category",
      "Use the \"...\" menu on a category to rename or delete it",
    ],
  },
  {
    icon: CalendarDays,
    title: "Calendar",
    color: "#6B8E6B",
    description:
      "The Calendar tab shows a monthly view with dots on days that have tasks, reminders, or events. Tap any day to see everything scheduled.",
    tips: [
      "Navigate between months with the arrow buttons",
      "Days with items show a small dot indicator",
      "Tap a day to see all tasks, reminders, and Google Calendar events for that day",
      "Edit or delete items directly from the day view",
      "Connect Google Calendar in Settings to see your external events here too",
    ],
  },
  {
    icon: Bell,
    title: "Reminders & Notifications",
    color: "#9B6B9B",
    description:
      "Set reminders on tasks so you never forget. CalCapone supports deadline escalation — as a due date approaches, notifications become more frequent and urgent.",
    tips: [
      "Reminders show a bell icon and their scheduled time in the timeline",
      "Configure quiet hours in Settings to avoid notifications during sleep",
      "Set a minimum priority threshold — only get notified for important items",
      "Enable the daily briefing for a morning summary of your day",
      "Enable the weekly digest for a recap of what's coming up",
    ],
  },
  {
    icon: Search,
    title: "Search",
    color: "#7B8EA0",
    description:
      "Quickly find any task or reminder using the search feature on the home screen. It searches across all your categories and items.",
    tips: [
      "Tap the search icon on the home screen to open the search dialog",
      "Use Cmd+K (or Ctrl+K) as a keyboard shortcut",
      "Results appear as you type — no need to press Enter",
      "Search matches task titles and shows the category and due date",
    ],
  },
  {
    icon: Sparkles,
    title: "AI Suggestions",
    color: "#B8860B",
    description:
      "When enabled, CalCapone uses AI to analyze your pending tasks and suggest what to focus on next, based on priority, deadlines, and context.",
    tips: [
      "The \"Focus on next\" card appears on the home screen",
      "It ranks your top 3 tasks with a reason for each",
      "Tap the refresh icon to get updated suggestions",
      "Enable or disable this in Settings under Notifications",
    ],
  },
  {
    icon: Settings,
    title: "Settings & Configuration",
    color: "#8B7355",
    description:
      "Customize CalCapone to fit your workflow. Configure your AI provider, timezone, notification preferences, and connect external calendars.",
    tips: [
      "AI Provider: Choose between OpenAI, Anthropic, or Google and enter your API key",
      "Timezone: Set your local timezone for accurate scheduling",
      "Google Calendar: Connect your account to sync events bidirectionally",
      "Notifications: Configure daily briefings, weekly digests, quiet hours, and priority thresholds",
    ],
  },
  {
    icon: GripVertical,
    title: "Tips & Tricks",
    color: "#6B6B6B",
    description:
      "A few more things to help you get the most out of CalCapone.",
    tips: [
      "The home screen timeline shows everything scheduled for today, ordered by time",
      "Stats at the top of the home screen show your pending tasks, events, and reminders at a glance",
      "Tasks cycle through statuses: pending → done (tap the circle icon)",
      "High-priority tasks show a colored badge so they stand out",
      "All data syncs automatically — changes are saved instantly",
    ],
  },
];

export default function HowToUsePage() {
  const router = useRouter();

  return (
    <main className="safe-bottom pb-8">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="px-5 pt-6 pb-2"
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-6 h-6 text-primary shrink-0" />
          <h1 className="font-serif text-[2rem] leading-tight font-bold text-foreground tracking-tight">
            How To Use
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Everything you need to know to get started with CalCapone.
        </p>
      </motion.header>

      <div className="px-5 mt-5 space-y-4">
        {sections.map((section, i) => {
          const Icon = section.icon;
          return (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
                delay: i * 0.06 + 0.1,
              }}
              className="bg-card border border-border/50 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/30">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${section.color}15` }}
                >
                  <Icon
                    className="w-4 h-4"
                    style={{ color: section.color }}
                  />
                </div>
                <h2 className="text-sm font-semibold text-foreground">
                  {section.title}
                </h2>
              </div>
              <div className="px-4 py-3.5">
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {section.description}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {section.tips.map((tip) => (
                    <li
                      key={tip}
                      className="flex items-start gap-2 text-[13px] text-foreground/80 leading-relaxed"
                    >
                      <span className="w-1 h-1 rounded-full bg-primary/50 mt-2 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          );
        })}
      </div>
    </main>
  );
}
