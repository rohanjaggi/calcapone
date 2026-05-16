# Calcapone — Design Spec

AI-powered Telegram bot with Google Calendar integration, todo list, reminders, and a web dashboard.

## Overview

Calcapone is a monolithic Next.js application that serves two interfaces:
1. **Telegram bot** — primary interface for natural language interaction
2. **Web dashboard** — visual companion for managing todos, reminders, and calendar

The bot acts as a smart assistant: it parses natural language into structured actions, proactively suggests schedule optimizations, and delivers reminders. A small group of users (owner + friends) each connect their own Google Calendar and manage their own data.

## Architecture

Single Next.js app. The Telegram bot webhook and web dashboard share a common service layer and PostgreSQL database.

```
┌─────────────────────────────────────────────────┐
│                  Next.js App                     │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  Dashboard    │  │  API Routes             │  │
│  │  (React/SSR)  │  │                         │  │
│  │  - Todos      │  │  POST /api/telegram     │  │
│  │  - Calendar   │  │  GET  /api/auth/google  │  │
│  │  - Reminders  │  │  CRUD /api/todos        │  │
│  │  - Settings   │  │  CRUD /api/reminders    │  │
│  └──────┬───────┘  └──────────┬──────────────┘  │
│         │                     │                  │
│  ┌──────▼─────────────────────▼──────────────┐  │
│  │          Service Layer                     │  │
│  │  - AI Service (OpenAI)                     │  │
│  │  - Calendar Service (Google Calendar API)  │  │
│  │  - Todo Service                            │  │
│  │  - Reminder Service                        │  │
│  │  - Telegram Service (send/receive msgs)    │  │
│  └──────────────────┬───────────────────────┘   │
│                     │                            │
│  ┌──────────────────▼───────────────────────┐   │
│  │          Data Layer (Prisma + PostgreSQL)  │  │
│  │  - users, todos, reminders, categories     │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Data Model

### users
| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| telegram_id | bigint, unique | |
| telegram_username | text | |
| google_refresh_token | text, nullable | encrypted at rest |
| google_calendar_id | text, nullable | |
| timezone | text | default 'UTC' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### categories
| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| user_id | FK → users | |
| name | text | |
| color | text, nullable | hex color for dashboard display |
| created_at | timestamptz | |

Unique constraint on (user_id, name).

### todos
| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| user_id | FK → users | |
| category_id | FK → categories, nullable | |
| title | text | |
| description | text, nullable | |
| status | enum: pending, in_progress, done | |
| priority | enum: low, medium, high | |
| due_date | timestamptz, nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### reminders
| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| user_id | FK → users | |
| category_id | FK → categories, nullable | |
| todo_id | FK → todos, nullable | optional link to a todo |
| message | text | |
| remind_at | timestamptz | |
| recurring | enum: none, daily, weekly, monthly | |
| status | enum: pending, sent, cancelled | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## AI Service

### Provider
OpenAI GPT with function calling.

### System Prompt Behavior
The AI receives each Telegram message with a system prompt defining available tools and the user's context (timezone, name). It interprets natural language and returns structured tool calls.

### Available Tools
- `create_todo` — title, description, priority, category, due_date
- `create_reminder` — message, remind_at, recurring, category, linked todo
- `list_todos` — optional filters: status, category, date range
- `complete_todo` — mark a todo as done
- `delete_todo` — remove a todo
- `list_reminders` — optional filters: status, category
- `cancel_reminder` — cancel a pending reminder
- `get_calendar` — fetch upcoming events for a time range
- `suggest_schedule` — suggest when to tackle todos based on free calendar slots
- `create_category` — create a new category
- `list_categories` — list user's categories

### Proactive Features
- **Morning briefing** — daily summary of today's events, pending todos, and reminders. Opt-in, user configures the time in settings.
- **Schedule suggestions** — when asked or proactively, identifies free calendar slots and suggests which todos to work on.
- **Smart categorization** — auto-suggests a category when items are created without one.
- **Natural follow-ups** — responding "Done!" after a reminder fires marks the linked todo as complete.

## Telegram Bot

### Message Flow
1. User sends message to Telegram bot
2. Telegram delivers to `POST /api/telegram` webhook
3. API route loads user context (timezone, preferences) from DB
4. Message + context sent to AI service
5. AI returns tool calls (create_todo, create_reminder, etc.)
6. Service layer executes each tool call against the DB / Google Calendar
7. Results formatted and sent back to user via Telegram API

### Commands
Standard Telegram bot commands as shortcuts:
- `/start` — onboarding, create user record
- `/todos` — list pending todos
- `/reminders` — list pending reminders
- `/today` — today's briefing (events + todos + reminders)
- `/settings` — link to web dashboard settings page

Natural language is the primary interface; commands are convenience shortcuts.

## Reminder Delivery

A **GitHub Actions cron job** runs every minute:
1. Calls a secured API endpoint (e.g., `POST /api/cron/reminders` with a secret)
2. The endpoint queries `reminders WHERE remind_at <= now AND status = pending`
3. Sends a Telegram message for each due reminder
4. Marks reminders as `sent`
5. For recurring reminders, creates the next occurrence based on the recurrence rule

The morning briefing is also triggered by the same cron mechanism, checking for users whose briefing time matches the current time.

## Web Dashboard

### Auth
Telegram Login Widget ties the web session to the user's Telegram identity. NextAuth.js manages sessions with a Telegram provider.

### Pages
- `/` — Overview: today's events, upcoming reminders, pending todos
- `/todos` — Full todo list with filters (status, category, priority), CRUD operations
- `/reminders` — Reminder list with filters (status, category, recurring), CRUD operations
- `/calendar` — Google Calendar view with todos and reminders overlaid
- `/settings` — Timezone, morning briefing time, Google Calendar connect/disconnect

### Google Calendar OAuth
Initiated from `/settings`. The OAuth callback stores the refresh token (encrypted) in the user record. The calendar service uses it to fetch/create events on behalf of the user.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Auth | NextAuth.js (Telegram provider) |
| AI | OpenAI GPT (function calling) |
| Calendar | Google Calendar API |
| Bot | Telegram Bot API (webhook mode) |
| Cron | GitHub Actions (every minute) |

## Security Considerations

- Google refresh tokens encrypted at rest in PostgreSQL
- Telegram webhook endpoint validates the `X-Telegram-Bot-Api-Secret-Token` header
- GitHub Actions cron endpoint authenticated with a shared secret
- NextAuth.js CSRF protection on dashboard
- Environment variables for all secrets (bot token, OpenAI key, Google OAuth credentials, encryption key)
