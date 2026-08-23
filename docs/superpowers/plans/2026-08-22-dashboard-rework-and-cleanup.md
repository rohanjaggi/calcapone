# Dashboard Rework and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the dashboard's two AI features and the entire school subsystem, then rebuild the dashboard as a week-strip-driven timeline that finally shows calendar events alongside tasks.

**Architecture:** A new `agenda.ts` service returns seven days of items and calendar events in one server payload, read from the local `calendar_events` mirror rather than the Google API. `timeline.ts` is rewritten to merge both into the `TimelineItem` union `DayTimeline` already renders. Day switching is pure client state.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + PostgreSQL, Vitest, Tailwind 4, motion/react.

**Spec:** `docs/superpowers/specs/2026-08-22-dashboard-rework-and-cleanup-design.md`

## Global Constraints

> **As built:** the three schema steps below were generated offline (see Global
> Constraints) and then squashed into a single migration,
> `20260823000000_dashboard_rework_cleanup`, since none had been applied to any
> database. The `migrate dev` commands in the tasks are superseded.


- Run `npm run verify` (lint + typecheck + test) before every commit. It must pass.
- Prisma client is generated to `src/generated/prisma` and is **not** committed. After any schema change run `npx prisma generate` before typechecking.
- **Never run `prisma migrate dev`.** There is no `DIRECT_DATABASE_URL` in `.env.local`, so `prisma.config.ts` falls back to the pooled `DATABASE_URL`, which cannot run migrations — and `migrate dev` can offer to reset the live database when it detects drift. Generate migrations offline instead:
  ```bash
  SCRATCH=<scratchpad>
  cp prisma/schema.prisma "$SCRATCH/old.prisma"   # BEFORE editing the schema
  # ...edit prisma/schema.prisma...
  mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_<name>"
  npx prisma migrate diff --from-schema "$SCRATCH/old.prisma" --to-schema prisma/schema.prisma --script \
    > "prisma/migrations/<the folder just created>/migration.sql"
  npx prisma generate
  ```
  This touches no database. Migrations apply on deploy via `npx prisma migrate deploy`.
- The `rtk` shell hook mangles some `npx` invocations. If a command fails with `[rtk: No such file or directory]`, re-run it as `rtk proxy <command>`.
- Never edit anything under `src/generated/`.
- Timezone rule: `remindAt` is an absolute instant whose calendar day depends on the target timezone. `dueDate`/`dueTime` are already wall-clock in the user's zone, so `dueDate` **is** the day. Never convert `dueDate` through a `Date`.
- Never read the clock during render in a client component. The server renders at a different instant and zone; read it in an effect after mount (see `greeting.tsx:38`, `day-timeline.tsx:129`).
- **`kind` is overloaded in this codebase.** `UndoRecord.kind` (a machine action name), `Resolution.kind` / `CourseResolution.kind` (discriminated-union tags), and `Bucket.kind` in `commands/format.ts` are **unrelated to `ItemKind`** and must not be touched by the school removal.
- Test files live in `tests/`, mirror the `src/` path, import via the `@/` alias, and use `describe`/`it`/`expect` from `vitest`.
- Commit messages: `feat:` / `fix:` / `refactor:` / `docs:` prefix, matching existing history.

---

### Task 1: Remove the dashboard's AI features

**Files:**
- Delete: `src/components/dashboard/ai-input.tsx`, `src/components/dashboard/ai-recommendation.tsx`
- Modify: `src/app/actions.ts` (remove `getAiRecommendation` at :175, `aiAddItem` at :218)
- Modify: `src/components/dashboard/dashboard-client.tsx`, `src/app/page.tsx`
- Modify: `src/components/settings/notifications-config.tsx`, `src/components/settings/settings-client.tsx`, `src/app/settings/page.tsx`, `src/app/settings/actions.ts`, `src/lib/services/user.ts`
- Modify: `prisma/schema.prisma` (drop `User.aiSuggestionEnabled`)
- Modify: `src/lib/services/ai.ts` (drop `ChatOptions`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DashboardClient` keeps props `{ userName, items, timezone, today }` — `aiSuggestionEnabled` is gone. Task 7 replaces this signature entirely.
- Produces: `chatWithAi(userMessage, user, config, history?)` — four params, no options object, never sends tools.

- [ ] **Step 1: Delete the two components and their server actions**

```bash
rm src/components/dashboard/ai-input.tsx src/components/dashboard/ai-recommendation.tsx
```

In `src/app/actions.ts`, delete the whole `getAiRecommendation` function (starts line 175) and the whole `aiAddItem` function (starts line 218). Then remove any imports that become unused — check `chatWithAi`, `resolveAiClient`, `AiConfigError`, `executeToolCall` and drop whichever no longer have a reference in the file.

- [ ] **Step 2: Unwire them from the dashboard**

In `src/components/dashboard/dashboard-client.tsx`, remove the `AiInput` and `AiRecommendation` imports, the `aiSuggestionEnabled` prop from the `Props` type and the destructure, and both JSX lines. The render body becomes:

```tsx
return (
  <main className="safe-bottom pb-8">
    <Greeting name={userName} />
    <StatsRow counts={priorityCounts} />
    <DayTimeline items={timeline} />
  </main>
);
```

In `src/app/page.tsx`, drop the `aiSuggestionEnabled={user.aiSuggestionEnabled}` prop.

- [ ] **Step 3: Remove the orphaned setting**

Delete `aiSuggestionEnabled` from: `prisma/schema.prisma` (the `User` model), `src/lib/services/user.ts:50` (the `updateUserSettings` param type), `src/app/settings/page.tsx:16`, `src/app/settings/actions.ts:34` (the `saveNotifications` param type), `src/components/settings/settings-client.tsx` (lines 27, 83, 135), and `src/components/settings/notifications-config.tsx` (lines 11, 21, 63, 75, 89, 102 — the prop, the `aiEnabled` state, its dirty-check clause, its payload field, and the toggle row that renders it).

- [ ] **Step 4: Collapse `chatWithAi`**

In `src/lib/services/ai.ts`, `chatWithAi`'s tool branch now has no caller — the briefing is its only consumer and passes `tools: false`. Delete the `ChatOptions` type and the `options` parameter, and hardcode `tools: false`:

```ts
export async function chatWithAi(
  userMessage: string,
  user: PromptUser,
  config: AiConfig,
  history?: PlainHistory
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const { provider, apiKey, model } = resolveAiClient(config);
  return adapterFor(provider)({
    apiKey,
    model,
    system: buildSystemPrompt(user),
    turns: toTurns(history, userMessage),
    tools: false,
  });
}
```

Update the caller in `src/app/api/cron/briefing/route.ts` to drop its trailing `{ tools: false }` argument. Check `tests/services/ai.test.ts` for `chatWithAi` cases asserting on the options object and update them.

- [ ] **Step 5: Create the migration**

```bash
npx prisma migrate dev --name drop_ai_suggestion_enabled
npx prisma generate
```

- [ ] **Step 6: Verify**

Run: `npm run verify`
Expected: PASS. If `ai.test.ts` fails on the `chatWithAi` signature, fix the test — the new signature is correct.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove dashboard AI quick-add and recommendations"
```

---

### Task 2: Remove the how-to-use page and consolidate docs

**Files:**
- Delete: `src/app/how-to-use/page.tsx`
- Modify: `src/components/settings/settings-client.tsx` (the `/how-to-use` `<Link>` block)
- Modify: `src/proxy.ts` (matcher excludes `how-to-use`)
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the page before deleting it**

Run: `cat src/app/how-to-use/page.tsx`

Note anything it explains that the README does **not** already cover. That content moves to the README; everything already covered is simply dropped.

- [ ] **Step 2: Delete the page and its entry points**

```bash
rm -r src/app/how-to-use
```

In `src/components/settings/settings-client.tsx`, delete the entire `<Link href="/how-to-use">…</Link>` block and the now-unused `HelpCircle` and `ChevronRight` imports (check whether `ChevronRight` is used elsewhere in the file first).

In `src/proxy.ts`, remove `how-to-use|` from the matcher regex — the route no longer exists, so the exemption is dead.

- [ ] **Step 3: Fold any unique content into the README**

Add whatever Step 1 turned up to the relevant README section. Do not duplicate what is already there.

- [ ] **Step 4: Verify**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: drop how-to-use page, consolidate into README"
```

---

### Task 3: Remove `isKnownModel` and the dead REST routes

**Files:**
- Modify: `src/lib/models.ts` (delete `isKnownModel`)
- Delete: `src/app/api/items/route.ts`, `src/app/api/items/[id]/route.ts`, `src/app/api/categories/route.ts`, `src/app/api/categories/[id]/route.ts`, `src/app/api/settings/route.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `src/lib/auth.ts`'s `getRequestUser` may become unused — check before removing it.

- [ ] **Step 1: Confirm the routes are genuinely dead**

Run: `rtk proxy grep -rn "api/items\|api/categories\|api/settings" src tests | grep -v "^src/app/api/"`
Expected: only `api/settings/google` hits (the OAuth flow, which stays). No hits for `api/items` or `api/categories`.

If anything else appears, STOP and report it — the premise of this task is wrong.

- [ ] **Step 2: Delete**

```bash
rm -r src/app/api/items src/app/api/categories
rm src/app/api/settings/route.ts
```

`src/app/api/settings/google/` must survive — verify with `ls src/app/api/settings/`.

- [ ] **Step 3: Delete `isKnownModel`**

Remove the function from `src/lib/models.ts` (line 44). `ModelOption`, `PROVIDER_DEFAULTS`, `AI_MODELS` and `SUPPORTED_PROVIDERS` all stay.

- [ ] **Step 4: Check for orphaned helpers**

Run: `rtk proxy grep -rn "getRequestUser" src`

If the only remaining definition is in `src/lib/auth.ts` with no callers, delete it too. If anything still calls it, leave it.

- [ ] **Step 5: Verify**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete unused REST routes and isKnownModel"
```

---

### Task 4: Remove school from the AI and command layers

**Files:**
- Delete: `src/lib/services/course.ts`, `tests/services/course.test.ts`
- Modify: `src/lib/services/ai-tools.ts`, `src/lib/services/execute-tool.ts`, `src/lib/services/commands/handlers.ts`, `src/lib/services/commands/index.ts`, `src/lib/services/telegram.ts`, `src/lib/services/tool-outcome.ts`, `src/lib/services/action-log.ts`
- Modify: `tests/services/execute-tool.test.ts`, `tests/services/commands/handlers.test.ts`, `tests/services/commands/index.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ItemSnapshot` loses `kind` and `courseId`. `UndoOp` loses the `delete_course` and `set_course_archived` variants. `AI_TOOLS` drops to 14 entries. Task 5 depends on `ItemKind` having no remaining references outside `escalation.ts`, `item.ts`, and the schema.

- [ ] **Step 1: Strip the tool definitions**

In `src/lib/services/ai-tools.ts`, delete the `create_course`, `archive_course` and `list_courses` entries from `AI_TOOLS`. Then delete the `kind` and `course` properties from the `create_item`, `update_item` and `list_items` parameter schemas.

In `buildSystemPrompt`, delete these rule lines:
- the `School work: file homework…` line
- the `A course code like "CS2040"…` line
- the `When a semester ends…` line

and these examples:
- `"CS2040 assignment 2 due next Friday 2359"`
- `"my CS2040 midterm is week 8 wednesday"`
- `"what's due for CS2040?"`

- [ ] **Step 2: Strip the tool handlers**

In `src/lib/services/execute-tool.ts`:
- Delete the `createCourse, listCourses, findCourse, setCourseArchived` import (line 13).
- Delete `ITEM_KINDS` (line 72), `asKind` (74-76), and `KIND_LABELS` (218).
- Remove `ItemKind` from the type import on line 25.
- Delete `CourseResolution` (225-227) and `resolveCourse` (236-264).
- Delete `kind` and `courseId` from `ItemRow` (104-105) and from `snapshot()` (131-132).
- Delete the `case "create_course"`, `case "list_courses"` and `case "archive_course"` blocks (742-793).
- In `case "create_item"` (around 363): delete the `resolveCourse` call and its guard, the `const kind = asKind(...)` line, and the `courseId` / `kind` fields on the create payload. The receipt label on line 397 becomes `const label = item.remindAt ? "Reminder" : "Task";` and `where` on 398 becomes `esc(cat.name)`.
- In `case "list_items"` (around 426): delete the `resolveCourse` call, its guard, and the `kind` / `courseId` filter spreads (432-433).
- In `case "update_item"` (around 541): delete the `resolveCourse` call and guard, the `kind` / `courseId` fields on the `updates` type (554-555), and their assignments (558-559).

**Do not touch** any other `kind:` in this file — `UndoRecord.kind` and `Resolution.kind` are unrelated discriminators.

- [ ] **Step 3: Strip the undo vocabulary**

In `src/lib/services/tool-outcome.ts`: delete `kind?: ItemKind;` and `courseId?: string | null;` from `ItemSnapshot`, remove `ItemKind` from the enum import, and delete the `delete_course` and `set_course_archived` variants from `UndoOp`.

In `src/lib/services/action-log.ts`: delete the two `op.courseId` branches (lines 156 and 161) that applied those variants.

- [ ] **Step 4: Strip the slash commands**

In `src/lib/services/commands/handlers.ts`: delete the `@/lib/services/course` import block (lines 5-11), the `Course` type import (line 29), and the `handleCourses`, `handleExams` and `handleDue` functions. Check `handleToday`, `handleWeek` and `handleList` for `kind` or `course` rendering and strip it.

In `src/lib/services/commands/index.ts`: remove `"courses"`, `"exams"` and `"due"` from `DB_COMMANDS`, remove their imports, and remove their `case` arms from the dispatch.

In `src/lib/services/telegram.ts`: delete the `exams`, `due` and `courses` entries from `setMyCommands`.

Update `/help` text (in `handlers.ts`) to drop the three commands.

```bash
rm src/lib/services/course.ts tests/services/course.test.ts
```

- [ ] **Step 5: Fix the tests**

Run: `npm run test 2>&1 | tail -40`

Expected: failures in `execute-tool.test.ts`, `handlers.test.ts`, `commands/index.test.ts`. Delete the cases that exercise courses, exams, assignments or `kind`. Leave every other case untouched — a case failing for an unrelated reason is a real regression, not cleanup.

- [ ] **Step 6: Verify**

Run: `npm run verify`
Expected: PASS. `ItemKind` should now only appear in `escalation.ts`, `item.ts`, `prisma/schema.prisma`, and `src/generated/`. Confirm with:

Run: `rtk proxy grep -rln "ItemKind" src tests | grep -v generated`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove courses and item kinds from AI and command layers"
```

---

### Task 5: Collapse the escalation ladders and drop the school schema

**Files:**
- Modify: `src/lib/services/escalation.ts`, `src/lib/services/item.ts`, `src/app/api/cron/reminders/route.ts`
- Modify: `prisma/schema.prisma`
- Modify: `tests/services/escalation.test.ts`, `tests/services/item.test.ts`, `tests/services/item-completion.test.ts`, `tests/routes/cron-reminders-recurrence.test.ts`

**Interfaces:**
- Consumes: Task 4 removed every `ItemKind` reference outside these files.
- Produces: `ladderFor()` and `ESCALATION_KINDS` are gone. `nextEscalation(hoursUntilDue, currentStage)` — two params, no `kind`. `LADDER: Rung[]` is exported for the cron's message formatter.

- [ ] **Step 1: Back up the database**

Take a Supabase snapshot. This task drops columns and a table; it is the only irreversible step in the plan.

- [ ] **Step 2: Write the failing test**

Replace the kind-parameterised cases in `tests/services/escalation.test.ts` with the single-ladder form. The "tightest rung the deadline satisfies" rule must keep its coverage:

```ts
import { describe, it, expect } from "vitest";
import { nextEscalation, LADDER } from "@/lib/services/escalation";

describe("nextEscalation", () => {
  it("has one ladder: 24h, 2h, overdue", () => {
    expect(LADDER.map((r) => r.hoursBefore)).toEqual([24, 2, 0]);
  });

  it("picks the tightest rung the deadline satisfies, not the first", () => {
    // First seen 30 minutes out: must land on "Due soon" (stage 2), never replay stage 1.
    expect(nextEscalation(0.5, 0)).toEqual({ stage: 2, label: "Due soon" });
  });

  it("does not re-fire a stage already reached", () => {
    expect(nextEscalation(0.5, 2)).toBeNull();
  });

  it("returns null past the end of the ladder", () => {
    expect(nextEscalation(-5, 3)).toBeNull();
  });

  it("fires the 24h rung for an item a day out", () => {
    expect(nextEscalation(20, 0)).toEqual({ stage: 1, label: "Due" });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/services/escalation.test.ts`
Expected: FAIL — `LADDER` is not exported and `nextEscalation` still takes three arguments.

- [ ] **Step 4: Collapse the ladders**

Rewrite `src/lib/services/escalation.ts`:

```ts
export type Rung = {
  /** Fire once the deadline is this many hours away or nearer. 0 means "at or past due". */
  hoursBefore: number;
  /** Headline for the alert, e.g. "Due soon". */
  label: string;
};

/**
 * Ordered nearest-deadline-last, so a rung's array index doubles as its 1-based stage number.
 */
export const LADDER: Rung[] = [
  { hoursBefore: 24, label: "Due" },
  { hoursBefore: 2, label: "Due soon" },
  { hoursBefore: 0, label: "Overdue" },
];

/** `notificationStage` counts 0..this, so the candidate query bounds on it. */
export const MAX_ESCALATION_STAGE = LADDER.length;

/**
 * The rung this item should be on now, or null if it is already there (or past everything).
 *
 * Picks the LAST rung whose threshold is still `>= hoursUntilDue` — the tightest one the
 * deadline currently satisfies. An item the cron only starts watching once it is 30 minutes
 * out must land on "Due soon" immediately; walking from the top would fire the 24h rung for
 * an item that was never seen 24h out.
 */
export function nextEscalation(
  hoursUntilDue: number,
  currentStage: number
): { stage: number; label: string } | null {
  let matchIndex = -1;
  for (let i = 0; i < LADDER.length; i++) {
    if (LADDER[i].hoursBefore >= hoursUntilDue) matchIndex = i;
  }
  if (matchIndex === -1) return null;

  const stage = matchIndex + 1;
  if (stage <= currentStage) return null;

  return { stage, label: LADDER[matchIndex].label };
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/services/escalation.test.ts`
Expected: PASS.

- [ ] **Step 6: Update the two callers**

In `src/lib/services/item.ts`, `getEscalationCandidates` no longer needs the per-kind `OR`:

```ts
export async function getEscalationCandidates() {
  return prisma.item.findMany({
    where: {
      status: { not: "done" },
      dueDate: { not: null },
      remindAt: null,
      parentId: null,
      notificationStage: { lt: MAX_ESCALATION_STAGE },
    },
    include: { user: true, category: true },
  });
}
```

Update its import to `MAX_ESCALATION_STAGE` and drop `ladderFor` / `ESCALATION_KINDS`.

In `src/app/api/cron/reminders/route.ts`: change the call to `nextEscalation(hoursUntilDue, item.notificationStage)`, change `const rung = ladderFor(item.kind)[next.stage - 1];` to `const rung = LADDER[next.stage - 1];`, update the import, and drop `kind: item.kind` from the `createItem` call in the recurrence block.

- [ ] **Step 7: Drop the schema**

In `prisma/schema.prisma`: delete the `Course` model, the `ItemKind` enum, `Item.kind`, `Item.courseId`, `Item.course`, the `@@index([userId, kind, dueDate])` and `@@index([courseId])` lines on `Item`, and `courses Course[]` from `User`.

```bash
npx prisma migrate dev --name drop_courses_and_item_kind
npx prisma generate
```

- [ ] **Step 8: Verify**

Run: `npm run verify`
Expected: PASS. Fix any remaining `kind`/`course` references the typechecker surfaces in `item.test.ts`, `item-completion.test.ts` or `cron-reminders-recurrence.test.ts` by deleting those fields from test fixtures.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: collapse escalation to one ladder, drop courses schema"
```

---

### Task 6: Agenda service and timeline merge

**Files:**
- Create: `src/lib/services/agenda.ts`, `tests/services/agenda.test.ts`
- Modify: `src/lib/timeline.ts`, `src/lib/mock-data.ts`, `tests/lib/timeline.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `AgendaEvent` — declared in `src/lib/mock-data.ts`, **not** in `agenda.ts`. `agenda.ts` imports `buildTimeline` from `timeline.ts`, so `timeline.ts` importing a type back out of `agenda.ts` would be a cycle. Both import it from `mock-data.ts`, which is where the other view-model types already live.
    ```ts
    export type AgendaEvent = { id: string; title: string; startsAt: string; endsAt: string; allDay: boolean };
    ```
  - `buildTimeline(items: Item[], events: AgendaEvent[], tz: string, day: string): TimelineItem[]`
  - `getAgenda(userId: string, tz: string, anchorDate: string, days?: number): Promise<Agenda>`
  - `type Agenda = { priorityCounts: Record<Priority, number>; strip: Array<{ date: string; taskCount: number; eventCount: number }>; byDay: Record<string, TimelineItem[]>; categories: Array<{ id: string; name: string; color: string }> }`
  - Task 7 consumes `getAgenda` and `Agenda`. `categories` is in the payload from the start because Task 7 Step 5 needs it for `CreateItemSheet`.

- [ ] **Step 1: Write the failing timeline test**

Append to `tests/lib/timeline.test.ts`. Note the new second parameter — every existing call in this file needs `[]` inserted:

```ts
import type { AgendaEvent } from "@/lib/mock-data";

const event = (o: Partial<AgendaEvent> & { id: string }): AgendaEvent => ({
  title: "Standup",
  startsAt: `${TODAY}T02:00:00.000Z`, // 10:00 in Asia/Singapore
  endsAt: `${TODAY}T02:30:00.000Z`,
  allDay: false,
  ...o,
});

describe("buildTimeline with events", () => {
  it("emits an event row with type 'event'", () => {
    const timeline = buildTimeline([], [event({ id: "e1" })], SG, TODAY);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ id: "e1", type: "event", title: "Standup" });
  });

  it("excludes an event on another day in the target timezone", () => {
    // 17:00Z on the 19th is 01:00 on the 20th in Singapore — it belongs to TODAY, not the 19th.
    const timeline = buildTimeline([], [event({ id: "e2", startsAt: "2026-08-19T17:00:00.000Z" })], SG, "2026-08-19");
    expect(timeline).toEqual([]);
  });

  it("interleaves events and items in time order", () => {
    const items = [item({ id: "task", dueDate: TODAY, dueTime: "14:00" })];
    const events = [event({ id: "early", startsAt: `${TODAY}T02:00:00.000Z` })];
    expect(buildTimeline(items, events, SG, TODAY).map((t) => t.id)).toEqual(["early", "task"]);
  });

  it("sorts an all-day event before every timed row", () => {
    const items = [item({ id: "task", dueDate: TODAY, dueTime: "00:30" })];
    const events = [event({ id: "allday", allDay: true, startsAt: `${TODAY}T00:00:00.000Z` })];
    expect(buildTimeline(items, events, SG, TODAY).map((t) => t.id)).toEqual(["allday", "task"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/lib/timeline.test.ts`
Expected: FAIL — `buildTimeline` takes three arguments and `AgendaEvent` is not exported from `mock-data.ts`.

- [ ] **Step 3: Add the event branch to `buildTimeline`**

In `src/lib/mock-data.ts`, add `allDay?: boolean` to `TimelineItem` and declare the event type:

```ts
export type AgendaEvent = { id: string; title: string; startsAt: string; endsAt: string; allDay: boolean };
```

Rewrite `src/lib/timeline.ts` to take events as the second parameter. Keep the existing item loop verbatim, then add:

```ts
for (const ev of events) {
  const instant = new Date(ev.startsAt);
  if (isNaN(instant.getTime())) continue;
  if (formatDateInTz(instant, tz) !== day) continue;

  timelineItems.push({
    id: ev.id,
    type: "event",
    title: ev.title,
    time: ev.startsAt,
    endTime: ev.endsAt,
    subtitle: ev.allDay ? "All day" : "Calendar",
    color: "#4A6FA5",
    allDay: ev.allDay,
  });
}

// All-day rows have no meaningful time-of-day, so they head the list rather than
// sorting to whatever midnight happens to be in the user's zone.
timelineItems.sort((a, b) => {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return new Date(a.time).getTime() - new Date(b.time).getTime();
});
```

Rename the `today` parameter to `day` throughout — it now means "the selected day", not "today".

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/lib/timeline.test.ts`
Expected: PASS, including every pre-existing case (with `[]` inserted as the second argument).

- [ ] **Step 5: Write the failing agenda test**

Create `tests/services/agenda.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListItems = vi.hoisted(() => vi.fn());
const mockListCategories = vi.hoisted(() => vi.fn());
const mockEventFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { calendarEvent: { findMany: mockEventFindMany } },
}));
vi.mock("@/lib/services/item", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/item")>()),
  listItems: mockListItems,
}));
vi.mock("@/lib/services/category", () => ({ listCategories: mockListCategories }));

import { getAgenda } from "@/lib/services/agenda";

const SG = "Asia/Singapore";
const ANCHOR = "2026-08-20";
const CATEGORY = { id: "c1", name: "General", color: "#92785C" };

function row(o: Record<string, unknown>) {
  return {
    id: "i1",
    title: "Task",
    description: null,
    status: "pending",
    priority: "medium",
    category: CATEGORY,
    dueDate: null,
    dueTime: null,
    remindAt: null,
    recurring: "none",
    googleEventId: null,
    ...o,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEventFindMany.mockResolvedValue([]);
  mockListCategories.mockResolvedValue([CATEGORY]);
  mockListItems.mockResolvedValue([]);
});

describe("getAgenda", () => {
  it("returns a strip of seven consecutive days starting at the anchor", async () => {
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.strip).toHaveLength(7);
    expect(agenda.strip[0].date).toBe("2026-08-20");
    expect(agenda.strip[6].date).toBe("2026-08-26");
  });

  it("crosses a month boundary correctly", async () => {
    const agenda = await getAgenda("u1", SG, "2026-08-30");
    expect(agenda.strip.map((d) => d.date)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
      "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
  });

  it("counts every open item in priorityCounts, including ones outside the window", async () => {
    mockListItems.mockResolvedValue([
      row({ id: "near", priority: "high", dueDate: ANCHOR, dueTime: "09:00" }),
      row({ id: "far", priority: "low", dueDate: "2027-01-01", dueTime: "09:00" }),
    ]);
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.priorityCounts).toEqual({ high: 1, medium: 0, low: 1 });
    // ...but only the in-window one lands in a day bucket.
    expect(agenda.byDay[ANCHOR].map((r) => r.id)).toEqual(["near"]);
  });

  it("keeps an undated item out of every day bucket but inside the counts", async () => {
    mockListItems.mockResolvedValue([row({ id: "someday", priority: "medium" })]);
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.priorityCounts.medium).toBe(1);
    expect(Object.values(agenda.byDay).flat()).toEqual([]);
  });

  it("counts tasks and events separately in the strip", async () => {
    mockListItems.mockResolvedValue([row({ id: "t", dueDate: ANCHOR, dueTime: "09:00" })]);
    mockEventFindMany.mockResolvedValue([
      {
        id: "e",
        title: "Standup",
        startsAt: new Date("2026-08-20T02:00:00.000Z"),
        endsAt: new Date("2026-08-20T02:30:00.000Z"),
        allDay: false,
      },
    ]);
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.strip[0]).toMatchObject({ taskCount: 1, eventCount: 1 });
  });
});
```

`listItems` is mocked rather than Prisma directly because `getAgenda` delegates the open-item query to it — this test is about the merging and bucketing, which is where the logic lives.

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/services/agenda.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `getAgenda`**

Create `src/lib/services/agenda.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { listItems, OPEN_STATUSES } from "@/lib/services/item";
import { buildTimeline } from "@/lib/timeline";
import { startOfDayInTz, endOfDayInTz } from "@/lib/tz";
import { listCategories } from "@/lib/services/category";
import type { Item, TimelineItem, AgendaEvent } from "@/lib/mock-data";
import type { Priority } from "@/generated/prisma/enums";

export type Agenda = {
  priorityCounts: Record<Priority, number>;
  strip: Array<{ date: string; taskCount: number; eventCount: number }>;
  byDay: Record<string, TimelineItem[]>;
  categories: Array<{ id: string; name: string; color: string }>;
};

export const AGENDA_DAYS = 7;

/** Shift a "YYYY-MM-DD" by whole days without going through a local-time Date. */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Everything the dashboard renders, in one payload.
 *
 * Calendar events come from the local `calendar_events` mirror, never the Google API: the
 * mirror spans -7 to +90 days and the cron refreshes it every ~4 minutes, so a seven-day
 * window is always well inside it. That is what lets the dashboard render server-side with
 * no token refresh, no network round-trip and no streaming promise.
 */
export async function getAgenda(
  userId: string,
  tz: string,
  anchorDate: string,
  days: number = AGENDA_DAYS
): Promise<Agenda> {
  const dates = Array.from({ length: days }, (_, i) => shiftDate(anchorDate, i));
  const windowStart = startOfDayInTz(dates[0], tz);
  const windowEnd = endOfDayInTz(dates[dates.length - 1], tz);

  const [openItems, eventRows, categoryRows] = await Promise.all([
    listItems(userId, { status: OPEN_STATUSES }),
    prisma.calendarEvent.findMany({
      where: { userId, startsAt: { gte: windowStart, lt: windowEnd } },
      orderBy: { startsAt: "asc" },
    }),
    listCategories(userId),
  ]);

  const priorityCounts = openItems.reduce<Record<Priority, number>>(
    (acc, i) => {
      acc[i.priority] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  const events: AgendaEvent[] = eventRows.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    allDay: e.allDay,
  }));

  const items: Item[] = openItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    category: {
      id: item.category.id,
      name: item.category.name,
      color: item.category.color ?? "#92785C",
    },
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    remindAt: item.remindAt?.toISOString() ?? null,
    recurring: item.recurring,
    googleEventId: item.googleEventId ?? null,
  }));

  const byDay: Record<string, TimelineItem[]> = {};
  for (const date of dates) byDay[date] = buildTimeline(items, events, tz, date);

  const strip = dates.map((date) => {
    const rows = byDay[date];
    return {
      date,
      taskCount: rows.filter((r) => r.type === "item").length,
      eventCount: rows.filter((r) => r.type === "event").length,
    };
  });

  const categories = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? "#92785C",
  }));

  return { priorityCounts, strip, byDay, categories };
}
```

- [ ] **Step 8: Run the test**

Run: `npx vitest run tests/services/agenda.test.ts`
Expected: PASS.

- [ ] **Step 9: Verify and commit**

Run: `npm run verify`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add agenda service merging tasks and calendar events"
```

---

### Task 7: Rebuild the dashboard

**Files:**
- Create: `src/components/dashboard/week-strip.tsx`
- Modify: `src/app/page.tsx`, `src/components/dashboard/dashboard-client.tsx`, `src/components/dashboard/day-timeline.tsx`

**Interfaces:**
- Consumes: `getAgenda`, `Agenda` from Task 6.
- Produces: `DashboardClient` props become `{ userName, timezone, today, agenda }`.

- [ ] **Step 1: Build the week strip**

Create `src/components/dashboard/week-strip.tsx`. It is presentational — selection state lives in `DashboardClient`.

```tsx
"use client";

import { motion } from "motion/react";

type Day = { date: string; taskCount: number; eventCount: number };

/** Weekday initial from a "YYYY-MM-DD" — parsed as UTC so it never shifts by local zone. */
function weekdayInitial(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return ["S", "M", "T", "W", "T", "F", "S"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function dayOfMonth(date: string): string {
  return String(Number(date.split("-")[2]));
}

export function WeekStrip({
  days,
  selected,
  today,
  onSelect,
}: {
  days: Day[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="flex gap-1.5 px-5 mt-5" role="group" aria-label="Pick a day">
      {days.map((day) => {
        const isSelected = day.date === selected;
        const isToday = day.date === today;
        const total = day.taskCount + day.eventCount;
        return (
          <button
            key={day.date}
            onClick={() => onSelect(day.date)}
            aria-pressed={isSelected}
            aria-label={`${day.date}, ${total} item${total === 1 ? "" : "s"}`}
            className={`relative flex-1 rounded-xl py-2 flex flex-col items-center gap-1 border transition-colors ${
              isSelected
                ? "bg-primary/10 border-primary/40"
                : "bg-card border-border/50 hover:bg-secondary/30"
            }`}
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {weekdayInitial(day.date)}
            </span>
            <span
              className={`text-sm font-semibold tabular-nums ${
                isToday ? "text-primary" : "text-foreground"
              }`}
            >
              {dayOfMonth(day.date)}
            </span>
            <span className="h-1 flex items-center">
              {total > 0 && (
                <motion.span
                  layoutId={`dot-${day.date}`}
                  className="w-1 h-1 rounded-full bg-muted-foreground/50"
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Make the "Now" marker conditional**

In `src/components/dashboard/day-timeline.tsx`, add an `isToday` prop. The marker is meaningless on any other day:

```tsx
export function DayTimeline({ items, isToday }: { items: TimelineItem[]; isToday: boolean }) {
```

Then guard both marker sites: change `showNow={i === nowIndex}` to `showNow={isToday && i === nowIndex}`, and add `isToday &&` to the trailing all-past marker's condition. Change the `<h2>` from the hardcoded `"Today"` to `{isToday ? "Today" : "Schedule"}`. Leave the `now === null`-until-mounted hydration guard exactly as it is.

- [ ] **Step 3: Rewire the client**

Rewrite `src/components/dashboard/dashboard-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Greeting } from "@/components/dashboard/greeting";
import { StatsRow } from "@/components/dashboard/stats-row";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { DayTimeline } from "@/components/dashboard/day-timeline";
import type { Agenda } from "@/lib/services/agenda";

type Props = {
  userName: string;
  timezone: string;
  /** Today's "YYYY-MM-DD" in `timezone`, settled on the server so both renders agree. */
  today: string;
  agenda: Agenda;
};

export function DashboardClient({ userName, timezone, today, agenda }: Props) {
  const [selected, setSelected] = useState(today);
  const entries = agenda.byDay[selected] ?? [];

  return (
    <main className="safe-bottom pb-8">
      <Greeting name={userName} timezone={timezone} />
      <StatsRow counts={agenda.priorityCounts} />
      <WeekStrip days={agenda.strip} selected={selected} today={today} onSelect={setSelected} />
      <DayTimeline items={entries} isToday={selected === today} />
    </main>
  );
}
```

Passing `timezone` to `Greeting` is the fix for the header bug — the component has always accepted the prop but was never given it, so the big date read the browser's zone rather than the saved one.

- [ ] **Step 4: Rewire the page**

Rewrite `src/app/page.tsx`. The per-item serialisation loop is gone — `getAgenda` returns render-ready data:

```tsx
import { requireUser } from "@/lib/auth";
import { getAgenda } from "@/lib/services/agenda";
import { todayInTz } from "@/lib/tz";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SearchDialog } from "@/components/search/search-dialog";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const today = todayInTz(user.timezone);
  const agenda = await getAgenda(user.id, user.timezone, today);

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <SearchDialog />
      </div>
      <DashboardClient
        userName={user.telegramUsername}
        timezone={user.timezone}
        today={today}
        agenda={agenda}
      />
    </>
  );
}
```

- [ ] **Step 5: Add Quick Add**

`CreateItemSheet` already exists and writes through the deterministic `addItem` action — no new form, no model call. Its props are:

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  defaultCategoryId?: string;
};
```

`getAgenda` already returns `categories` in the shape `Category` expects. Add to `DashboardClient`:

```tsx
const [adding, setAdding] = useState(false);
```

Render a trigger button after `DayTimeline`, then the sheet:

```tsx
<button
  onClick={() => setAdding(true)}
  className="mx-5 mt-6 w-[calc(100%-2.5rem)] flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card py-3 text-sm font-medium text-foreground active:scale-[0.99] transition-transform"
>
  <Plus className="w-4 h-4" />
  Add task
</button>

<CreateItemSheet
  open={adding}
  onClose={() => setAdding(false)}
  categories={agenda.categories}
/>
```

Import `Plus` from `lucide-react` and `CreateItemSheet` from `@/components/todos/create-item-sheet`.

`CreateItemSheet` calls `router.refresh()` on success, which re-runs the server component and rebuilds the agenda — the new task appears in the strip and timeline without any client-side cache to invalidate. Confirm that is what it does before relying on it; if it does not, add the refresh.

- [ ] **Step 6: Verify and check it renders**

Run: `npm run verify`
Expected: PASS.

Run: `npm run dev` with `AUTH_DEV_BYPASS=1`, open the dashboard, and confirm: the date header matches your saved timezone, calendar events appear in the timeline, tapping a day in the strip changes the list, and the "Now" marker disappears on days other than today.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: rebuild dashboard around week strip and merged timeline"
```

---

### Task 8: Free-text model entry

**Files:**
- Modify: `src/components/settings/ai-provider-form.tsx`

**Interfaces:**
- Consumes: nothing. `saveAiConfig` already accepts any model string — no server change needed.
- Produces: nothing.

- [ ] **Step 1: Add a custom option**

In `src/components/settings/ai-provider-form.tsx`, append a `{ id: "__custom", label: "Custom…" }` sentinel to the rendered model options. When it is selected, render a text input beneath the select and submit its value as `aiModel`. Seed the input with the current model when it is not in the provider's list, and select `__custom` in that case so a saved custom model survives a revisit.

Never submit the literal `"__custom"`.

- [ ] **Step 2: Verify and commit**

Run: `npm run verify`
Expected: PASS.

```bash
git add -A
git commit -m "feat: allow a custom model id in settings"
```

---

### Task 9: Cron heartbeat and scheduler move

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/services/cron-utils.ts`, `src/app/api/cron/reminders/route.ts`, `.github/workflows/cron-reminders.yml`, `README.md`
- Create: `tests/services/cron-heartbeat.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `touchHeartbeat(job: string, now?: Date): Promise<boolean>` in `cron-utils.ts` — returns `true` when the previous tick was stale (older than `STALE_TICK_MS`), which is the caller's cue to alert.

- [ ] **Step 1: Add the model**

In `prisma/schema.prisma`:

```prisma
model CronHeartbeat {
  job        String   @id
  lastTickAt DateTime @map("last_tick_at") @db.Timestamptz

  @@map("cron_heartbeat")
}
```

```bash
npx prisma migrate dev --name add_cron_heartbeat
npx prisma generate
```

- [ ] **Step 2: Write the failing test**

Create `tests/services/cron-heartbeat.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  cronHeartbeat: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { touchHeartbeat } from "@/lib/services/cron-utils";

const NOW = new Date("2026-08-20T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cronHeartbeat.upsert.mockResolvedValue({});
});

describe("touchHeartbeat", () => {
  it("does not report stale on the first ever tick", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue(null);
    expect(await touchHeartbeat("reminders", NOW)).toBe(false);
  });

  it("reports stale when the previous tick was 20 minutes ago", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "reminders",
      lastTickAt: new Date(NOW.getTime() - 20 * 60 * 1000),
    });
    expect(await touchHeartbeat("reminders", NOW)).toBe(true);
  });

  it("stays quiet when the previous tick was 2 minutes ago", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "reminders",
      lastTickAt: new Date(NOW.getTime() - 2 * 60 * 1000),
    });
    expect(await touchHeartbeat("reminders", NOW)).toBe(false);
  });

  it("writes lastTickAt even when it reports stale", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "reminders",
      lastTickAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    });
    await touchHeartbeat("reminders", NOW);
    expect(mockPrisma.cronHeartbeat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { job: "reminders" } })
    );
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tests/services/cron-heartbeat.test.ts`
Expected: FAIL — `touchHeartbeat` is not exported.

- [ ] **Step 4: Implement**

Add to `src/lib/services/cron-utils.ts`:

```ts
/**
 * A tick older than this means the scheduler stopped. Two missed 5-minute backstop runs,
 * so a single delayed run doesn't cry wolf.
 */
export const STALE_TICK_MS = 15 * 60 * 1000;

/**
 * Record that a cron job ran, and report whether the previous run was too long ago.
 *
 * The failure this exists to catch is silence: a disabled workflow or a dead scheduler
 * produces no error anywhere, and the first sign is a missed reminder days later. A tick
 * that notices the gap turns that into a ping.
 */
export async function touchHeartbeat(job: string, now: Date = new Date()): Promise<boolean> {
  const previous = await prisma.cronHeartbeat.findUnique({ where: { job } });
  await prisma.cronHeartbeat.upsert({
    where: { job },
    create: { job, lastTickAt: now },
    update: { lastTickAt: now },
  });
  if (!previous) return false;
  return now.getTime() - previous.lastTickAt.getTime() > STALE_TICK_MS;
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/services/cron-heartbeat.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire it into the reminders tick**

Near the top of the `POST` handler in `src/app/api/cron/reminders/route.ts`, after the auth check:

```ts
const stale = await touchHeartbeat("reminders", now);
if (stale) {
  await notifyOwner("cron:heartbeat", `No reminders tick for over ${STALE_TICK_MS / 60000} minutes — the scheduler may have stopped.`);
}
```

`notifyOwner` is already imported in this file.

- [ ] **Step 7: Simplify the workflow**

In `.github/workflows/cron-reminders.yml`: change the schedule to `*/15 * * * *`, delete the `for i in 1 2 3 4; do sleep 60 … done` loop and the `reminders_total`/`reminders_failures` accounting around it, leaving a single pass over the four endpoints. Rewrite the header comment: this is now a **backstop**, with cron-job.org as primary. Keep the note about GitHub disabling schedules after 60 days of inactivity — that is exactly why it is no longer primary.

- [ ] **Step 8: Document the scheduler setup**

Add a README subsection under the cron/architecture area: create four cron-job.org jobs against `POST $APP_URL/api/cron/{reminders,sync,briefing,weekly-digest}` with header `Authorization: Bearer $CRON_SECRET`; reminders and sync at 1 minute, briefing and weekly-digest at 5. Note that double-firing with the GitHub backstop is safe because every endpoint claims before it sends.

- [ ] **Step 9: Verify and commit**

Run: `npm run verify`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add cron heartbeat alerting, demote GitHub Actions to backstop"
```

---

### Task 10: Bound the remaining page loads

**Files:**
- Modify: `src/lib/services/item.ts`, `src/app/todos/page.tsx`, `src/app/calendar/page.tsx`, `src/app/todos/[categoryId]/page.tsx`
- Modify: `tests/services/item.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `listItems` gains an optional `doneWithin?: { days: number; take: number }` filter.

- [ ] **Step 1: Write the failing test**

Add to `tests/services/item.test.ts`. The file already mocks `prisma.item.findMany` via `mockPrisma` — reuse it:

```ts
describe("listItemsForBoard", () => {
  it("asks for open items in full and done items only inside the window", async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    await listItemsForBoard("u1", { days: 14, take: 50 });

    expect(mockPrisma.item.findMany).toHaveBeenCalledTimes(2);
    const [openCall, doneCall] = mockPrisma.item.findMany.mock.calls.map((c) => c[0]);

    expect(openCall.where.status).toEqual({ in: OPEN_STATUSES });
    expect(openCall.take).toBeUndefined();

    expect(doneCall.where.status).toBe("done");
    expect(doneCall.take).toBe(50);
    expect(doneCall.orderBy).toEqual({ updatedAt: "desc" });
    expect(doneCall.where.updatedAt.gte).toBeInstanceOf(Date);
  });

  it("concatenates both result sets", async () => {
    mockPrisma.item.findMany
      .mockResolvedValueOnce([{ id: "open" }])
      .mockResolvedValueOnce([{ id: "done" }]);
    const rows = await listItemsForBoard("u1", { days: 14, take: 50 });
    expect(rows.map((r: { id: string }) => r.id)).toEqual(["open", "done"]);
  });
});
```

Add `listItemsForBoard` to the import list at the top of the file.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/services/item.test.ts`
Expected: FAIL — the option is ignored.

- [ ] **Step 3: Implement**

Add a `listItemsForBoard(userId, { days, take })` helper to `src/lib/services/item.ts` that runs two queries and concatenates: all open items (existing `listItems` with `OPEN_STATUSES`), plus `status: "done"` items with `updatedAt: { gte: cutoff }`, `orderBy: { updatedAt: "desc" }`, `take`. Keep the existing `include` shape so callers need no other change.

The unbounded `listItems(userId)` currently pulls every completed item ever created, on every page load — that is the behaviour being replaced.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/services/item.test.ts`
Expected: PASS.

- [ ] **Step 5: Switch the three pages**

In `src/app/todos/page.tsx`, `src/app/calendar/page.tsx` and `src/app/todos/[categoryId]/page.tsx`, replace `listItems(user.id)` with `listItemsForBoard(user.id, { days: 14, take: 50 })`.

- [ ] **Step 6: Verify and commit**

Run: `npm run verify`
Expected: PASS.

```bash
git add -A
git commit -m "perf: bound completed items on board pages"
```

---

### Task 11: Reconcile the docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Strip what no longer exists**

Remove from the README: the whole **School** feature section; `/courses`, `/exams`, `/due` from the command table; `create_course`, `list_courses`, `archive_course` from the tools table; "Smart recommendations" from the AI section; and the kind-aware escalation wording under Notifications (deadline escalation now has one ladder: 24h / 2h / overdue).

- [ ] **Step 2: Fix the drifted parts**

The tools table said 16 when there were 17. After this plan there are **14** — recount against `AI_TOOLS` rather than trusting the prose:

Run: `rtk proxy grep -c '^    name: "' src/lib/services/ai-tools.ts`

Update the architecture diagram: the cron section should name cron-job.org as primary with GitHub Actions as backstop, and drop the `t=0,1,…,4` inner-loop notation.

- [ ] **Step 3: Describe the dashboard as built**

Rewrite the dashboard paragraph: a week strip driving a day timeline that merges tasks, reminders and calendar events, with events read from the local mirror rather than the Google API. Note that there is no AI on the dashboard — the agent lives in Telegram.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: reconcile README with removed features and new dashboard"
```
