---
name: Calcapone
description: The bot's diary, lit by the sky over your day. A dark, one-palette Telegram Mini App.
colors:
  night-ink: "#0E1220"
  page: "#161B2B"
  raised: "#1C2234"
  seam-fill: "#1E2436"
  hairline: "#262D42"
  input-edge: "#303852"
  ivory: "#F3EEE6"
  muted-ivory: "#B3B0BF"
  faint: "#8E8DA2"
  alarm-coral: "#FF7A6B"
  urgent-amber: "#F6B94A"
  done-sage: "#8FC1A0"
  hour-night: "#A9B8F0"
  hour-dawn: "#F2B49A"
  hour-midday: "#F1CF82"
  hour-dusk: "#F0A06E"
  sky-zenith-night: "#0B1028"
  sky-mid-night: "#141B3D"
  sky-low-night: "#1C2350"
  sky-horizon-night: "#36437E"
  priority-high: "#F3EEE6"
  priority-medium: "#A9A7B8"
  priority-low: "#6B6A80"
  list-sage: "#8FC1A0"
  list-teal: "#74C3BD"
  list-sky: "#7FB0EA"
  list-periwinkle: "#9EA3F2"
  list-lilac: "#C49DE8"
  list-rose: "#E89DC2"
  list-clay: "#D39A8C"
  list-sand: "#D8B98A"
  list-straw: "#D9CC86"
  list-slate: "#9DA9C2"
typography:
  display:
    fontFamily: "Brygada 1918, Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "8.75rem"
    fontWeight: 600
    lineHeight: 0.8
    letterSpacing: "-0.03em"
  display-italic:
    fontFamily: "Brygada 1918, Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.06
  headline:
    fontFamily: "Brygada 1918, Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1
  title:
    fontFamily: "Brygada 1918, Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.25
  title-sheet:
    fontFamily: "Brygada 1918, Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.25
  subtitle:
    fontFamily: "Brygada 1918, Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
  pressing:
    fontFamily: "Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    letterSpacing: "-0.01em"
  body-large:
    fontFamily: "Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
  body:
    fontFamily: "Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.375
  control:
    fontFamily: "Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  label:
    fontFamily: "Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "Mona Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  md: "0.7rem"
  lg: "0.875rem"
  xl: "1.225rem"
  2xl: "1.575rem"
  nav: "1.375rem"
  page: "1.5rem"
  sheet: "1.75rem"
  full: "9999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  row: "14px"
  inset: "16px"
  card: "20px"
  gutter: "24px"
  target: "44px"
components:
  button-primary:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.night-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    height: "3.25rem"
    width: "100%"
  button-primary-disabled:
    backgroundColor: "{colors.input-edge}"
    textColor: "{colors.faint}"
  button-hour-outline:
    textColor: "{colors.hour-night}"
    typography: "{typography.control}"
    rounded: "{rounded.2xl}"
    height: "48px"
  button-quiet:
    textColor: "{colors.muted-ivory}"
    typography: "{typography.control}"
    height: "{spacing.target}"
  option:
    textColor: "{colors.muted-ivory}"
    typography: "{typography.control}"
    rounded: "{rounded.xl}"
    height: "{spacing.target}"
  option-selected:
    textColor: "{colors.ivory}"
    rounded: "{rounded.xl}"
  input-title:
    backgroundColor: "{colors.night-ink}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.2xl}"
    height: "56px"
    padding: "0 16px"
  input-field:
    backgroundColor: "{colors.night-ink}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.xl}"
    height: "48px"
    padding: "0 16px"
  page-card:
    backgroundColor: "{colors.page}"
    rounded: "{rounded.page}"
    padding: "20px 20px 12px"
  task-row:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ivory}"
    typography: "{typography.body}"
    padding: "14px 16px"
    height: "56px"
  bottom-sheet:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.sheet}"
    padding: "12px 24px 16px"
  nav-bar:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.faint}"
    typography: "{typography.caption}"
    rounded: "{rounded.nav}"
    height: "64px"
  nav-tab-active:
    textColor: "{colors.ivory}"
  switch-off:
    backgroundColor: "{colors.input-edge}"
    rounded: "{rounded.full}"
    width: "3.25rem"
    height: "2rem"
  switch-on:
    backgroundColor: "{colors.hour-night}"
    rounded: "{rounded.full}"
  toast:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ivory}"
    typography: "{typography.control}"
    rounded: "{rounded.2xl}"
    height: "48px"
  urgency-badge-overdue:
    textColor: "{colors.alarm-coral}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  urgency-badge-urgent:
    textColor: "{colors.urgent-amber}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
---

# Design System: Calcapone

## Overview

**Creative North Star: "The Bound Diary Under a Living Sky"**

Calcapone's Mini App is the bot's diary, bound in night ink and lit by the sky over the user's day. The top of Home is a sky band that cross-fades minute by minute through the keyframed skies of the user's saved timezone: night indigo, dawn rose, morning and midday blue, afternoon gold, dusk copper and violet. The date is set large in a foil of the hour's colours whose sheen drifts across the glyphs. Every other page keeps a faint trace of that sky as a wash at its top. Below the sky, the diary takes over: dark pages one tonal step above the ground, ivory type, Brygada 1918 for the date and titles, Mona Sans for everything you touch.

The density is that of a pocket diary read one-handed: one page per screen section, generous 24px gutters, 44px targets, nothing that reads as a dashboard tile. Colour is scarce and has a job. The hour owns a single accent that moves through the day and is lent to a handful of "this is live" marks. Coral and amber belong to deadlines. Lists keep muted hues. Priority has no hue at all; it is brightness. Surfaces are told apart by tonal steps and hairline seams, never by white boxes or borders around every card.

There is one palette, dark, with no theme picker. The world refuses the category default of a light card dashboard with icon tiles and stat cards.

**Key Characteristics:**
- Night-ink ground (#0E1220), page one step lighter, floating layers one step more.
- A live sky band and drifting foil date, driven by the user's timezone, not the device.
- One moving accent, the hour, used only on live marks.
- Hue reserved for meaning: deadlines, lists, the hour. Priority as brightness.
- Brygada 1918 display voice over Mona Sans UI.
- Hairline seams and tonal layering; soft shadows only under floating layers.
- Spring-loaded sheets, rising headers and Undo instead of confirm dialogs.

## Colors

A dark diary palette of ink, ivory and one travelling hour, with hue held back for what it means.

### Primary
- **Ivory** (`ivory`): All primary text, the primary action fill (ivory button on ink text), and high-priority marks. The ink-and-ivory pairing is the system's primary voice; there is no brand-hue button.
- **The Hour** (`hour-night` at rest; live value in the `--hour` custom property): The accent of the current time of day, blended in OKLab between keyframes (`hour-dawn`, `hour-midday`, `hour-dusk` are representative stops). It paints today's ribbon, the Now line and its pulse, the active tab's underline, the focus ring, the text caret, selection tint, a switch that is on, an in-progress task ring, the outlined Add button on an empty day, and the Undo action in a toast.

### Secondary
- **Alarm Coral** (`alarm-coral`): Overdue only. Overdue labels, the pressing bar of an overdue item, the week strip's overdue dot, error toasts' border and dot, and the swipe Delete action. Also the destructive role.
- **Urgent Amber** (`urgent-amber`): Due-soon (urgent) only. Its label, bar and dot.
- **Done Sage** (`done-sage`): The filled tick of a completed task.

### Tertiary
- **List hues** (`list-sage` through `list-slate`): Ten muted colours a list can carry, shown as small dots and the pressing bar of a non-urgent item. Stored legacy flat-UI colours are remapped to these at display time; stored data is never rewritten. Unknown stored values pass through. Google Calendar events use `list-periwinkle`; a list with no colour uses `list-slate`.
- **Sky stops** (`sky-zenith-night`, `sky-mid-night`, `sky-low-night`, `sky-horizon-night`): The night keyframe of the sky band, which is also the registered initial value. The full set of keyframes lives in `src/lib/sky.ts` and in the sidecar. Every `low` stop is kept dark enough for ivory text to hold 4.5:1.

### Neutral
- **Night Ink** (`night-ink`): The ground of every page, Telegram's background and bottom-bar colour, and the header colour off Home. Also the fill inside inputs (at 70%) and the check stroke inside a done tick.
- **Page** (`page`): The diary page: the day timeline, list groups, the month grid, settings groups, task rows, the selected day in the week strip.
- **Raised** (`raised`): Anything floating: bottom sheets and their footer, the tab bar, toasts, the search dialog.
- **Seam Fill** (`seam-fill`): Quiet fills: skeleton blocks, the swipe Edit action, the neutral severity badge.
- **Hairline** (`hairline`): The default border colour: seams between lists and rows, the timeline rail, sheet and nav edges.
- **Input Edge** (`input-edge`): Input borders, the off switch track, and disabled primary buttons.
- **Muted Ivory** (`muted-ivory`): Secondary text: meta lines, labels, italic subtitles, unselected options.
- **Faint** (`faint`): Placeholders, inactive tabs, past timeline rows, done-task text, chevrons and grips.

### Named Rules
**The Hue Has a Job Rule.** Hue is spoken for by deadlines (coral, amber), lists (muted dots) and the hour. Nothing else gets a colour. Only overdue and urgent are tinted; "soon" and "upcoming" stay neutral, so colour keeps meaning "act now".

**The Priority Is Brightness Rule.** High is ivory (`priority-high`), medium is `priority-medium`, low is `priority-low`. Never a red "high": it reads as overdue.

**The Hour Lends Its Colour Rule.** The hour's accent goes only to live marks (today, now, the active tab, focus, on, in progress, Undo). It is never a fill for a large surface outside the sky itself.

## Typography

**Display Font:** Brygada 1918 (with Mona Sans, ui-sans-serif, system-ui)
**Body Font:** Mona Sans, loaded with its width axis (with ui-sans-serif, system-ui)

**Character:** A bookish old-style serif sets the diary's voice (dates, page titles, counts, italic asides) against a neutral, slightly wide grotesque for everything you read quickly or touch.

### Hierarchy
- **Display** (600, 8.75rem, 0.8, -0.03em): The day number on Home, set in foil. One per screen.
- **Display Italic** (500 italic, 1.75rem, 1.06): "Thursday, / November" beside the day number.
- **Headline** (600, 2.5rem, 1): Page titles: Tasks, Calendar, Settings, a list's name, Login.
- **Title** (600, 1.75rem): The day page's title ("Today" or the long date). Calendar's day title and sheet titles use 1.625rem; empty-state titles and "Coming up" use 1.5rem and 1.25rem.
- **Subtitle** (400 italic, 17px): The Brygada line under every page title ("4 open across 3 lists").
- **Pressing** (Mona 500, 1.25rem, -0.01em): The title of the one commitment under the sky.
- **Body** (Mona 400/500, 16px, snug): Task titles and timeline titles. 17px for the greeting, list names and the title input.
- **Control** (Mona 500/600, 15px): Options, toasts, buttons, Add.
- **Label** (Mona 500, 13px): Field labels, meta lines, the pressing urgency label (600), timeline times.
- **Caption** (Mona 500, 12px): Tab labels, weekday initials, urgency badges.

### Named Rules
**The Display Voice Rule.** Brygada sets the date, page titles, sheet titles, day numbers and counts, and italic subtitles. It never sets controls, meta or body.

**The 16px Floor Rule.** Every input's text is at least 16px, so iOS never zooms the page on focus.

**The Tabular Time Rule.** Times, day numbers and counts use tabular figures.

## Layout

A single phone column. Page content sits on a 24px gutter (headers, the pressing commitment); page cards and lists inset 16px from the edge with 20px padding inside. Rows run 14px vertical by 16px horizontal at a 56px minimum height. Every touch target is at least 44px. The tab bar floats 12px above the safe area, inset 16px, and centres at 34rem from 640px up; pages reserve 7rem plus the safe area at the bottom for it. Toasts stack 6rem above the safe area.

Home stacks: the sky band (about 20rem, with phase and time top-left and a 44px search button top-right), the pressing commitment, seven equal day tabs (4.5rem tall, 4px gaps), then the selected day's page. The day timeline uses three shared columns: a 3rem right-aligned time, an 8px dot column, then content, with a 1px rail through the dot column that fades in and out at its ends.

Rows within a list are ruled from the text column in (56px from the left); a full-width rule starts a new list.

## Elevation & Depth

Depth is tonal first: ink, page, raised, each one step lighter. Resting surfaces (pages, rows, cards) carry no shadow and no border; they are separated by their tone and by hairline seams. Only layers that float over content (the sheet, the tab bar, toasts, search) carry a shadow, and those shadows are soft, dark and pushed away from the light, never hard or offset. The sky band and the sky wash are the only gradients.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 -24px 60px -20px rgba(0,0,0,0.8)`): Under the bottom sheet's top edge.
- **Float** (`box-shadow: 0 18px 40px -14px rgba(0,0,0,0.85)`): The tab bar. Toasts use `0 18px 40px -12px rgba(0,0,0,0.7)`; search uses `0 24px 60px -16px rgba(0,0,0,0.85)`.
- **Thumb** (`box-shadow: 0 2px 6px rgba(0,0,0,0.35)`): The switch thumb.
- **Now breath** (a ring growing to 7px in the hour at 50% to 0%): The Now dot's pulse.

### Named Rules
**The Seam, Not Box Rule.** Resting surfaces are separated by tone and 1px hairlines, never by outlined cards or shadows. Within a page, rows are ruled by inset hairlines. The one deliberate exception is the Tasks screen, where each list is its own borderless page with a 12px gap between them (owner's preference: lists read as separate, not one connected box).

**The Only Floating Things Cast Shadows Rule.** A shadow means the layer floats above the page. Nothing at rest casts one.

## Shapes

Soft, rounded diary pages. Page cards round at 1.5rem, sheets at 1.75rem on their top corners, the tab bar at 1.375rem, primary buttons, inputs and toasts at about 1.6rem, options and fields at about 1.2rem, badges at 0.7rem. Dots, ticks, the switch and the active-tab underline are fully round. Today's ribbon is the one cut shape: a bookmark tab with a notched tail (`clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)`), 10 by 14px, hanging over the day tab. Bars (the pressing bar) are 3px wide and fully rounded.

## Components

### Buttons
- **Shape:** Generous pill-ish rectangles (1.575rem radius).
- **Primary:** Full-width ivory fill with night-ink text, 600 weight, 3.25rem tall in sheets, 48px in settings. Presses scale to 0.98. Disabled turns to the input-edge fill with faint text.
- **Hour outline:** The Add button on an empty day: 48px, 1px border in the hour at 50%, hour text, pressed fill at 10%.
- **Quiet:** Text-only, muted ivory, 44px tall ("Add a task", "Calendar →", Edit/Done); press brightens to ivory or adds a 10% ivory wash.
- **Focus:** Everywhere a 2px outline in the hour, offset 2px.

### Chips (options)
- **Style:** 44px tall, 1.225rem radius, 1px hairline border, muted text, 15px, with a leading 8px colour or priority dot.
- **State:** Selected reads as a lit edge: border ivory at 70%, a 7% ivory wash, ivory text at 500. No fills in colour.

### Cards / Containers
- **Corner Style:** 1.5rem.
- **Background:** Page tone on the ink ground.
- **Shadow Strategy:** None (see Elevation).
- **Border:** None; internal seams are hairlines.
- **Internal Padding:** 20px (day page) or row padding for lists.

### Inputs / Fields
- **Style:** Ink at 70% inside a 1px input-edge border. The title input is 56px tall at 17px; fields are 48px at 16px; text areas pad 14px vertical. Labels sit above in 13px muted text, wrapped in a `<label>`.
- **Focus:** The border shifts to the hour at 70%; the caret is the hour.

### Navigation
- **Style:** A floating raised bar, 64px tall, four equal tabs (icon 20px over a 12px label). Inactive tabs are faint at 1.6 stroke; the active tab is ivory at 2 stroke, 600, with a 3px by 20px hour underline that springs between tabs. A tapped tab lights at once; the underline waits for the route; a long wait makes the tab breathe after 250ms.

### Bottom Sheet (signature)
Every form opens in it. Raised tone, 1.75rem top corners, a 40 by 4px faint handle, a Brygada title with a 44px close button. Springs in (damping 32, stiffness 340) over a 60% black shade with a 2px blur; drags down to dismiss past 110px or a fast flick; Escape and the shade also close it. A sticky footer keeps the primary action in reach.

### Sky Hero (signature)
The sky band with stars (fixed points at night, dimmed at dawn and dusk, none by day), the foil date, the greeting, and under it the pressing commitment: a 3px bar in alarm, urgent or the list colour, a 13px urgency label, a 20px title and the list's dot and name, ruled off with a hairline.

### Week Strip
Seven tabs: a 12px weekday, a 22px Brygada day number, and a 4px dot that is coral or amber only when something is due, neutral when merely busy. The selected day springs a page-tone tile under itself; today wears the hour ribbon.

### Task Row
A page-tone row with a 22px tick ring (faint at rest, hour when in progress, sage fill with a drawn check when done). Swipe left snaps open two 64px actions (Edit in seam fill, Delete in coral) and never deletes on release. Done titles strike through in faint. Delete becomes an Undo toast.

### Switch
A 52 by 32px track, input-edge off and hour on, with an ivory thumb that turns ink and slides on the expo ease.

### Toast
Raised, 48px, 1.575rem radius, rising in with a 6px blur. Error toasts carry a coral border at 40% and a coral dot. An action (Undo) is 600 weight in the hour.

## Do's and Don'ts

### Do:
- **Do** read the time of day from the user's saved timezone, and drive the sky, foil and hour from it through the registered `--sky-*`, `--foil-*` and `--hour` properties.
- **Do** separate resting surfaces with tone and 1px hairlines, ink to page to raised.
- **Do** give the hour's accent only to live marks: today, now, the active tab, focus, on, in progress and Undo.
- **Do** show priority as brightness (ivory, `priority-medium`, `priority-low`).
- **Do** tint only overdue (coral) and urgent (amber) deadlines.
- **Do** paint list colours through the display remap so legacy saturated colours land muted.
- **Do** keep every target at least 44px and every input at least 16px.
- **Do** open forms in the bottom sheet and turn deletes into an Undo toast; keep a confirm only where the backend cannot undo.
- **Do** honour reduced motion: freeze the foil at 40%, stop the pulse, shimmer and breathing, drop the sky cross-fade, and let headers fade instead of rise.

### Don't:
- **Don't** add a light theme or a theme picker; there is one dark palette.
- **Don't** build light card dashboards, icon tiles or stat cards.
- **Don't** colour priority, or any state other than overdue and urgent, with hue.
- **Don't** put outlines or shadows on resting cards; shadows are for floating layers only, and they stay soft.
- **Don't** set controls, meta or body text in Brygada.
- **Don't** put a transform or filter animation on a route wrapper, or use `both` fill on route animations; it traps fixed elements and sheets.
- **Don't** add uppercase tracked kicker labels above titles; titles stand on their own with an italic subtitle beneath.
