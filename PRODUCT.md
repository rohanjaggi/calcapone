# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mainly the owner: one person running their own tasks, deadlines, reminders and calendar through Calcapone. Other Telegram users can reach the bot through trial mode, but they are incidental; design decisions serve the owner first.

## Product Purpose

Calcapone is a Telegram-first task and calendar assistant. You tell the bot what you need in plain words, voice notes, photos or forwarded messages, and it files tasks, sets reminders, books Google Calendar events and nags you at the right time. The web UI exists for the things a chat window is bad at: seeing the day and the week at a glance, and touching tasks directly (complete, edit, reorder, delete). Success is a glance that answers "what's on, what's due, what's overdue" in seconds, and changes that never lose data.

## Positioning

The agent lives in the chat; the Mini App is its ledger. There is deliberately no AI on the web UI: the tool loop, the undo journal and disambiguation all live in Telegram, and a second half-featured entry point could create changes nothing could reverse. The Mini App shows and lets you touch; the chat acts.

## Operating Context

- Opened from the bot's menu button as a Telegram Mini App, inside Telegram's in-app WebView, almost always on a phone, one-handed and touch-first. Telegram Desktop and Web host it in a cross-site iframe.
- Never a standalone website: no public signup, marketing pages or SEO. Auth is Telegram `initData` exchanged for a session cookie.
- Visits are short check-ins: what's today, what's next, what's overdue, tick something off, fix a date.
- "Today" and every greeting come from the user's saved timezone, not the device clock.

## Capabilities and Constraints

- Screens: Home (living date, pressing items, seven-day strip, day timeline with a Now marker), Tasks (lists as categories, complete, edit, delete, drag to reorder and move), a single list, Calendar (month grid plus the chosen day, Google events alongside tasks), Settings (AI provider and key, timezone, notifications, Google Calendar link).
- Deadline severity colour is deliberate: only overdue and urgent are coloured, so colour keeps meaning "act now".
- Category colours are user data stored in the database.
- Google Calendar events are read from a local mirror; edits and deletes write through to Google.
- Stack: Next.js 16 App Router, Tailwind CSS 4, motion, Prisma/Postgres, deployed on Vercel.

## Brand Commitments

- Name: Calcapone, a pun on calendar and Capone. Logo: a black-and-white line caricature of a 1920s gangster in a fedora with a cigar (`public/logo.png`, `src/app/icon.png`).
- The date on Home whose colour keeps shifting is a keeper. The owner wants it driven by the time of day and its hue spread to a few accents, without becoming jarring.
- One palette only, no theme picker; the owner leans dark.

## Evidence on Hand

- The owner's real tasks, lists and calendar in the production database (viewable locally through the dev auth bypass).
- The logo and app icon above.
- No testimonials, metrics or third-party users to cite; none may be invented.

## Product Principles

1. The chat acts, the Mini App shows. Never duplicate the agent on the web.
2. Nothing destructive without a way back.
3. Colour means something. Alarm colour is reserved for what needs action now.
4. Answer the glance: what's on and what's due, readable in seconds with one thumb.
5. Time belongs to the user's timezone, never the device's.
