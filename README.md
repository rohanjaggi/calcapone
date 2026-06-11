# Calcapone

A Telegram-first task and calendar assistant. Manage todos, reminders, and Google Calendar events through natural language in Telegram — or via the web dashboard.

## Features

### Core
- **Natural language input** — type freely in Telegram, AI parses intent and takes action
- **Voice notes** — send a voice message in Telegram and it's transcribed + processed automatically
- **Slash commands** — `/todo`, `/remind`, `/event`, `/done`, `/today`, `/list` for quick entry
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
| `CRON_SECRET` | Bearer token for cron endpoints |
| `DEFAULT_AI_PROVIDER` | `openai`, `anthropic`, `gemini`, or `openrouter` |
| `DEFAULT_AI_API_KEY` | Fallback API key if user hasn't set their own |
| `DEFAULT_AI_MODEL` | Model ID (e.g., `gpt-4o`, `claude-sonnet-4-20250514`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting stored API keys |

### Register the bot

After deploying, hit the registration endpoint once to configure the webhook and commands:

```bash
curl -X POST https://your-domain.com/api/telegram/register \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Architecture

```
Telegram message (text or voice)
  → /api/telegram (webhook)
  → Voice? → OpenAI transcription → text
  → Slash command? → DB-direct handler (/done, /today, /list)
  → Otherwise    → AI chat path (parses intent, calls tools)
                    → conversation history loaded (last 10 msgs, 4h)
                    → execute-tool.ts (CRUD items, calendar, search, decompose)
                    → response saved to conversation memory

Web dashboard
  → Server actions → same service layer
  → Cmd+K search dialog → searchItems service

Cron jobs (external trigger every minute):
  → /api/cron/briefing       — AI morning summary
  → /api/cron/reminders      — fires due reminders + deadline escalation
  → /api/cron/weekly-digest  — configurable weekly recap
```

## Telegram Commands

| Command | What it does |
|---------|-------------|
| `/todo buy groceries by Friday` | Creates a task with AI-parsed due date |
| `/remind take meds daily at 9am` | Sets a recurring reminder |
| `/event lunch tomorrow noon` | Creates a calendar event |
| `/done buy groceries` | Marks matching task complete |
| `/today` | Shows agenda: overdue, today's tasks, upcoming events |
| `/list` | Lists all pending items |
| `/help` | Shows available commands |

You can also just type naturally — "move my dentist appointment to 3pm", "break down my presentation prep", or "find that task about the client meeting" — and the AI handles it. Voice messages work too.

## AI Tools

The AI has access to 15 tools:

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
