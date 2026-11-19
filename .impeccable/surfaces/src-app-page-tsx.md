---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/todos/page.tsx","src/app/calendar/page.tsx","src/app/settings/page.tsx"]
---

# Calcapone Mini App: every screen (Home first)

Scope: the whole Telegram Mini App (Home, Tasks, a list, Calendar, Settings, sheets, search, toasts, loading and error states). Mode: Operate.

Audience and job: the owner, one-handed in Telegram, checking what's on, what's due and what's overdue, then ticking off or fixing tasks. Constraints: Telegram WebView, the user's saved timezone (never the device's), one palette (dark), no AI on the web.

## Direction contract

THESIS: The Mini App is the bot's diary, lit by the sky over your day. It refuses the category default of a light card dashboard with icon tiles and stat cards.

OWN-WORLD: The ground is night ink (#0E1220), pages are one step lighter (#161B2B) and floating layers one step more (#1C2234), with ivory type (#F3EEE6). A sky band follows the user's timezone minute by minute: night indigo, dawn rose, midday blue, dusk copper and violet. The date is set in a slowly drifting foil of the hour. The hour's accent goes to today's ribbon, the Now line, the active tab and focus. Brygada 1918 sets the date, titles and sheet titles; Mona Sans sets the UI. Priority is shown as brightness. Hue is kept for deadlines (alarm coral, urgent amber), muted list colours and the hour. Surfaces are separated by hairline seams, not white boxes.

STORY: Open the app from Telegram and the colour tells you the hour. You read the date and the greeting, see the one thing that needs you and tap it. You scan the week, tick tasks off, and never lose one, because deletes offer Undo.

FIRST VIEWPORT: On Home, the sky band is about 20rem tall. The phase and time sit top-left, with a 44px search button top-right. The day number is set in foil at about 140px, with "Thursday, November" in italic beside it and the greeting beneath. Under the sky comes the pressing commitment: an alarm bar, the urgency label, a 20px title and its list. Next are seven day tabs with the hour's ribbon on today, then today's page (Brygada "Today") showing rows or an empty state with Add. The floating tab bar carries an underline in the hour's colour.

FORM: Candidate 4 of 7 (The Bound Diary), fused at the user's request with candidate 1 (Sky Hours, the pick). The type round chose Brygada 1918. seed: 82d1608f65a7fb41. Signature: the sky cross-fades minute by minute and the foil drifts over 16s. Motion grammar: routes fade in while headers rise, sheets spring in and can be dragged to dismiss, and a delete becomes an Undo toast.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Decisions

- The critique's P0/P1/P2 fixes are in scope: snapping swipe, Undo deletes, the Telegram bridge everywhere, actionable Home, collapsed empty lists, labels, 44px targets and contrast.
- The Google event delete stays a confirm, because Google has no undo for it.
- List colours are remapped at display time only; stored values are never rewritten.
