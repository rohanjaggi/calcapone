# Calcapone

A Telegram-first task and calendar assistant. Manage todos, reminders, and Google Calendar events through natural language in Telegram — or via the web dashboard.

## Features

- **Natural language input** — type freely in Telegram, AI parses intent and takes action
- **Slash commands** — `/todo`, `/remind`, `/event`, `/done`, `/today`, `/list` for quick entry
- **Google Calendar sync** — create, update, delete events; conflict detection; agenda view
- **Recurring reminders** — daily, weekly, or monthly with automatic rescheduling
- **Morning briefing** — AI-generated daily summary at your chosen time
- **Weekly digest** — configurable day/time recap of completed, overdue, and upcoming work
- **Quiet hours** — suppress notifications during a time window (e.g., 23:00–07:00)
- **Priority filter** — only get pinged for medium+ or high-priority items
- **Conversational follow-ups** — "actually make that 10am" works without repeating context
- **Multi-provider AI** — OpenAI, Anthropic, Gemini, or OpenRouter with your own key

## Stack

- **Next.js 14** (App Router, server actions)
- **Prisma + PostgreSQL** (Supabase)
- **Telegram Bot API** (webhooks)
- **Google Calendar API** (OAuth2)
- **OpenAI / Anthropic / Gemini SDKs**

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
Telegram message
  → /api/telegram (webhook)
  → Slash command? → DB-direct handler (/done, /today, /list)
  → Otherwise    → AI chat path (parses intent, calls tools)
                    → execute-tool.ts (CRUD items, calendar ops)
                    → response + last-action context saved

Cron jobs (external trigger every minute):
  → /api/cron/briefing   — morning summary
  → /api/cron/reminders  — fires due reminders (respects quiet hours + priority)
  → /api/cron/weekly-digest — configurable weekly recap
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

You can also just type naturally — "move my dentist appointment to 3pm" or "what do I have tomorrow" — and the AI handles it.
