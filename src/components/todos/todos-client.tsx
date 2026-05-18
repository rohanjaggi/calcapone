"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";
import { Bell, Plus, ChevronRight, Inbox, Trash2, Pencil, X, MoreHorizontal, GripVertical } from "lucide-react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toggleItemStatus, removeItem, editItem, editCategory, removeCategory, reorderCategoriesAction, moveItemToCategory } from "@/app/actions";
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
  editMode,
  dragListeners,
}: {
  item: Item;
  index: number;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
  editMode?: boolean;
  dragListeners?: Record<string, unknown>;
}) {
  const Icon = statusIcon[item.status];
  const isDone = item.status === "done";
  const x = useMotionValue(0);
  const trashOpacity = useTransform(x, [-80, -40, 0], [1, 0.5, 0]);
  const [swiping, setSwiping] = useState(false);

  return (
    <div
      className={`relative overflow-hidden ${
        index > 0 ? "border-t border-border/30" : ""
      } ${isDone ? "opacity-40" : ""}`}
    >
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive"
        style={{ opacity: trashOpacity, width: 72 }}
      >
        <Trash2 className="w-5 h-5 text-white" />
      </motion.div>

      <motion.div
        className="relative z-10 bg-card flex items-center gap-3 px-4 py-3"
        drag="x"
        dragConstraints={{ left: -200, right: 0 }}
        dragElastic={0.1}
        style={{ x }}
        onDragStart={() => setSwiping(true)}
        onDragEnd={(_, info) => {
          setSwiping(false);
          const threshold = -120;
          if (info.offset.x < threshold) {
            onDelete(item.id);
          }
        }}
      >
        <button
          onClick={() => !swiping && onToggle(item.id, item.status)}
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

        {editMode && (
          <div
            className="shrink-0 p-1 -m-1 cursor-grab active:cursor-grabbing"
            style={{ touchAction: "none" }}
            {...(dragListeners as React.HTMLAttributes<HTMLDivElement>)}
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40" />
          </div>
        )}

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
          {!isDone && !editMode && (
            <button
              onClick={() => onEdit(item)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {isDone && !editMode && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              onClick={() => onDelete(item.id)}
              className="shrink-0 text-muted-foreground/40 hover:text-destructive active:scale-90 transition-all duration-150"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function SortableItemRow({
  item,
  index,
  editMode,
  onToggle,
  onDelete,
  onEdit,
}: {
  item: Item;
  index: number;
  editMode: boolean;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { type: "item", categoryId: item.category.id } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ItemRow
        item={item}
        index={index}
        onToggle={onToggle}
        onDelete={onDelete}
        onEdit={onEdit}
        editMode={editMode}
        dragListeners={editMode ? (listeners as unknown as Record<string, unknown>) : undefined}
      />
    </div>
  );
}

function CategoryCard({
  category,
  items,
  cardIndex,
  editMode,
  onToggle,
  onDelete,
  onEdit,
  onCategoryRename,
  onCategoryDelete,
  dragListeners,
}: {
  category: Category;
  items: Item[];
  cardIndex: number;
  editMode: boolean;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
  onCategoryRename: (id: string, name: string) => void;
  onCategoryDelete: (id: string) => void;
  dragListeners?: Record<string, unknown>;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(category.name);
  const [saving, setSaving] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

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
      className={`bg-card border rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden ${
        editMode ? "border-primary/25" : "border-border/50"
      }`}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30">
        {editMode ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className="shrink-0 p-1 -m-1 cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
              {...(dragListeners as React.HTMLAttributes<HTMLDivElement>)}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/40" />
            </div>
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: category.color }}
            />
            <span className="text-sm font-medium text-foreground flex-1 truncate">{category.name}</span>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {count === 1 ? "1 task" : `${count} tasks`}
            </span>
          </div>
        ) : (
          <>
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
              <div className="shrink-0">
                <button
                  ref={menuBtnRef}
                  onClick={() => {
                    if (!showMenu && menuBtnRef.current) {
                      const rect = menuBtnRef.current.getBoundingClientRect();
                      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                    }
                    setShowMenu((v) => !v);
                  }}
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
                      className="fixed w-40 bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden z-50"
                      style={{ top: menuPos.top, right: menuPos.right }}
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
          </>
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
          <SortableContext items={sorted.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <AnimatePresence>
              {sorted.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <SortableItemRow
                    item={item}
                    index={i}
                    editMode={editMode}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onEdit={onEdit}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </SortableContext>
        </div>
      )}
    </motion.div>
  );
}

function SortableCategoryCard({
  category,
  items,
  cardIndex,
  editMode,
  onToggle,
  onDelete,
  onEdit,
  onCategoryRename,
  onCategoryDelete,
}: {
  category: Category;
  items: Item[];
  cardIndex: number;
  editMode: boolean;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
  onCategoryRename: (id: string, name: string) => void;
  onCategoryDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, data: { type: "category" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <CategoryCard
        category={category}
        items={items}
        cardIndex={cardIndex}
        editMode={editMode}
        onToggle={onToggle}
        onDelete={onDelete}
        onEdit={onEdit}
        onCategoryRename={onCategoryRename}
        onCategoryDelete={onCategoryDelete}
        dragListeners={editMode ? (listeners as unknown as Record<string, unknown>) : undefined}
      />
    </div>
  );
}

type Props = {
  items: Item[];
  categories: Category[];
};

export function TodosClient({ items: initialItems, categories }: Props) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"category" | "item" | null>(null);
  const [localCategories, setLocalCategories] = useState(categories);
  const [localItems, setLocalItems] = useState(initialItems);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { setLocalCategories(categories); }, [categories]);
  useEffect(() => { setLocalItems(initialItems); }, [initialItems]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("medium");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (activeType === "category") {
      const categoryIds = new Set(localCategories.map((c) => c.id));
      const filtered = {
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => categoryIds.has(container.id as string)
        ),
      };
      return closestCorners(filtered);
    }
    return pointerWithin(args).length > 0 ? pointerWithin(args) : closestCorners(args);
  }, [activeType, localCategories]);

  const grouped = localCategories.map((cat) => ({
    category: cat,
    items: localItems.filter((item) => item.category.id === cat.id),
  }));

  const listedCatIds = new Set(localCategories.map((c) => c.id));
  const orphaned = localItems.filter((item) => !listedCatIds.has(item.category.id));

  const handleToggle = async (id: string, current: Item["status"]) => {
    const newStatus = current === "done" ? "pending" : "done";
    setLocalItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus as Item["status"] } : item))
    );
    await toggleItemStatus(id, newStatus as "pending" | "done");
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    setLocalItems((prev) => prev.filter((item) => item.id !== id));
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

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    setActiveType(event.active.data.current?.type ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type !== "item") return;

    const activeCatId = activeData.categoryId as string;
    const overCatId = overData?.type === "category"
      ? (over.id as string)
      : (overData?.categoryId as string);

    if (activeCatId && overCatId && activeCatId !== overCatId) {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === active.id
            ? { ...item, category: { ...item.category, id: overCatId } }
            : item
        )
      );
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);

    if (!over || active.id === over.id) return;

    if (active.data.current?.type === "category") {
      const oldIndex = localCategories.findIndex((c) => c.id === active.id);
      let newIndex = localCategories.findIndex((c) => c.id === over.id);
      if (newIndex === -1 && over.data.current?.categoryId) {
        newIndex = localCategories.findIndex((c) => c.id === over.data.current?.categoryId);
      }
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const prev = localCategories;
        const reordered = arrayMove(localCategories, oldIndex, newIndex);
        setLocalCategories(reordered);
        try {
          await reorderCategoriesAction(reordered.map((c) => c.id));
          router.refresh();
        } catch {
          setLocalCategories(prev);
        }
      }
    } else if (active.data.current?.type === "item") {
      const movedItem = localItems.find((i) => i.id === active.id);
      const originalCatId = initialItems.find((i) => i.id === active.id)?.category.id;
      if (movedItem && originalCatId && movedItem.category.id !== originalCatId) {
        const prev = localItems;
        try {
          await moveItemToCategory(movedItem.id, movedItem.category.id);
          router.refresh();
        } catch {
          setLocalItems(prev);
        }
      }
    }
  }

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
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-[2rem] leading-tight font-light text-foreground tracking-tight">
            Tasks
          </h1>
          {localCategories.length > 0 && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`text-sm font-medium transition-colors ${
                editMode ? "text-destructive" : "text-primary"
              }`}
            >
              {editMode ? "Done" : "Edit"}
            </button>
          )}
        </div>
      </motion.header>

      {/* Edit mode hint banner */}
      <AnimatePresence>
        {editMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 overflow-hidden"
          >
            <div className="px-3 py-2 bg-primary/10 rounded-lg text-center">
              <p className="text-[11px] text-primary">
                Drag categories to reorder · Drag tasks between categories · Swipe left to delete
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category cards */}
      <DndContext
        id="todos-dnd"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="px-5 mt-4 space-y-4">
          {localCategories.length === 0 ? (
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
            <SortableContext items={localCategories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {grouped.map(({ category, items: catItems }, i) => (
                <SortableCategoryCard
                  key={category.id}
                  category={category}
                  items={catItems}
                  cardIndex={i}
                  editMode={editMode}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onEdit={openEdit}
                  onCategoryRename={handleCategoryRename}
                  onCategoryDelete={handleCategoryDelete}
                />
              ))}
            </SortableContext>
          )}

          {/* Orphaned items (no matching category) */}
          {orphaned.length > 0 && (
            <CategoryCard
              category={{ id: "__none__", name: "Uncategorized", color: "#A8A29E" }}
              items={orphaned}
              cardIndex={grouped.length}
              editMode={editMode}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={openEdit}
              onCategoryRename={handleCategoryRename}
              onCategoryDelete={handleCategoryDelete}
            />
          )}
        </div>

        <DragOverlay>
          {activeId && activeType === "category" ? (
            (() => {
              const cat = localCategories.find((c) => c.id === activeId);
              if (!cat) return null;
              const catItems = localItems.filter((i) => i.category.id === cat.id);
              return (
                <div className="opacity-80 shadow-2xl rounded-xl">
                  <CategoryCard
                    category={cat}
                    items={catItems}
                    cardIndex={0}
                    editMode={editMode}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEdit={openEdit}
                    onCategoryRename={handleCategoryRename}
                    onCategoryDelete={handleCategoryDelete}
                  />
                </div>
              );
            })()
          ) : activeId && activeType === "item" ? (
            (() => {
              const item = localItems.find((i) => i.id === activeId);
              if (!item) return null;
              return (
                <div className="opacity-80 shadow-2xl rounded-lg">
                  <ItemRow
                    item={item}
                    index={0}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEdit={openEdit}
                    editMode={editMode}
                  />
                </div>
              );
            })()
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* FAB */}
      {!editMode && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
          onClick={() => setShowCreate(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] right-5 w-13 h-13 rounded-full bg-primary text-primary-foreground shadow-[0_4px_16px_rgba(146,120,92,0.35)] flex items-center justify-center active:scale-90 transition-transform z-40"
        >
          <Plus className="w-5 h-5" />
        </motion.button>
      )}

      <CreateItemSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        categories={localCategories}
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

                  {localCategories.length > 1 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-2">Category</label>
                      <div className="flex flex-wrap gap-2">
                        {localCategories.map((cat) => (
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
