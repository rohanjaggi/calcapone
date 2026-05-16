# Unified Items Redesign

Merge todos and reminders into a single "items" concept, grouped by category.

## Data Model

Replace `todos` and `reminders` tables with a single `items` table:

| Field | Type | Notes |
|-------|------|-------|
| id | uuid, PK | |
| userId | FK → users | |
| categoryId | FK → categories | required |
| title | text | |
| description | text, nullable | shown in expanded view only |
| status | enum: pending, in_progress, done | |
| priority | enum: low, medium, high | |
| dueDate | date, nullable | date only |
| dueTime | text, nullable | "HH:mm" format, separate from date |
| remindAt | timestamptz, nullable | if set, cron sends Telegram notification |
| recurring | enum: none, daily, weekly, monthly | only when remindAt is set |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

Categories become required — every item must belong to a category. Users who have no categories get prompted to create one.

## Tasks Tab — Main View

Shows all categories as cards. Each card displays its items with inline checkboxes.

- Checkbox tap = toggle done (server action, no navigation)
- Items with `remindAt` show a bell icon + time
- Each card shows item count and is tappable → navigates to `/todos/[categoryId]`
- Floating "+" FAB opens create item sheet

## Expanded Category View (`/todos/[categoryId]`)

Full list of items in that category with:
- Title, description preview, due date, due time, reminder badge, priority dot
- Tap item = expand inline to show full description
- Edit and delete actions
- Create new item scoped to this category

## Create/Edit Item (Bottom Sheet)

- Title (required)
- Description (optional, multiline)
- Priority (low / medium / high)
- Category picker
- Due date (optional, date picker)
- Due time (optional, time picker — only shows when date is set)
- "Remind me" toggle → remind-at datetime + recurrence (none / daily / weekly / monthly)

## Cron / Reminder Notifications

No changes to GitHub Actions workflow (runs every minute). Update the query to use the new `items` table: `items WHERE remindAt <= now AND status != done`. Same recurrence logic.

## AI Tools

Update tool definitions to use unified item model:
- `create_todo` → `create_item` (with optional remindAt)
- Remove `create_reminder` (folded into create_item)
- `list_todos` → `list_items`
- `complete_todo` → `complete_item`
- `delete_todo` → `delete_item`
- Remove `list_reminders`, `cancel_reminder` (folded into list_items/delete_item)

## Migration

- Create new `items` table
- Migrate existing todos → items (categoryId required, assign "Uncategorized" category for any without)
- Migrate existing reminders → items (map message→title, remindAt stays)
- Drop old `todos` and `reminders` tables
- Update all services, API routes, dashboard components, and Telegram webhook

## What Changes

- Prisma schema: new Item model, remove Todo and Reminder models
- Services: new `item.ts` replacing `todo.ts` and `reminder.ts`
- API routes: `/api/items` replacing `/api/todos` and `/api/reminders`
- Cron endpoint: query items table
- Dashboard: update timeline and stats to use items
- Tasks page: category-grouped overview → expanded category view
- AI tools: unified item tools
- Telegram webhook: updated tool execution
