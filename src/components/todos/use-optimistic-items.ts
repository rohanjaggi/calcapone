"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toggleItemStatus, removeItem } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import { haptic } from "@/lib/telegram-webapp";
import type { Item } from "@/lib/types";

/** How long a deleted task waits, hidden, for an Undo before the server delete goes out. */
export const UNDO_MS = 5000;

/**
 * A server-provided task list with optimistic toggle and delete. Each change rolls back with a
 * toast if the server rejects it, and the list re-syncs whenever the server sends a new one
 * (after `router.refresh()`), so new and edited tasks appear.
 *
 * Deleting hides the task and offers Undo; the server delete is sent only once the Undo window
 * closes, or straight away if the page goes away first, so nothing is lost by navigating.
 */
export function useOptimisticItems(serverItems: Item[]) {
  const router = useRouter();
  const { notify } = useToast();
  const [items, setItems] = useState(serverItems);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>());

  // React's "adjusting state when a prop changes": done during render, not in an effect, so
  // no stale frame is committed first.
  const [synced, setSynced] = useState(serverItems);
  if (serverItems !== synced) {
    setSynced(serverItems);
    setItems(serverItems);
  }

  const unhide = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const toggle = async (id: string, current: Item["status"]) => {
    const next = current === "done" ? "pending" : "done";
    const snapshot = items;
    // Subtasks sit inside their parent, so they're reached there too: a tapped subtask ring
    // otherwise didn't change until the server answered.
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: next }
          : item.subtasks?.some((sub) => sub.id === id)
            ? { ...item, subtasks: item.subtasks.map((sub) => (sub.id === id ? { ...sub, status: next } : sub)) }
            : item
      )
    );
    if (next === "done") haptic("success");
    try {
      await toggleItemStatus(id, next);
      router.refresh();
    } catch {
      setItems(snapshot);
      notify("Couldn't update that task — please try again.");
    }
  };

  const remove = (id: string) => {
    const item = items.find((i) => i.id === id);
    setHidden((prev) => new Set(prev).add(id));
    haptic("warning");

    const commit = async () => {
      pending.current.delete(id);
      try {
        await removeItem(id);
        router.refresh();
      } catch {
        unhide(id);
        notify("Couldn't delete that task — please try again.");
      }
    };
    const timer = setTimeout(commit, UNDO_MS);
    pending.current.set(id, { timer, commit });

    notify(item ? `Deleted “${item.title}”` : "Task deleted", {
      tone: "info",
      durationMs: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          pending.current.delete(id);
          unhide(id);
          haptic("select");
        },
      },
    });
  };

  // Leaving the page (or Telegram closing the app) ends the Undo window early: send the
  // deletes now rather than dropping them.
  useEffect(() => {
    const queue = pending.current;
    const flush = () => {
      for (const { timer, commit } of [...queue.values()]) {
        clearTimeout(timer);
        commit();
      }
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);

  const visible = hidden.size === 0 ? items : items.filter((item) => !hidden.has(item.id));
  return { items: visible, setItems, toggle, remove };
}
