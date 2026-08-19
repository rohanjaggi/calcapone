# Calcapone

A Telegram-first task and calendar assistant. Manage todos, reminders, and Google Calendar events through natural language in Telegram — or via the web dashboard.

## Features

### Core
- **Natural language input** — type freely in Telegram, AI parses intent and takes action
- **Voice notes** — send a voice message in Telegram and it's transcribed + processed automatically
- **Slash commands** — `/todo`, `/remind`, `/event`, `/done`, `/today`, `/list`, `/timezone` for quick entry
- **Subtasks** — break tasks into smaller pieces manually or via AI decomposition
- **Global search** — Cmd+K on web, or ask "find my task about X" in Telegram

### Calendar
- **Google Calendar sync** — create, update, delete events; conflict detection; agenda view
- **Schedule suggestions** — AI recommends optimal time slots based on your calendar

### Notifications
- **Recurring reminders** — daily, weekly, or monthly with automatic rescheduling
- **Deadline escalation** — progressive alerts at 24h, 2h before due, and when overdue
- **Morning briefing** — AI-generated daily summary at your chosen time
- **Weekly digest** — configurable day/time recap of completed, overdue, and upcoming work
- **Quiet hours** — suppress notifications during a time window (e.g., 23:00–07:00)
- **Priority filter** — only get pinged for medium+ or high-priority items

### AI
- **Conversation memory** — multi-turn context (last 10 messages, 4h window) for natural follow-ups
- **Task decomposition** — "break down my presentation prep" creates subtasks automatically
- **Smart recommendations** — dashboard suggests your top 3 priority tasks
- **Multi-provider** — OpenAI, Anthropic, Gemini, or OpenRouter with your own key

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
Telegram message (text or voice)
  → /api/telegram (webhook)
  → Voice? → OpenAI transcription → text
  → Slash command? → DB-direct handler (/done, /today, /list, /timezone)
  → Otherwise    → AI chat path (parses intent, calls tools)
                    → conversation history loaded (last 10 msgs, 4h)
                    → execute-tool.ts (CRUD items, calendar, search, decompose)
                    → response saved to conversation memory

Web dashboard
  → Server actions → same service layer
  → Cmd+K search dialog → searchItems service

Cron jobs (GitHub Actions hits all three; ticks may be minutes late, endpoints are idempotent):
  → /api/cron/briefing       — AI morning summary (once/day, within 2h of the chosen time)
  → /api/cron/reminders      — fires due reminders + deadline escalation
  → /api/cron/weekly-digest  — configurable weekly recap (once/day on the chosen weekday)
```

## Telegram Commands

| Command | What it does |
|---------|-------------|
| `/todo buy groceries by Friday` | Creates a task with AI-parsed due date |
| `/remind take meds daily at 9am` | Sets a recurring reminder |
| `/event lunch tomorrow noon` | Creates a calendar event |
| `/done buy groceries` | Marks matching task complete (asks which, if several match) |
| `/today` | Shows agenda: overdue, today's tasks, upcoming events |
| `/list` | Lists all open items |
| `/timezone` | Shows your timezone; `/timezone Europe/London` changes it |
| `/help` | Shows available commands |

You can also just type naturally — "move my dentist appointment to 3pm", "break down my presentation prep", or "find that task about the client meeting" — and the AI handles it. Voice messages work too.

## AI Tools

The AI has access to 14 tools:

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
| `search_items` | Search tasks by keyword |
| `decompose_task` | Break task into subtasks |
