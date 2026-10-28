---
id: orbis
app: orbis
type: project
status: shipped
date: 2026-10-28
tags: [Python, SQLite, PWA, offline-first]
links: ["https://juw12.github.io/projects/orbis/app.html", "https://juw12.github.io/projects/orbis/index.html", "https://juw12.github.io/projects/orbis/app-mobile.html", "apps/orbis/"]
---

Offline-first personal hub for communication and growth — manage replies, commitments and summaries on a zero-dependency Python + SQLite backend. Now with a Ctrl/⌘K command palette, keyboard-first triage, undo on every action, a drag-and-drop Kanban board, a focus timer and light/dark themes.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/orbis/app.html
- **Web** — https://juw12.github.io/projects/orbis/index.html
- **Mobile** — https://juw12.github.io/projects/orbis/app-mobile.html

Monorepo: https://github.com/juw12/projects (`apps/orbis/`)

## Latest update — 2026-10-28 · Orbis Plus

A UX layer (`web/orbis-plus.css` + `web/orbis-plus.js`) on top of the desktop app, no data-model changes:

- **Command palette** — `Ctrl/⌘ K` fuzzy search across views, actions, today items, commitments, drafts and summaries.
- **Keyboard first** — `G` + letter to jump, `J`/`K` move, `E` confirm, `S` snooze, `X` dismiss, `R` reply, `?` shortcut sheet.
- **Undo everywhere** — confirm, snooze, dismiss, status changes, deletes, bulk edits and draft discards.
- **Commitments** — filters with counts, sortable columns, bulk select, drag-and-drop Kanban board, quick-add.
- **Appearance** — light / dark / system theme, 7 accents, density, reduce motion; 25-min focus timer.

Commit `7bef593` in juw12/projects.
