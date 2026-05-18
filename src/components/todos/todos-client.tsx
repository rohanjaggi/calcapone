"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Plus, ChevronRight, Inbox, Trash2, Pencil, X, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { toggleItemStatus, removeItem, editItem, editCategory, removeCategory } from "@/app/actions";
import { statusIcon, formatTime, priorityColors, priorityLabels } from "@/lib/task-constants";
import { CreateItemSheet } from "@/components/todos/create-item-sheet";
import type { Item, Category } from "@/lib/mock-data";
import type { Priority } from "@/generated/prisma/enums";

function ItemRow({
  item,
  index,
  onToggle,
  onDelete,
  onEdit,
}: {
  item: Item;
  index: number;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
}) {
  const Icon = statusIcon[item.status];
  const isDone = item.status === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
      className={`flex items-center gap-3 px-4 py-3 ${
        index > 0 ? "border-t border-border/30" : ""
      } ${isDone ? "opacity-40" : ""}`}
    >
      <button
        onClick={() => onToggle(item.id, item.status)}
        className="shrink-0 active:scale-90 transition-transform duration-150"
      >
        <Icon
          className={`w-[18px] h-[18px] ${
            isDone
              ? "text-sage"
              : item.status === "in_progress"
              ? "text-primary animate-spin [animation-duration:3s]"
              : "text-muted-foreground/40"
          }`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug truncate ${
            isDone ? "line-through text-muted-foreground" : "text-foreground"
          }`}
        >
          {item.remindAt && !isDone && (
            <span className="inline-flex items-center gap-0.5 mr-1.5 text-muted-foreground/70">
              <Bell className="w-3 h-3" />
              {item.dueTime && (
                <span className="text-[11px]">{formatTime(item.dueTime)}</span>
              )}
            </span>
          )}
          {item.title}
        </p>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {!isDone && (
          <button
            onClick={() => onEdit(item)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {isDone && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            onClick={() => onDelete(item.id)}
            className="text-muted-foreground/40 hover:text-destructive active:scale-90 transition-all duration-150"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

function CategoryCard({
  category,
  items,
  cardIndex,
  onToggle,
  onDelete,
  onEdit,
  onCategoryRename,
  onCategoryDelete,
}: {
  category: Category;
  items: Item[];
  cardIndex: number;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
  onCategoryRename: (id: string, name: string) => void;
  onCategoryDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(category.name);
  const [saving, setSaving] = useState(false);

  const activeItems = items.filter((i) => i.status !== "done");
  const doneItems = items.filter((i) => i.status === "done");
  const sorted = [...activeItems, ...doneItems];
  const count = items.length;
  const isOrphan = category.id === "__none__";

  const handleRename = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    onCategoryRename(category.id, newName.trim());
    setSaving(false);
    setRenaming(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: cardIndex * 0.08 + 0.1 }}
      className="bg-card border border-border/50 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden"
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
        <Link
          href={`/todos/${category.id}`}
          className="flex items-center gap-2 flex-1 min-w-0 group"
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: category.color }}
          />
          <span className="text-sm font-medium text-foreground flex-1 truncate">{category.name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {count === 1 ? "1 task" : `${count} tasks`}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform duration-150 shrink-0" />
        </Link>
        {!isOrphan && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-all"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-9 w-40 bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden z-50"
                >
                  <button
                    onClick={() => { setRenaming(true); setShowMenu(false); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-2"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Rename
                  </button>
                  <button
                    onClick={() => { if (confirm("Delete this category and all its tasks?")) onCategoryDelete(category.id); setShowMenu(false); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Inline rename */}
      <AnimatePresence>
        {renaming && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border/30"
          >
            <div className="flex gap-2 px-4 py-2.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                className="flex-1 h-8 px-3 rounded-lg border border-border/60 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
              <button
                onClick={handleRename}
                disabled={!newName.trim() || saving}
                className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {saving ? "..." : "Save"}
              </button>
              <button
                onClick={() => { setRenaming(false); setNewName(category.name); }}
                className="h-8 px-3 rounded-lg text-muted-foreground text-xs hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {sorted.length === 0 ? (
        <div className="px-4 py-4 text-[13px] text-muted-foreground/50 italic">
          No tasks
        </div>
      ) : (
        <div>
          {sorted.map((item, i) => (
            <ItemRow key={item.id} item={item} index={i} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

type Props = {
  items: Item[];
  categories: Category[];
};

export function TodosClient({ items: initialItems, categories }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("medium");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const grouped = categories.map((cat) => ({
    category: cat,
    items: items.filter((item) => item.category.id === cat.id),
  }));

  const listedCatIds = new Set(categories.map((c) => c.id));
  const orphaned = items.filter((item) => !listedCatIds.has(item.category.id));

  const handleToggle = async (id: string, current: Item["status"]) => {
    const newStatus = current === "done" ? "pending" : "done";
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus as Item["status"] } : item))
    );
    await toggleItemStatus(id, newStatus as "pending" | "done");
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await removeItem(id);
    router.refresh();
  };

  const openEdit = (item: Item) => {
    setEditTitle(item.title);
    setEditDescription(item.description ?? "");
    setEditDueDate(item.dueDate ?? "");
    setEditDueTime(item.dueTime ?? "");
    setEditPriority(item.priority as Priority);
    setEditCategoryId(item.category.id);
    setEditingItem(item);
  };

  const handleEditSave = async () => {
    if (!editingItem || !editTitle.trim()) return;
    setEditSaving(true);
    await editItem(editingItem.id, {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      dueDate: editDueDate || null,
      dueTime: editDueTime || null,
      priority: editPriority,
      categoryId: editCategoryId !== editingItem.category.id ? editCategoryId : undefined,
    });
    setEditSaving(false);
    setEditingItem(null);
    router.refresh();
  };

  const handleCategoryRename = async (id: string, name: string) => {
    await editCategory(id, { name });
    router.refresh();
  };

  const handleCategoryDelete = async (id: string) => {
    await removeCategory(id);
    router.refresh();
  };

  return (
    <main className="safe-bottom pb-8">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="px-5 pt-6 pb-2"
      >
        <p className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase mb-0.5">
          Manage
        </p>
        <h1 className="font-serif text-[2rem] leading-tight font-light text-foreground tracking-tight">
          Tasks
        </h1>
      </motion.header>

      {/* Category cards */}
      <div className="px-5 mt-4 space-y-4">
        {categories.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="flex flex-col items-center py-16 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-secondary/80 flex items-center justify-center mb-4">
              <Inbox className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-serif text-lg text-foreground">No categories yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tap + to create your first task and category
            </p>
          </motion.div>
        ) : (
          grouped.map(({ category, items: catItems }, i) => (
            <CategoryCard
              key={category.id}
              category={category}
              items={catItems}
              cardIndex={i}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={openEdit}
              onCategoryRename={handleCategoryRename}
              onCategoryDelete={handleCategoryDelete}
            />
          ))
        )}

        {/* Orphaned items (no matching category) */}
        {orphaned.length > 0 && (
          <CategoryCard
            category={{ id: "__none__", name: "Uncategorized", color: "#A8A29E" }}
            items={orphaned}
            cardIndex={grouped.length}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onEdit={openEdit}
            onCategoryRename={handleCategoryRename}
            onCategoryDelete={handleCategoryDelete}
          />
        )}
      </div>

      {/* FAB */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
        onClick={() => setShowCreate(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] right-5 w-13 h-13 rounded-full bg-primary text-primary-foreground shadow-[0_4px_16px_rgba(146,120,92,0.35)] flex items-center justify-center active:scale-90 transition-transform z-40"
      >
        <Plus className="w-5 h-5" />
      </motion.button>

      <CreateItemSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        categories={categories}
      />

      {/* Edit item sheet */}
      <AnimatePresence>
        {editingItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[55]"
              onClick={() => setEditingItem(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-2xl border-t border-border/50 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] max-h-[90dvh] flex flex-col"
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 shrink-0" />
              <div className="overflow-y-auto px-5 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-serif text-xl font-normal text-foreground">Edit Task</h3>
                  <button onClick={() => setEditingItem(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Task title"
                    autoFocus
                    className="w-full h-12 px-4 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />

                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none"
                  />

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">Priority</label>
                    <div className="flex gap-2">
                      {(["low", "medium", "high"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setEditPriority(p)}
                          className={`flex-1 h-9 rounded-lg text-xs font-medium border transition-all duration-150 flex items-center justify-center gap-1.5 ${
                            editPriority === p
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border/50 text-muted-foreground"
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: priorityColors[p] }} />
                          {priorityLabels[p]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {categories.length > 1 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-2">Category</label>
                      <div className="flex flex-wrap gap-2">
                        {categories.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setEditCategoryId(cat.id)}
                            className={`h-8 px-3 rounded-lg text-xs font-medium border transition-all duration-150 flex items-center gap-1.5 ${
                              editCategoryId === cat.id
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-border/50 text-muted-foreground"
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">Due date</label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                  </div>

                  {editDueDate && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-2">Due time</label>
                      <input
                        type="time"
                        value={editDueTime}
                        onChange={(e) => setEditDueTime(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      />
                    </div>
                  )}

                  <button
                    onClick={handleEditSave}
                    disabled={!editTitle.trim() || editSaving}
                    className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {editSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
