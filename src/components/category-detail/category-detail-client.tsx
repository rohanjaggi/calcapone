"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Plus, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { editCategory, removeCategory } from "@/app/actions";
import { CreateItemSheet } from "@/components/todos/create-item-sheet";
import { EditItemSheet } from "@/components/todos/edit-item-sheet";
import { ListActionsSheet } from "@/components/todos/list-actions-sheet";
import { TaskRow } from "@/components/todos/task-row";
import { useOptimisticItems } from "@/components/todos/use-optimistic-items";
import { useToast } from "@/components/ui/toast";
import { confirmAction, haptic } from "@/lib/telegram-webapp";
import { listColor } from "@/lib/list-colors";
import type { Item, Category } from "@/lib/types";

type Props = {
  category: Category;
  items: Item[];
  /** Today in the user's zone, from the server. */
  today: string;
  /** Every list, so the edit sheet can move a task out of this one. */
  lists: Category[];
};

export function CategoryDetailClient({ category, items: initialItems, today, lists }: Props) {
  const router = useRouter();
  const { notify } = useToast();
  const { items, toggle, remove } = useOptimisticItems(initialItems);
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showActions, setShowActions] = useState(false);

  const done = items.filter((i) => i.status === "done");
  const sorted = [...items.filter((i) => i.status !== "done"), ...done];

  const handleRename = async (id: string, name: string) => {
    try {
      await editCategory(id, { name });
      router.refresh();
    } catch {
      notify("Couldn't rename this list — please try again.");
    }
  };

  const handleDelete = async () => {
    // Say what else goes with it — deleting a list cascades to every task in it.
    const count = items.length;
    const detail = count === 0 ? "" : ` This also deletes ${count} task${count === 1 ? "" : "s"}.`;
    if (!(await confirmAction(`Delete "${category.name}"?${detail}`))) return;
    try {
      await removeCategory(category.id);
      haptic("warning");
      router.push("/todos");
    } catch {
      notify("Couldn't delete this list — please try again.");
    }
  };

  return (
    <main className="safe-bottom sky-wash">
      <header className="rise px-6 pt-4">
        {/* Telegram shows its own back button here too; this one serves everywhere else. */}
        <Link href="/todos" className="inline-flex items-center gap-1.5 min-h-11 -ml-2 px-2 text-[15px] text-muted-foreground active:text-foreground">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Tasks
        </Link>

        <div className="mt-2 flex items-center gap-3">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: listColor(category.color) }} aria-hidden="true" />
          <h1 className="font-serif text-[2.5rem] leading-[1.05] font-semibold text-foreground flex-1 min-w-0 break-words">
            {category.name}
          </h1>
          <button
            onClick={() => setShowActions(true)}
            aria-label={`${category.name} options`}
            className="shrink-0 w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-muted-foreground active:bg-foreground/10"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-2.5 font-serif italic text-[17px] text-muted-foreground">
          {items.length - done.length} open{done.length > 0 ? ` · ${done.length} done` : ""}
        </p>
      </header>

      <div className="rise-late px-4 mt-6">
        {sorted.length === 0 ? (
          <div className="px-2 py-14 text-center">
            <p className="font-serif text-2xl font-semibold text-foreground">Nothing in {category.name}</p>
            <p className="mt-2 text-[15px] text-muted-foreground">Tell the bot, or tap + to add one here.</p>
          </div>
        ) : (
          <div className="bg-card rounded-[1.5rem] overflow-hidden py-1">
            <AnimatePresence initial={false}>
              {sorted.map((item, i) => (
                <motion.div
                  key={item.id}
                  layout="position"
                  exit={{ opacity: 0, height: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
                  transition={{ layout: { type: "spring", stiffness: 420, damping: 40 } }}
                  className="overflow-hidden"
                >
                  <TaskRow
                    item={item}
                    first={i === 0}
                    showDescription
                    today={today}
                    onToggle={toggle}
                    onDelete={remove}
                    onEdit={setEditingItem}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowCreate(true)}
        aria-label={`Add a task to ${category.name}`}
        className="fixed z-40 right-5 bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-[0_14px_30px_-10px_rgba(0,0,0,0.85)] flex items-center justify-center active:scale-90 transition-transform"
      >
        <Plus className="w-6 h-6" strokeWidth={2.2} />
      </button>

      <CreateItemSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        categories={[category]}
        defaultCategoryId={category.id}
      />
      <EditItemSheet item={editingItem} categories={lists} onClose={() => setEditingItem(null)} onDelete={remove} />
      <ListActionsSheet
        category={showActions ? category : null}
        onClose={() => setShowActions(false)}
        onRename={handleRename}
        onDelete={handleDelete}
      />
    </main>
  );
}
