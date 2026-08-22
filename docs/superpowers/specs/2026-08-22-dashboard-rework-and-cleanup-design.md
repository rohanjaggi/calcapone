# Dashboard rework and cleanup

**Date:** 2026-08-22
**Status:** Approved for implementation

## Problem

Calcapone is two products sharing a service layer: a well-designed Telegram
agent, and a Mini App dashboard that is a weaker echo of it. Three specific
consequences:

1. **The dashboard's AI features are worse versions of the bot.** `AiInput`
   is single-shot with no tool loop, no undo, and no disambiguation, offered
   inside a Mini App the user opened *from* the chat where the good version
   lives. `AiRecommendation` spends a model call re-ranking a list already
   sorted by priority and due date, and its cache key invalidates whenever
   any item changes.
2. **The dashboard has never shown a calendar event.** `TimelineItem` has a
   `type: "event"` variant and `DayTimeline` renders it completely, but
   `buildTimeline` only iterates items and always emits `type: "item"`. The
   rendering half exists and is never fed.
3. **School features live only in Telegram.** No component references
   `course`, `exam`, `assignment`, or `kind`. The owner has one semester of
   real use and does not want to invest in closing the gap.

Alongside these: unbounded page loads, a hardcoded model dropdown, a cron
schedule that GitHub silently disables, and a `Greeting` timezone bug.

## Decisions

Two forks were settled by the owner before design:

- **School: remove entirely.** Not collapsed into categories, not badged on
  the web. The seeded "School" category remains as the home for school work.
  Accepted cost: the exam-warns-a-week ladder and `/exams`, `/due`,
  `/courses` are lost.
- **Dashboard: week strip driving a merged timeline.** `StatsRow` stays
  exactly as it is — priority counts, no `AttentionRow`.

## Design

### Phase 0 — Deletions

**Dashboard AI.** Delete `ai-input.tsx` and `ai-recommendation.tsx`; delete
`aiAddItem` and `getAiRecommendation` from `app/actions.ts`. This orphans
`User.aiSuggestionEnabled`, which is removed from the schema, `settings/page.tsx`,
`settings-client.tsx`, `notifications-config.tsx`, `saveNotifications`, and
`updateUserSettings`.

`chatWithAi`'s tool-calling branch then has no callers — the morning briefing
is its only consumer and passes `tools: false`. Drop the `ChatOptions`
parameter and the tool wiring rather than leaving a dead branch.

**how-to-use.** Delete `app/how-to-use/page.tsx` and its Settings link. Its
content survives in two places only: the README (canonical) and the `/help`
command text.

**isKnownModel.** Delete from `lib/models.ts`. Exported, never called.

**School.** A Prisma migration drops the `courses` table, the `ItemKind`
enum, and `items.kind` / `items.course_id`, with their indexes. Then:

| File | Change |
|---|---|
| `services/course.ts` | delete |
| `services/ai-tools.ts` | drop `create_course`, `list_courses`, `archive_course`; drop `kind`/`course` params from `create_item`, `update_item`, `list_items`; drop school rules and examples from the system prompt |
| `services/execute-tool.ts` | drop those three handlers, `asKind`, and course resolution |
| `services/commands/handlers.ts` | drop `handleCourses`, `handleExams`, `handleDue` |
| `services/commands/index.ts` | drop the three from `DB_COMMANDS` and the dispatch |
| `services/escalation.ts` | collapse four kind-keyed ladders to one array (24h / 2h / overdue); drop `ESCALATION_KINDS` and `ladderFor`'s kind parameter |
| `services/item.ts` | simplify `getEscalationCandidates` to bound on the single ladder length |
| `services/tool-outcome.ts`, `services/action-log.ts` | drop `kind` / `courseId` from `ItemSnapshot` |
| `api/cron/reminders/route.ts` | drop `item.kind` from the escalation call and `createNextOccurrence` |
| `services/telegram.ts` | drop `/exams`, `/due`, `/courses` from `setMyCommands` |

Tests: delete `course.test.ts`; update `escalation`, `execute-tool`,
`handlers`, `commands/index`, `item`, `item-completion`,
`cron-reminders-recurrence`.

Re-run `POST /api/telegram/register` after deploy so BotFather's command list
matches. Take a database snapshot first — this is the only irreversible step
in the plan.

**Dead REST routes.** Delete `api/items/route.ts`, `api/items/[id]/route.ts`,
`api/categories/route.ts`, `api/categories/[id]/route.ts`, and
`api/settings/route.ts`. Zero callers in `src` or `tests`. `POST /api/items`
is a live authenticated write path that skips the undo journal, so this is a
correctness fix as much as a cleanup. The Google OAuth routes under
`api/settings/google/` stay — they are load-bearing.

### Phase 1 — Agenda data layer

New `src/lib/services/agenda.ts`, one entry point:

```ts
getAgenda(userId, tz, anchorDate, days = 7): Promise<{
  priorityCounts: Record<Priority, number>;   // feeds StatsRow unchanged
  strip: Array<{ date: string; taskCount: number; eventCount: number }>;
  byDay: Record<string, TimelineEntry[]>;
}>
```

Two indexed queries, no network call:

- Open items (`OPEN_STATUSES`) for the window, via `[userId, status, dueDate]`.
- `calendarEvent.findMany` for the window, via `[userId, startsAt]`.

Calendar events come from the local mirror, not the Google API. The mirror
covers −7 to +90 days (`calendar-sync.ts`) and the cron refreshes it every
~4 minutes, so a 7-day dashboard window is always well inside it. This is why
the dashboard needs no `useStreamed`, no promise streaming, and no token
refresh.

`priorityCounts` is computed server-side over all open items, not just the
window, preserving `StatsRow`'s current meaning ("what's left, and how much
of it is urgent"). `StatsRow` itself is unchanged.

`lib/timeline.ts` is rewritten as `buildTimeline(items, events, tz, day)`,
emitting both variants. Existing bucketing rules are preserved: `remindAt` is
an absolute instant whose day depends on `tz`; `dueDate` is already
wall-clock and *is* the day. Events bucket on `startsAt` in `tz`, and all-day
events sort before timed ones.

All seven days ship in the initial server payload. It is tens of rows, so
day-switching is pure client state — no server action, no loading state.

### Phase 2 — Dashboard rebuild

Order: `Greeting` → `StatsRow` → `WeekStrip` → `DayTimeline` → Quick Add.

- **`Greeting`** is finally passed `timezone`. It accepts the prop today
  (`greeting.tsx:38`) but `dashboard-client.tsx:32` renders
  `<Greeting name={userName} />`, so the date header reads the browser's zone
  rather than the saved one. One-line fix.
- **`StatsRow`** unchanged, now fed `priorityCounts` from the server.
- **`WeekStrip`** (new) — seven cells anchored on today, a density dot per
  day, tap to select. Selected day is client state owned by `DashboardClient`.
- **`DayTimeline`** takes the selected day's entries. The "Now" marker
  renders only when the selected day is today; its existing
  `now === null`-until-mounted hydration guard is preserved.
- **Quick Add** reuses `CreateItemSheet` and the existing deterministic
  `addItem` action. No new form, no model call.

### Phase 3 — Small wins

**Free-text model.** `ai-provider-form.tsx` gains a "Custom…" option in the
model select that reveals a text input. `saveAiConfig` already does not
validate the model string, so no server change is needed.

**Cron.** Move primary scheduling to cron-job.org: `/api/cron/reminders` and
`/api/cron/sync` at 1 minute, briefing and weekly-digest at 5. Delete the
`sleep 60` inner loop from `cron-reminders.yml` and drop its schedule to
`*/15` as a backstop. Double-firing is safe — every endpoint already claims
before it sends.

Add a `CronHeartbeat` model (one row per job name, `lastTickAt`). When a tick
finds the previous one older than 15 minutes, `notifyOwner`. This converts
"reminders silently stopped days ago" into a Telegram ping and is the highest-
value piece regardless of which scheduler runs.

**Bounded page loads.** The dashboard stops loading everything by construction
once it reads through `getAgenda`. `/todos` and `/calendar` still call
`listItems(userId)` with no filter, pulling every completed item ever created;
they get open items in full plus done items restricted to those completed in
the last 14 days, capped at 50 rows.

## Testing

- `agenda.test.ts` — window bounds, event/item merge ordering, all-day sort,
  timezone bucketing at a midnight boundary, `priorityCounts` spanning the
  whole open set rather than the window.
- `timeline.test.ts` — extended for the `type: "event"` variant; existing
  cases must keep passing.
- Escalation tests collapse from four ladders to one; the "tightest rung the
  deadline satisfies" rule is preserved and must keep its coverage.
- Every touched test file must pass `npm run verify` (lint, typecheck, test).

## Out of scope

- `/calendar`'s month grid still calls Google directly. The mirror covers +90
  days, so it could read Postgres and delete `useStreamed` and
  `getCalendarMonth` — a real simplification, deliberately deferred.
- `/api/cron/sync`'s full-table scan of connected users. Correct at this
  scale; only breaks at thousands of users.
- The dual `recurring` enum / `recurrenceRule` representation.
