# Calcapone

A Telegram-first task and calendar assistant. Manage todos, reminders, and Google Calendar events through natural language in Telegram — or via the web dashboard.

## Features

### Core
- **Natural language input** — type freely in Telegram, AI parses intent and takes action
- **Agentic tool loop** — the model sees what each tool returned and can chain up to 3 rounds, so "find the dentist task and push it to Friday" works in one sentence and "what's on this week?" gets a real summary instead of a raw dump
- **Voice notes** — transcribed, echoed back as `🎤 Heard: …` before the model runs, then processed
- **Photos & screenshots** — send a poster, timetable or syllabus screenshot and it becomes events or tasks (needs a vision-capable model)
- **Forwarded messages** — become tasks, with a `Forwarded from …` source line (and a `t.me` link where one exists) in the description
- **Slash commands** — `/todo`, `/remind`, `/event`, `/note`, `/done`, `/today`, `/week`, `/list`, `/search`, `/undo`, `/timezone`, plus the school commands below
- **Subtasks** — break tasks into smaller pieces manually or via AI decomposition
- **Global search** — Cmd+K on web, or ask "find my task about X" in Telegram

### Chat interactions
- **Reminder buttons** — every reminder arrives with ✅ Done · ⏰ 10m · ⏰ 1h · 🌙 Tomorrow; the message rewrites itself into its own receipt
- **Undo** — every change is journalled with a compensating action. `/undo` walks back one step at a time for 24h, and single changes carry an inline ↩️ button
- **Disambiguation** — when a title matches several tasks the bot offers buttons instead of guessing, then re-runs the original call against the exact item you picked
- **Positional and reply targeting** — `/done 3` uses the numbering `/list` printed, and replying "done" or "move it to Friday" to any bot message targets whatever that message was about

### Calendar
- **Google Calendar sync** — create, update, delete events; conflict detection; agenda view
- **Two-way sync** — incremental `syncToken` polling pulls Google's edits back; when both sides changed since they last agreed you get *Keep mine / Take Google's* buttons rather than a silent overwrite
- **Event-start reminders** — "📅 Standup starts in 15 min", from a local mirror of your calendar so events created in Google are covered too
- **Schedule suggestions** — AI recommends optimal time slots based on your calendar

### Notifications
- **Recurring reminders** — daily, weekly, monthly or any RRULE, with automatic rescheduling
- **Recurring tasks** — due-date-only repeats roll forward when you complete them, not just when a reminder fires
- **Series editing** — "stop the daily meds reminder" (`scope: series`) and "skip this week" (`skip_next`)
- **Deadline escalation** — progressive alerts at 24h, 2h, and overdue
- **Morning briefing** — AI-generated daily summary at your chosen time
- **Weekly digest** — configurable day/time recap of completed, overdue, and upcoming work
- **Quiet hours** — suppress notifications during a time window (e.g., 23:00–07:00)
- **Priority filter** — only get pinged for medium+ or high-priority items

### AI
- **Conversation memory** — multi-turn context (last 10 messages, 4h window) for natural follow-ups
- **Task decomposition** — "break down my presentation prep" creates subtasks automatically
- **Multi-provider** — OpenAI, Anthropic, Gemini, or OpenRouter with your own key. One provider-neutral thread type with a thin adapter each, so the tool loop behaves identically on all four

There is deliberately no AI on the web dashboard. The agent lives in Telegram,
where the tool loop, the undo journal and the disambiguation buttons all are; a
second, half-featured entry point could create items that nothing could reverse.

### Web dashboard
The Mini App is for seeing and touching your tasks — the things a chat window is
bad at. Everything below is direct manipulation, no model involved.

- **Dashboard** — a seven-day strip drives a timeline that merges tasks, reminders **and**
  calendar events for the chosen day; today's view marks where "now" falls
- **Tasks** — categories are colored cards; tap a card's header to open it
- **Complete** — tap the circle icon on any task
- **Edit / delete** — swipe a task left to reveal both
- **Reorder** — enter edit mode from the header to drag categories, or drag a task between categories
- **Calendar** — a month grid with dots on days that have something; tap a day to see it
- **Search** — the icon on the home screen, or `Cmd+K` / `Ctrl+K`; results filter as you type

## Stack

- **Next.js 16** (App Router, server actions)
- **Prisma 7 + PostgreSQL** (Supabase)
- **Telegram Bot API** (webhooks)
- **Google Calendar API** (OAuth2)
- **OpenAI SDK** (chat + transcription)
- **Anthropic / Gemini SDKs** (alternative providers)
- **Tailwind CSS 4 + Framer Motion**

## Setup

```bash
npm install
cp .env.example .env.local  # fill in credentials
npx prisma migrate deploy
npx prisma generate
npm run dev
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret for webhook validation |
| `TELEGRAM_USER_ID` | Your Telegram user id — the owner (exempt from the trial cap; dev-bypass user) |
| `SESSION_SECRET` | ≥32-char secret for signing web session cookies (`openssl rand -hex 32`) |
| `AUTH_DEV_BYPASS` | Local dev only: `1` signs you in as `TELEGRAM_USER_ID` without Telegram |
| `CRON_SECRET` | Bearer token for cron/admin endpoints (required — endpoints fail closed without it) |
| `DEFAULT_AI_PROVIDER` | `openai`, `anthropic`, `gemini`, or `openrouter` |
| `DEFAULT_AI_API_KEY` | Shared "trial" key for users who haven't set their own (only used with `DEFAULT_AI_PROVIDER`) |
| `DEFAULT_AI_MODEL` | Model ID (e.g., `gemini-3.7-flash`, `gpt-5.6-terra`, `claude-sonnet-5`) |
| `TRIAL_DAILY_LIMIT` | AI messages/day for users on the shared key (default 30; owner + BYOK users exempt) |
| `GEMINI_API_KEY` | Semantic-search embeddings (`gemini-embedding-001`, 768d). Optional — without it *and* `OPENAI_API_KEY`, search falls back to keywords only |
| `OPENAI_API_KEY` | Voice-note transcription (OpenAI-only), and the embedding fallback (`text-embedding-3-small` at 768d) when `GEMINI_API_KEY` is unset |
| `TRANSCRIBE_API_KEY` | Optional: a separate OpenAI key for transcription, if you don't want to reuse `OPENAI_API_KEY` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `https://your-domain/api/settings/google/callback` |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting stored API keys and Google tokens (AES-256-GCM; also signs OAuth state) |
| `OAUTH_STATE_SECRET` | Optional: separate secret for signing Google OAuth state (falls back to `ENCRYPTION_KEY`) |
| `NEXT_PUBLIC_APP_URL` | Public origin, e.g. `https://your-domain.com`. Used to build OAuth redirects and register the webhook — not the `Host` header |
| `DIRECT_DATABASE_URL` | Optional: unpooled connection for `prisma migrate`. A transaction-mode pooler can't run migrations |
| `DATABASE_POOL_MAX` | Optional: connections per instance (default 5) |

### Register the bot

After deploying, hit the registration endpoint once to configure the webhook, commands, and the menu button (which opens the dashboard as a Telegram Mini App):

```bash
curl -X POST https://your-domain.com/api/telegram/register \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Login (Telegram Mini App only)

The dashboard is a **Telegram Mini App** — it is not meant to be used as a standalone website. The bot's menu button opens `/login` inside Telegram, which validates `window.Telegram.WebApp.initData` server-side (HMAC) and exchanges it for a signed session cookie (`SESSION_SECRET`, 30 days). Opening the URL in a normal browser shows a "open from Telegram" message and cannot sign in — there is no browser login.

- **Local dev** — set `AUTH_DEV_BYPASS=1` and `TELEGRAM_USER_ID` to work on the dashboard without Telegram.

Telegram **Web** and **Desktop** run Mini Apps in a cross-site iframe, so the session cookie is issued `SameSite=None; Secure` — which means the deployment must be served over HTTPS. Local HTTP development falls back to `SameSite=Lax` (first-party there anyway).

### Trial mode

Anyone can message the bot. Users without their own API key use `DEFAULT_AI_API_KEY` and get `TRIAL_DAILY_LIMIT` AI messages per day (slash commands like `/today` and `/list` don't count). The owner (`TELEGRAM_USER_ID`) and users who add their own key in Settings are unlimited.

### Connecting Google Calendar

Google refuses OAuth inside embedded webviews, so **Connect** opens the consent screen in the
system browser via `Telegram.WebApp.openLink`. That browser carries none of the Mini App's
cookies, so the callback is authenticated by the `state` parameter alone: it is HMAC-signed,
carries the user id, expires after 10 minutes, and its nonce is stored in `oauth_states` and
deleted on use, so a captured callback URL can't be replayed. The callback finishes on the
public `/google/done` page, which just tells the user to return to Telegram.

Set `GOOGLE_REDIRECT_URI` to `https://your-domain/api/settings/google/callback` and make sure
`NEXT_PUBLIC_APP_URL` matches your deployment.

### Database migrations

`prisma/migrations` starts from a baseline (`20260601000000_init`). For a fresh database run `npx prisma migrate deploy`. For an existing database that predates the baseline, mark it applied once: `npx prisma migrate resolve --applied 20260601000000_init`, then `npx prisma migrate deploy`. Semantic search needs the `vector` extension (the migration creates it).

## Architecture

```
Telegram update
  → /api/telegram (webhook, deduped on update_id, always 200)
  → callback_query? → button handler (done / snooze / undo / pick / calendar conflict)
  → Voice?          → transcription → "🎤 Heard: …" echo → text
  → Photo?          → downloaded, sent to the model as an image
  → Slash command?  → DB-direct handler (no AI call, no trial quota)
  → Otherwise       → agent loop (ai.ts)
                       ├─ conversation history (last 10 msgs, 4h)
                       ├─ reply-to context, forwarded-message source
                       └─ up to 3 rounds:
                            model → tool calls → execute-tool.ts → results back to model
                       → mutations journalled to action_log (undo)
                       → numbered output remembered in message_refs (/done 3, replies)

Web dashboard
  → Dashboard → getAgenda (agenda.ts): 7 days of items + calendar events in one payload.
                Events are read from the local calendar_events mirror, never the Google API —
                the mirror spans -7/+90 days and the cron refreshes it every ~4 min, so the
                page renders server-side with no token refresh. Day switching is client-only.
  → Server actions → same service layer
  → Cmd+K search dialog → searchItems service

Cron (cron-job.org primary, GitHub Actions backstop; every endpoint is idempotent):
  every 1 min → /api/cron/reminders      — due reminders + deadline escalation + housekeeping
  every 1 min → /api/cron/sync           — Google syncToken pull (≤1 per user per 4 min)
                                           + event-start reminders
  every 5 min → /api/cron/briefing       — AI morning summary (once/day, within 2h of target)
  every 5 min → /api/cron/weekly-digest  — weekly recap (once/day on the chosen weekday)
```

### Scheduling the cron

Create four jobs at [cron-job.org](https://cron-job.org) (free, 1-minute granularity,
execution history, email alerts on failure). Each is a **POST** to
`$NEXT_PUBLIC_APP_URL/api/cron/<name>` with the header
`Authorization: Bearer $CRON_SECRET`:

| Endpoint | Interval |
|----------|----------|
| `/api/cron/reminders` | 1 minute |
| `/api/cron/sync` | 1 minute |
| `/api/cron/briefing` | 5 minutes |
| `/api/cron/weekly-digest` | 5 minutes |

`.github/workflows/cron-reminders.yml` fires the same four every 15 minutes as a backstop.
Running both is safe: every endpoint claims before it sends, so a double tick cannot
double-send. GitHub is the backstop rather than the primary because it throttles and drops
scheduled runs under load, and **disables scheduled workflows entirely after 60 days without
a commit** — if reminders stop, check the Actions tab for a disabled workflow first.

`/api/cron/reminders` also self-monitors: a tick that finds the previous one was more than 15
minutes ago DMs the owner (`TELEGRAM_USER_ID`), so a dead scheduler announces itself instead
of failing silently.

## Telegram Commands

| Command | What it does |
|---------|-------------|
| `/todo buy groceries by Friday` | Creates a task with AI-parsed due date |
| `/remind take meds daily at 9am` | Sets a recurring reminder |
| `/event lunch tomorrow noon` | Creates a calendar event |
| `/note pick up dry cleaning` | Captures a note instantly — no AI call, no quota |
| `/done buy groceries` | Marks matching task complete (offers buttons if several match) |
| `/done 3` | Completes the 3rd item from the last numbered list the bot printed |
| `/today` | Shows agenda: overdue, today's tasks, upcoming events |
| `/week` | The next 7 days, grouped by day |
| `/list` | Lists all open items |
| `/search milk` | Finds items by keyword or meaning |
| `/undo` | Reverses your last change; repeat to walk back further (24h) |
| `/alerts 15` | Ping 15 min before a calendar event starts; `/alerts off` disables |
| `/timezone` | Shows your timezone; `/timezone Europe/London` changes it |
| `/help` | Shows available commands |

You can also just type naturally — "move my dentist appointment to 3pm", "break down my presentation prep", or "find the dentist task and push it to Friday" — and the AI handles it. Voice notes, photos of posters or timetables, and forwarded messages all work too.

**Replying targets things.** Reply "done" to a reminder and it completes that reminder. Reply "move it to Friday" to a line in `/list` and it moves that item. No need to name it again.

## AI Tools

The model sees the result of every tool it calls and may chain up to 3 rounds per message, so it can look something up and then act on what it found. Read-only results go to the model only (you get its summary); changes print their own receipt with an ↩️ Undo button.

The 14 tools:

| Tool | Purpose |
|------|---------|
| `create_item` | Create task or reminder |
| `list_items` | List items with filters |
| `complete_item` | Mark task done |
| `delete_item` | Delete task |
| `update_item` | Reschedule, rename, change priority |
| `get_calendar` | Fetch calendar events |
| `create_calendar_event` | Create Google Calendar event |
| `update_calendar_event` | Update calendar event |
| `delete_calendar_event` | Delete calendar event |
| `suggest_schedule` | Find optimal time slots |
| `create_category` | Create a new category |
| `list_categories` | List categories |
| `search_items` | Search tasks by keyword or meaning |
| `decompose_task` | Break task into subtasks |

`update_item` and `delete_item` take `scope` (`this` / `series`) and `update_item` takes `skip_next`, which is how "stop the daily meds reminder" and "skip this week" are expressed.
