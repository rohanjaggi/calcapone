"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Plus, ChevronRight, ChevronDown, MoreHorizontal, GripVertical } from "lucide-react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { editCategory, removeCategory, reorderCategoriesAction } from "@/app/actions";
import { CreateItemSheet } from "@/components/todos/create-item-sheet";
import { EditItemSheet } from "@/components/todos/edit-item-sheet";
import { ListActionsSheet } from "@/components/todos/list-actions-sheet";
import { TaskRow } from "@/components/todos/task-row";
import { useOptimisticItems } from "@/components/todos/use-optimistic-items";
import { SearchDialog } from "@/components/search/search-dialog";
import { useToast } from "@/components/ui/toast";
import { confirmAction, haptic } from "@/lib/telegram-webapp";
import { listColor } from "@/lib/list-colors";
import type { Item, Category } from "@/lib/types";

type RowHandlers = {
  today: string;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
  onEdit: (item: Item) => void;
};

function ListSection({
  category,
  items,
  editMode,
  dragListeners,
  onActions,
  ...handlers
}: {
  category: Category;
  items: Item[];
  editMode: boolean;
  dragListeners?: Record<string, unknown>;
  onActions?: (category: Category) => void;
} & RowHandlers) {
  const sorted = [...items.filter((i) => i.status !== "done"), ...items.filter((i) => i.status === "done")];
  const openCount = items.length - items.filter((i) => i.status === "done").length;
  const label = (
    <>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: listColor(category.color) }} aria-hidden="true" />
      <span id={`list-${category.id}`} className="text-[17px] font-semibold text-foreground truncate">
        {category.name}
      </span>
      <span className="font-serif text-[15px] text-muted-foreground shrink-0">{openCount}</span>
    </>
  );

  return (
    <section aria-labelledby={`list-${category.id}`} className="bg-card rounded-[1.5rem] overflow-hidden">
      <div className={`flex items-center gap-1 pl-4 pr-2 pt-3 ${editMode ? "pl-1" : ""}`}>
        {editMode && dragListeners ? (
          <span
            className="shrink-0 w-11 h-11 flex items-center justify-center text-faint cursor-grab active:cursor-grabbing"
            style={{ touchAction: "none" }}
            aria-label={`Drag to reorder ${category.name}`}
            {...(dragListeners as React.HTMLAttributes<HTMLSpanElement>)}
          >
            <GripVertical className="w-4 h-4" />
          </span>
        ) : null}
        {editMode ? (
          <span className="flex items-center gap-2.5 flex-1 min-w-0 min-h-11">{label}</span>
        ) : (
          <Link href={`/todos/${category.id}`} className="flex items-center gap-2.5 flex-1 min-w-0 min-h-11 active:opacity-70">
            {label}
            <ChevronRight className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />
          </Link>
        )}
        {onActions && !editMode && (
          <button
            onClick={() => onActions(category)}
            aria-label={`${category.name} options`}
            className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground active:bg-foreground/10"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        // Only edit mode shows an empty list here, as a handle to reorder it.
        <p className="mx-4 mb-3 min-h-11 flex items-center border-t border-dashed border-border text-[15px] text-faint">No tasks</p>
      ) : (
        <div className="pb-1">
          <AnimatePresence initial={false}>
            {sorted.map((item, i) => (
              <motion.div
                key={item.id}
                layout={editMode ? false : "position"}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } }}
                transition={{ layout: { type: "spring", stiffness: 420, damping: 40 } }}
                className="overflow-hidden"
              >
                <TaskRow item={item} first={i === 0} editMode={editMode} {...handlers} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function SortableListSection(props: React.ComponentProps<typeof ListSection>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.category.id,
    data: { type: "category" },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...(props.editMode ? attributes : {})}
    >
      <ListSection {...props} dragListeners={props.editMode ? (listeners as unknown as Record<string, unknown>) : undefined} />
    </div>
  );
}

/** Lists with nothing in them, folded into one row instead of a stack of "No tasks" boxes. */
function EmptyLists({ lists }: { lists: Category[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-card rounded-[1.5rem] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full min-h-14 px-4 flex items-center justify-between text-[15px] text-muted-foreground active:text-foreground"
      >
        <span>
          {lists.length} empty {lists.length === 1 ? "list" : "lists"}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden pb-1"
          >
            {lists.map((c) => (
              <li key={c.id} className="relative before:absolute before:top-0 before:left-10 before:right-0 before:h-px before:bg-border">
                <Link href={`/todos/${c.id}`} className="flex items-center gap-3 min-h-12 px-4 active:bg-foreground/5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: listColor(c.color) }} aria-hidden="true" />
                  <span className="flex-1 text-[15px] text-foreground">{c.name}</span>
                  <ChevronRight className="w-4 h-4 text-faint" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

type Props = {
  items: Item[];
  categories: Category[];
  /** Today in the user's zone, from the server. */
  today: string;
};

export function TodosClient({ items: initialItems, categories, today }: Props) {
  const router = useRouter();
  const { notify } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localCategories, setLocalCategories] = useState(categories);
  const { items: localItems, setItems: setLocalItems, toggle: handleToggle, remove: handleDelete } =
    useOptimisticItems(initialItems);
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [actionsFor, setActionsFor] = useState<Category | null>(null);

  // Same re-sync the items get inside useOptimisticItems.
  const [syncedCategories, setSyncedCategories] = useState(categories);
  if (categories !== syncedCategories) {
    setSyncedCategories(categories);
    setLocalCategories(categories);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );


  const grouped = localCategories.map((cat) => ({
    category: cat,
    items: localItems.filter((item) => item.category.id === cat.id),
  }));
  // Edit mode shows every list, empty ones included: they are reorder handles.
  const shown = editMode ? grouped : grouped.filter((g) => g.items.length > 0);
  const emptyLists = grouped.filter((g) => g.items.length === 0).map((g) => g.category);

  const openCount = localItems.filter((i) => i.status !== "done").length;
  const handlers: RowHandlers = { today, onToggle: handleToggle, onDelete: handleDelete, onEdit: setEditingItem };

  const handleCategoryRename = async (id: string, name: string) => {
    try {
      await editCategory(id, { name });
    } catch {
      notify("Couldn't rename that list — please try again.");
    }
    router.refresh();
  };

  const handleCategoryDelete = async (id: string) => {
    // Say what else goes with it — deleting a list cascades to every task in it.
    const category = localCategories.find((c) => c.id === id);
    const count = localItems.filter((item) => item.category.id === id).length;
    const detail = count === 0 ? "" : ` This also deletes ${count} task${count === 1 ? "" : "s"}.`;
    if (!(await confirmAction(`Delete "${category?.name ?? "this list"}"?${detail}`))) return;

    const snapshot = { items: localItems, categories: localCategories };
    setLocalCategories((prev) => prev.filter((c) => c.id !== id));
    setLocalItems((prev) => prev.filter((item) => item.category.id !== id));
    haptic("warning");
    try {
      await removeCategory(id);
      router.refresh();
    } catch {
      setLocalCategories(snapshot.categories);
      setLocalItems(snapshot.items);
      notify("Couldn't delete that list — please try again.");
    }
  };

  // Only lists drag; a task changes list through the edit sheet's list picker.
  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    haptic("light");
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const before = localCategories;
    const oldIndex = before.findIndex((c) => c.id === active.id);
    const newIndex = before.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(before, oldIndex, newIndex);
    setLocalCategories(reordered);
    try {
      await reorderCategoriesAction(reordered.map((c) => c.id));
      router.refresh();
    } catch {
      setLocalCategories(before);
      notify("Couldn't reorder your lists — please try again.");
    }
  }

  const draggingCategory = localCategories.find((c) => c.id === activeId);

  return (
    <main className="safe-bottom sky-wash">
      <header className="rise px-6 pt-7">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-[2.5rem] leading-none font-semibold text-foreground">Tasks</h1>
          <div className="flex items-center -mr-2 shrink-0">
            {!editMode && <SearchDialog />}
            {localCategories.length > 0 && (
              <button
                onClick={() => setEditMode((v) => !v)}
                aria-pressed={editMode}
                className="h-11 px-3 rounded-full text-[15px] font-semibold text-foreground active:bg-foreground/10"
              >
                {editMode ? "Done" : "Edit"}
              </button>
            )}
          </div>
        </div>
        <p className="mt-2.5 font-serif italic text-[17px] text-muted-foreground">
          {openCount} open across {localCategories.length} {localCategories.length === 1 ? "list" : "lists"}
        </p>
      </header>

      <AnimatePresence initial={false}>
        {editMode && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mx-6 text-[13px] text-muted-foreground"
          >
            <span className="block pt-3">Drag a list by its handle to reorder it. To move a task to another list, tap it and pick the list.</span>
          </motion.p>
        )}
      </AnimatePresence>

      <DndContext
        id="todos-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="rise-late px-4 mt-6">
          {localCategories.length === 0 ? (
            <div className="px-2 py-14 text-center">
              <p className="font-serif text-2xl font-semibold text-foreground">No lists yet</p>
              <p className="mt-2 text-[15px] text-muted-foreground">
                Tell the bot what you need, or tap + to add your first task.
              </p>
            </div>
          ) : (
            // Each list is its own page, with room between them.
            <div className="space-y-3">
              {!editMode && shown.length === 0 && (
                <div className="px-5 pt-6 pb-5">
                  <p className="font-serif text-2xl font-semibold text-foreground">All clear</p>
                  <p className="mt-1.5 text-[15px] text-muted-foreground">Nothing open in any list.</p>
                </div>
              )}
              <SortableContext items={shown.map((g) => g.category.id)} strategy={verticalListSortingStrategy}>
                {shown.map(({ category, items: catItems }) => (
                  <SortableListSection
                    key={category.id}
                    category={category}
                    items={catItems}
                    editMode={editMode}
                    onActions={setActionsFor}
                    {...handlers}
                  />
                ))}
              </SortableContext>

              {!editMode && emptyLists.length > 0 && <EmptyLists lists={emptyLists} />}
            </div>
          )}
        </div>

        <DragOverlay>
          {draggingCategory ? (
            <div className="rounded-[1.25rem] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.9)] bg-raised/95 px-4 min-h-12 flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: listColor(draggingCategory.color) }} />
              <span className="text-[17px] font-semibold">{draggingCategory.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {!editMode && (
        <button
          onClick={() => setShowCreate(true)}
          aria-label="Add a task"
          className="fixed z-40 right-5 bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-[0_14px_30px_-10px_rgba(0,0,0,0.85)] flex items-center justify-center active:scale-90 transition-transform"
        >
          <Plus className="w-6 h-6" strokeWidth={2.2} />
        </button>
      )}

      <CreateItemSheet open={showCreate} onClose={() => setShowCreate(false)} categories={localCategories} />
      <EditItemSheet item={editingItem} categories={localCategories} onClose={() => setEditingItem(null)} onDelete={handleDelete} />
      <ListActionsSheet
        category={actionsFor}
        onClose={() => setActionsFor(null)}
        onRename={handleCategoryRename}
        onDelete={handleCategoryDelete}
      />
    </main>
  );
}
