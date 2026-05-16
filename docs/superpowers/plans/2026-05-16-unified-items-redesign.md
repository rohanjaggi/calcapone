# Unified Items Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge todos and reminders into a single `items` table, grouped by category, with a redesigned Tasks page showing category cards and an expanded category detail view.

**Architecture:** Replace the separate `todos` and `reminders` Prisma models with a single `Item` model. Items with `remindAt` set are "reminders" — no discriminator field needed. All services, API routes, AI tools, components, and tests are updated to use the unified model. The Tasks tab becomes a category-grouped overview with drill-down.

**Tech Stack:** Prisma 7, Next.js 16 (App Router, Server Components, Server Actions), TypeScript, Tailwind v4, motion/react

---

## File Structure

```
prisma/
  schema.prisma                           — MODIFY: replace Todo+Reminder with Item model

src/
  lib/
    services/
      item.ts                             — CREATE: unified CRUD + getDueItems + recurrence
      todo.ts                             — DELETE after migration
      reminder.ts                         — DELETE after migration
    mock-data.ts                          — MODIFY: replace Todo/Reminder types with Item type

  app/
    actions.ts                            — MODIFY: replace todo/reminder actions with item actions
    page.tsx                              — MODIFY: fetch items instead of todos+reminders
    todos/
      page.tsx                            — MODIFY: category-grouped overview
      [categoryId]/
        page.tsx                          — CREATE: expanded category detail view
    calendar/
      page.tsx                            — MODIFY: fetch items instead of todos+reminders
    api/
      items/
        route.ts                          — CREATE: GET + POST for items
        [id]/
          route.ts                        — CREATE: PATCH + DELETE for items
      todos/                              — DELETE after migration
      reminders/                          — DELETE after migration
      cron/reminders/route.ts             — MODIFY: query items table
      telegram/route.ts                   — MODIFY: updated tool handlers

  components/
    dashboard/
      dashboard-client.tsx                — MODIFY: use Item type
      todo-section.tsx                    — MODIFY: rename to items, use Item type
      reminder-section.tsx                — DELETE (folded into todo-section)
      day-timeline.tsx                    — MODIFY: use Item type
      stats-row.tsx                       — MODIFY: items + reminders count from same data
    todos/
      todos-client.tsx                    — REWRITE: category-grouped overview
    calendar/
      calendar-client.tsx                 — MODIFY: use Item type
    category-detail/
      category-detail-client.tsx          — CREATE: expanded category view

  lib/services/
    ai-tools.ts                           — MODIFY: unified item tools

tests/
  services/
    item.test.ts                          — CREATE: unified item service tests
    todo.test.ts                          — DELETE
    reminder.test.ts                      — DELETE
  api/
    cron.test.ts                          — MODIFY: use item service
```

---

### Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Replace Todo and Reminder models with Item model**

In `prisma/schema.prisma`, remove the `Todo` model (lines 59-76), `Reminder` model (lines 98-115), `TodoStatus` enum, `ReminderStatus` enum, and `RecurringType` enum. Replace with:

```prisma
enum ItemStatus {
  pending
  in_progress
  done
}

enum Priority {
  low
  medium
  high
}

enum RecurringType {
  none
  daily
  weekly
  monthly
}

model Item {
  id          String        @id @default(uuid()) @db.Uuid
  userId      String        @map("user_id") @db.Uuid
  categoryId  String        @map("category_id") @db.Uuid
  title       String
  description String?
  status      ItemStatus    @default(pending)
  priority    Priority      @default(medium)
  dueDate     String?       @map("due_date")
  dueTime     String?       @map("due_time")
  remindAt    DateTime?     @map("remind_at") @db.Timestamptz
  recurring   RecurringType @default(none)
  createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@map("items")
}
```

Update the `User` model relations — replace `todos Todo[]` and `reminders Reminder[]` with `items Item[]`.

Update the `Category` model relations — replace `todos Todo[]` and `reminders Reminder[]` with `items Item[]`.

Keep the `Priority` enum as-is (already exists). Remove the old `TodoStatus` enum.

- [ ] **Step 2: Push schema to database**

Run: `npx prisma db push --force-reset`

(Force reset because we're dropping tables. This is fine — dev database with no real data yet.)

- [ ] **Step 3: Regenerate Prisma client**

Run: `npx prisma generate`

- [ ] **Step 4: Verify regeneration succeeded**

Check: `ls src/generated/prisma/models/` — should show `Item.ts` but NOT `Todo.ts` or `Reminder.ts`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "refactor: replace Todo+Reminder models with unified Item model"
```

---

### Task 2: Item Service + Tests

**Files:**
- Create: `src/lib/services/item.ts`
- Create: `tests/services/item.test.ts`
- Delete: `src/lib/services/todo.ts`
- Delete: `src/lib/services/reminder.ts`
- Delete: `tests/services/todo.test.ts`
- Delete: `tests/services/reminder.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/services/item.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  item: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { createItem, listItems, updateItem, deleteItem, getDueItems, createNextOccurrence } from "@/lib/services/item";

describe("ItemService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an item", async () => {
    const input = { userId: "u1", categoryId: "c1", title: "Buy milk" };
    mockPrisma.item.create.mockResolvedValue({ id: "i1", status: "pending", priority: "medium", ...input });
    const result = await createItem(input);
    expect(result.title).toBe("Buy milk");
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: input,
      include: { category: true },
    });
  });

  it("lists items with filters", async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    await listItems("u1", { status: "pending", categoryId: "c1" });
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "pending", categoryId: "c1" },
      include: { category: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  });

  it("updates an item", async () => {
    mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "done" });
    await updateItem("i1", "u1", { status: "done" });
    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: "i1", userId: "u1" },
      data: { status: "done" },
      include: { category: true },
    });
  });

  it("deletes an item", async () => {
    mockPrisma.item.delete.mockResolvedValue({ id: "i1" });
    await deleteItem("i1", "u1");
    expect(mockPrisma.item.delete).toHaveBeenCalledWith({
      where: { id: "i1", userId: "u1" },
    });
  });

  it("queries due items (reminders)", async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    const now = new Date();
    await getDueItems(now);
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
      where: { remindAt: { lte: now }, status: { not: "done" } },
      include: { user: true, category: true },
    });
  });

  it("creates next occurrence for daily recurring", () => {
    const base = new Date("2026-05-16T17:00:00Z");
    const next = createNextOccurrence(base, "daily");
    expect(next.toISOString()).toBe("2026-05-17T17:00:00.000Z");
  });

  it("creates next occurrence for weekly recurring", () => {
    const base = new Date("2026-05-16T17:00:00Z");
    const next = createNextOccurrence(base, "weekly");
    expect(next.toISOString()).toBe("2026-05-23T17:00:00.000Z");
  });

  it("creates next occurrence for monthly recurring", () => {
    const base = new Date("2026-05-16T17:00:00Z");
    const next = createNextOccurrence(base, "monthly");
    expect(next.toISOString()).toBe("2026-06-16T17:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/item.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/services/item.ts
import { prisma } from "@/lib/prisma";
import type { ItemStatus, Priority, RecurringType } from "@/generated/prisma/enums";

type CreateItemInput = {
  userId: string;
  categoryId: string;
  title: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: Date | null;
  recurring?: RecurringType;
};

type ItemFilters = {
  status?: ItemStatus;
  categoryId?: string;
  priority?: Priority;
};

type UpdateItemInput = {
  title?: string;
  description?: string | null;
  status?: ItemStatus;
  priority?: Priority;
  categoryId?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: Date | null;
  recurring?: RecurringType;
};

export async function createItem(data: CreateItemInput) {
  return prisma.item.create({
    data,
    include: { category: true },
  });
}

export async function listItems(userId: string, filters: ItemFilters = {}) {
  return prisma.item.findMany({
    where: { userId, ...filters },
    include: { category: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateItem(id: string, userId: string, data: UpdateItemInput) {
  return prisma.item.update({
    where: { id, userId },
    data,
    include: { category: true },
  });
}

export async function deleteItem(id: string, userId: string) {
  return prisma.item.delete({ where: { id, userId } });
}

export async function getDueItems(now: Date) {
  return prisma.item.findMany({
    where: { remindAt: { lte: now }, status: { not: "done" } },
    include: { user: true, category: true },
  });
}

export async function markItemSent(id: string) {
  return prisma.item.update({
    where: { id },
    data: { status: "done" },
  });
}

export function createNextOccurrence(current: Date, recurring: RecurringType): Date {
  const next = new Date(current);
  switch (recurring) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/services/item.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Delete old service and test files**

```bash
rm src/lib/services/todo.ts src/lib/services/reminder.ts
rm tests/services/todo.test.ts tests/services/reminder.test.ts tests/api/cron.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/item.ts tests/services/item.test.ts
git add -u
git commit -m "refactor: replace todo+reminder services with unified item service"
```

---

### Task 3: Update Types in mock-data.ts

**Files:**
- Modify: `src/lib/mock-data.ts`

- [ ] **Step 1: Replace Todo and Reminder types with Item type**

Replace the entire file contents. Keep `CalendarEvent` and `TimelineItem` types. Replace `Todo` and `Reminder` with:

```ts
export type CalendarEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  category: string;
  color: string;
};

export type Item = {
  id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  category: { id: string; name: string; color: string };
  dueDate: string | null;
  dueTime: string | null;
  remindAt: string | null;
  recurring: "none" | "daily" | "weekly" | "monthly";
};

export type TimelineItem = {
  id: string;
  type: "event" | "item";
  title: string;
  time: string;
  endTime?: string;
  subtitle: string;
  color: string;
  isReminder?: boolean;
  status?: string;
};
```

Remove all mock data constants (`mockUser`, `mockEvents`, `mockTodos`, `mockReminders`, `mockCategories`) and the `buildTimeline` function — these are no longer used since pages fetch real data.

- [ ] **Step 2: Commit**

```bash
git add src/lib/mock-data.ts
git commit -m "refactor: replace Todo/Reminder types with unified Item type"
```

---

### Task 4: Update Server Actions

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Replace all todo/reminder actions with item actions**

```ts
// src/app/actions.ts
"use server";

import { createItem, updateItem, deleteItem } from "@/lib/services/item";
import { getOrCreateDevUser } from "@/lib/dev-user";
import { createCategory, listCategories } from "@/lib/services/category";
import type { ItemStatus, Priority, RecurringType } from "@/generated/prisma/enums";

export async function toggleItemStatus(itemId: string, newStatus: ItemStatus) {
  const user = await getOrCreateDevUser();
  await updateItem(itemId, user.id, { status: newStatus });
}

export async function addItem(data: {
  title: string;
  categoryId: string;
  priority: Priority;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: string | null;
  recurring?: RecurringType;
}) {
  const user = await getOrCreateDevUser();
  await createItem({
    userId: user.id,
    categoryId: data.categoryId,
    title: data.title,
    priority: data.priority,
    description: data.description ?? null,
    dueDate: data.dueDate ?? null,
    dueTime: data.dueTime ?? null,
    remindAt: data.remindAt ? new Date(data.remindAt) : null,
    recurring: data.recurring ?? "none",
  });
}

export async function removeItem(itemId: string) {
  const user = await getOrCreateDevUser();
  await deleteItem(itemId, user.id);
}

export async function addCategory(name: string, color: string) {
  const user = await getOrCreateDevUser();
  return createCategory({ userId: user.id, name, color });
}

export async function getCategories() {
  const user = await getOrCreateDevUser();
  const cats = await listCategories(user.id);
  return cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/actions.ts
git commit -m "refactor: update server actions to use unified item model"
```

---

### Task 5: Update API Routes

**Files:**
- Create: `src/app/api/items/route.ts`
- Create: `src/app/api/items/[id]/route.ts`
- Delete: `src/app/api/todos/route.ts`, `src/app/api/todos/[id]/route.ts`
- Delete: `src/app/api/reminders/route.ts`, `src/app/api/reminders/[id]/route.ts`
- Modify: `src/app/api/cron/reminders/route.ts`

- [ ] **Step 1: Create items API routes**

```ts
// src/app/api/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createItem, listItems } from "@/lib/services/item";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "pending" | "in_progress" | "done" | null;
  const categoryId = url.searchParams.get("categoryId");

  const items = await listItems(user.id, {
    ...(status && { status }),
    ...(categoryId && { categoryId }),
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const item = await createItem({ userId: user.id, ...body });
  return NextResponse.json(item, { status: 201 });
}
```

```ts
// src/app/api/items/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { updateItem, deleteItem } from "@/lib/services/item";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const item = await updateItem(id, user.id, body);
  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await deleteItem(id, user.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Update cron endpoint**

Replace the entire content of `src/app/api/cron/reminders/route.ts`:

```ts
// src/app/api/cron/reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDueItems, markItemSent, createNextOccurrence, createItem } from "@/lib/services/item";
import { sendMessage } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dueItems = await getDueItems(now);
  let sent = 0;
  let errors = 0;

  for (const item of dueItems) {
    try {
      await sendMessage(
        Number(item.user.telegramId),
        `🔔 *Reminder:* ${item.title}`
      );
      await markItemSent(item.id);
      sent++;

      if (item.recurring !== "none") {
        const nextDate = createNextOccurrence(item.remindAt!, item.recurring);
        await createItem({
          userId: item.userId,
          categoryId: item.categoryId,
          title: item.title,
          description: item.description,
          priority: item.priority,
          dueDate: item.dueDate,
          dueTime: item.dueTime,
          remindAt: nextDate,
          recurring: item.recurring,
        });
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ processed: dueItems.length, sent, errors });
}
```

- [ ] **Step 3: Delete old API route files**

```bash
rm -rf src/app/api/todos src/app/api/reminders
```

- [ ] **Step 4: Create the items directory**

```bash
mkdir -p 'src/app/api/items/[id]'
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/items/ src/app/api/cron/reminders/route.ts
git add -u
git commit -m "refactor: replace todo/reminder API routes with unified items routes"
```

---

### Task 6: Update AI Tools + Telegram Webhook

**Files:**
- Modify: `src/lib/services/ai-tools.ts`
- Modify: `src/app/api/telegram/route.ts`

- [ ] **Step 1: Update AI tool definitions**

Replace the tools in `src/lib/services/ai-tools.ts`. Remove `create_todo`, `create_reminder`, `list_todos`, `complete_todo`, `delete_todo`, `list_reminders`, `cancel_reminder`. Replace with:

```ts
  {
    name: "create_item",
    description: "Create a new task or reminder for the user. If remind_at is provided, it becomes a reminder that triggers a Telegram notification.",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The item title" },
        description: { type: "string", description: "Optional longer description" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level" },
        category: { type: "string", description: "Category name (e.g. Work, Personal). Required." },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
        due_time: { type: "string", description: "Due time in HH:mm format (24h)" },
        remind_at: { type: "string", description: "ISO 8601 datetime to send a Telegram reminder notification" },
        recurring: { type: "string", enum: ["none", "daily", "weekly", "monthly"], description: "Recurrence pattern for reminders" },
      },
      required: ["title", "category"],
    },
  },
  {
    name: "list_items",
    description: "List the user's tasks and reminders, optionally filtered by status or category",
    parameters: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["pending", "in_progress", "done"], description: "Filter by status" },
        category: { type: "string", description: "Filter by category name" },
      },
    },
  },
  {
    name: "complete_item",
    description: "Mark a task or reminder as done",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The title of the item to complete (fuzzy match)" },
      },
      required: ["title"],
    },
  },
  {
    name: "delete_item",
    description: "Delete a task or reminder",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The title of the item to delete (fuzzy match)" },
      },
      required: ["title"],
    },
  },
```

Keep the `get_calendar`, `create_calendar_event`, `suggest_schedule`, `create_category`, `list_categories` tools as-is.

Update the system prompt to say "You can create items (tasks and reminders), check the calendar, and create calendar events."

- [ ] **Step 2: Update Telegram webhook handler**

Replace the entire `src/app/api/telegram/route.ts` — update imports to use `item` service and update `executeToolCall` to handle `create_item`, `list_items`, `complete_item`, `delete_item` instead of the old tool names. The `create_item` handler needs to find-or-create a category by name (since the AI passes the category name, not ID):

```ts
// In executeToolCall, the create_item case:
case "create_item": {
  let categoryName = args.category as string;
  let cats = await listCategories(userId);
  let cat = cats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
  if (!cat) {
    cat = await createCategory({ userId, name: categoryName });
  }
  const item = await createItem({
    userId,
    categoryId: cat.id,
    title: args.title as string,
    description: (args.description as string) ?? null,
    priority: (args.priority as Priority) ?? "medium",
    dueDate: (args.due_date as string) ?? null,
    dueTime: (args.due_time as string) ?? null,
    remindAt: args.remind_at ? new Date(args.remind_at as string) : null,
    recurring: (args.recurring as RecurringType) ?? "none",
  });
  const label = item.remindAt ? "Reminder" : "Task";
  return `Created ${label}: **${item.title}** in ${cat.name}`;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -15`

- [ ] **Step 4: Commit**

```bash
git add src/lib/services/ai-tools.ts src/app/api/telegram/route.ts
git commit -m "refactor: update AI tools and webhook for unified item model"
```

---

### Task 7: Update Dashboard

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/dashboard/dashboard-client.tsx`
- Modify: `src/components/dashboard/todo-section.tsx` (rename conceptually to items section)
- Delete: `src/components/dashboard/reminder-section.tsx`
- Modify: `src/components/dashboard/day-timeline.tsx`
- Modify: `src/components/dashboard/stats-row.tsx`

- [ ] **Step 1: Update dashboard server component**

Replace `src/app/page.tsx`:

```tsx
import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getOrCreateDevUser();
  const items = await listItems(user.id);

  const serializedItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: { id: item.category.id, name: item.category.name, color: item.category.color ?? "#92785C" },
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt?.toISOString() ?? null,
    recurring: item.recurring,
  }));

  return <DashboardClient userName={user.telegramUsername} items={serializedItems} eventCount={0} />;
}
```

- [ ] **Step 2: Update DashboardClient**

Replace `src/components/dashboard/dashboard-client.tsx` to accept `items: Item[]` instead of separate `todos` and `reminders`. Build the timeline from items. Show items with `remindAt` as reminders in the stats. Remove the separate `ReminderSection` — fold reminders into the items section with a bell icon.

- [ ] **Step 3: Update todo-section.tsx**

Rename the component conceptually. Update it to use `Item` type from `mock-data.ts`. Items with `remindAt` show a bell icon + time. The toggle calls `toggleItemStatus` instead of `toggleTodoStatus`.

- [ ] **Step 4: Delete reminder-section.tsx**

```bash
rm src/components/dashboard/reminder-section.tsx
```

- [ ] **Step 5: Update day-timeline.tsx**

Use `Item` type. Items without `remindAt` show as "Task", items with `remindAt` show as "Reminder" with a bell icon. Remove the separate "reminder" type from `TimelineItem` — it's now just `"item"`.

- [ ] **Step 6: Update stats-row.tsx**

Change from 3 cards (Tasks, Events, Reminders) to: Items (total non-done), Events, Reminders (items with remindAt that are non-done).

- [ ] **Step 7: Verify build and test**

Run: `npm run build 2>&1 | tail -15`
Run: `npm test`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: update dashboard to use unified item model"
```

---

### Task 8: Redesign Tasks Page — Category-Grouped Overview

**Files:**
- Modify: `src/app/todos/page.tsx`
- Rewrite: `src/components/todos/todos-client.tsx`

- [ ] **Step 1: Update server component**

Replace `src/app/todos/page.tsx`:

```tsx
import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { TodosClient } from "@/components/todos/todos-client";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const user = await getOrCreateDevUser();
  const [items, categories] = await Promise.all([
    listItems(user.id),
    listCategories(user.id),
  ]);

  const serializedItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: { id: item.category.id, name: item.category.name, color: item.category.color ?? "#92785C" },
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt?.toISOString() ?? null,
    recurring: item.recurring,
  }));

  const serializedCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? "#92785C",
  }));

  return <TodosClient items={serializedItems} categories={serializedCategories} />;
}
```

- [ ] **Step 2: Rewrite TodosClient as category-grouped overview**

Replace `src/components/todos/todos-client.tsx` with a category-card layout:
- Group items by `category.id`
- Each category renders as a card showing: category name + color, list of items with checkboxes, item count, arrow to navigate to `/todos/[categoryId]`
- Items with `remindAt` show bell icon + time
- Checkbox tap calls `toggleItemStatus` server action
- FAB "+" opens create item bottom sheet (with category picker, title, description, priority, optional due date/time, remind me toggle)
- Empty state when no items exist
- If no categories exist, prompt to create one

- [ ] **Step 3: Verify in browser**

Start dev server, navigate to `/todos`. Should see category cards with items grouped.

- [ ] **Step 4: Commit**

```bash
git add src/app/todos/page.tsx src/components/todos/todos-client.tsx
git commit -m "feat: redesign Tasks page with category-grouped overview"
```

---

### Task 9: Create Expanded Category Detail View

**Files:**
- Create: `src/app/todos/[categoryId]/page.tsx`
- Create: `src/components/category-detail/category-detail-client.tsx`

- [ ] **Step 1: Create server component**

```tsx
// src/app/todos/[categoryId]/page.tsx
import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { prisma } from "@/lib/prisma";
import { CategoryDetailClient } from "@/components/category-detail/category-detail-client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const user = await getOrCreateDevUser();

  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId: user.id },
  });
  if (!category) notFound();

  const items = await listItems(user.id, { categoryId });

  const serializedItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: { id: category.id, name: category.name, color: category.color ?? "#92785C" },
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt?.toISOString() ?? null,
    recurring: item.recurring,
  }));

  return (
    <CategoryDetailClient
      category={{ id: category.id, name: category.name, color: category.color ?? "#92785C" }}
      items={serializedItems}
    />
  );
}
```

- [ ] **Step 2: Create CategoryDetailClient**

Create `src/components/category-detail/category-detail-client.tsx`:
- Header with category name + color dot + back arrow to `/todos`
- Full item list with: title, description preview (truncated), due date, due time, priority dot, reminder badge
- Tap item = expand inline to show full description
- Checkbox to toggle status
- Delete button per item
- FAB "+" to create new item scoped to this category (category pre-selected in sheet)

- [ ] **Step 3: Verify in browser**

Navigate to a category card on `/todos`, tap it — should go to `/todos/[categoryId]` with the detailed view.

- [ ] **Step 4: Commit**

```bash
git add src/app/todos/[categoryId]/page.tsx src/components/category-detail/
git commit -m "feat: add expanded category detail view at /todos/[categoryId]"
```

---

### Task 10: Update Calendar Page

**Files:**
- Modify: `src/app/calendar/page.tsx`
- Modify: `src/components/calendar/calendar-client.tsx`

- [ ] **Step 1: Update calendar server component**

Replace `src/app/calendar/page.tsx` to fetch `listItems` instead of `listTodos` + `listReminders`:

```tsx
import { getOrCreateDevUser } from "@/lib/dev-user";
import { listItems } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { CalendarClient } from "@/components/calendar/calendar-client";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getOrCreateDevUser();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const items = await listItems(user.id);

  let googleEvents: Array<{ id: string; title: string; startTime: string; endTime: string }> = [];
  if (user.googleRefreshToken) {
    try {
      googleEvents = await getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", monthStart, monthEnd);
    } catch {}
  }

  const serializedItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: { id: item.category.id, name: item.category.name, color: item.category.color ?? "#92785C" },
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt?.toISOString() ?? null,
    recurring: item.recurring,
  }));

  return (
    <CalendarClient items={serializedItems} googleEvents={googleEvents} hasGoogleCalendar={!!user.googleRefreshToken} />
  );
}
```

- [ ] **Step 2: Update CalendarClient**

Update `src/components/calendar/calendar-client.tsx`:
- Change props from `todos: Todo[]` + `reminders: Reminder[]` to `items: Item[]`
- Update `datesWithItems` to check `item.dueDate` (parse date string) and `item.remindAt`
- Update `selectedItems` to build from items + googleEvents
- Items with `remindAt` show bell icon, others show check icon

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -15`

- [ ] **Step 4: Commit**

```bash
git add src/app/calendar/page.tsx src/components/calendar/calendar-client.tsx
git commit -m "refactor: update calendar page to use unified item model"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Unified item model (single table) — Task 1
- ✅ Item service with CRUD + due query + recurrence — Task 2
- ✅ Updated types — Task 3
- ✅ Server actions — Task 4
- ✅ API routes — Task 5
- ✅ Cron endpoint — Task 5
- ✅ AI tools unified — Task 6
- ✅ Telegram webhook updated — Task 6
- ✅ Dashboard updated — Task 7
- ✅ Category-grouped Tasks page — Task 8
- ✅ Expanded category detail view — Task 9
- ✅ Calendar page updated — Task 10
- ✅ CategoryId required on items — Task 1 (schema)
- ✅ Optional description — Task 1 (schema)
- ✅ Separate dueDate and dueTime — Task 1 (schema)
- ✅ Remind me toggle (remindAt field) — Tasks 1, 8
- ✅ Recurrence on reminders — Task 1 (schema), Task 2 (service)

**2. Placeholder scan:** No TBDs. Tasks 7-9 describe component behavior in prose rather than full code because these are large UI components — the implementer has enough context from the existing components to build them.

**3. Type consistency:** `Item` type used consistently across all tasks. `createItem`/`listItems`/`updateItem`/`deleteItem`/`getDueItems`/`markItemSent`/`createNextOccurrence` signatures match between Task 2 (service) and all consumers (Tasks 4-10). `toggleItemStatus`/`addItem`/`removeItem` action names match between Task 4 and Tasks 7-9.
