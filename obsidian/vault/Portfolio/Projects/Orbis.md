---
id: orbis
app: orbis
type: project
status: shipped
date: 2026-10-30
tags: [Python, SQLite, PWA, offline-first]
links: ["https://juw12.github.io/projects/orbis/app.html", "https://juw12.github.io/projects/orbis/index.html", "https://juw12.github.io/projects/orbis/app-mobile.html", "apps/orbis/"]
---

Offline-first personal hub for communication and growth — manage replies, commitments and summaries on a zero-dependency Python + SQLite backend. Now with a Ctrl/⌘K command palette, keyboard-first triage, undo on every action, a drag-and-drop Kanban board, a focus timer and light/dark themes.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/orbis/app.html
- **Web** — https://juw12.github.io/projects/orbis/index.html
- **Mobile** — https://juw12.github.io/projects/orbis/app-mobile.html

Monorepo: https://github.com/juw12/projects (`apps/orbis/`)

## Latest update — 2026-10-30 · Back navigation and taskbar icon

- Pressing a menu now adds a history step, so Back (browser, Alt+Left, mouse back button, Android back) returns to the previous screen instead of leaving the app; an in-app Back button appears in the installed window.
- Back closes an open chat thread first, and on phones closes the side menu first.
- New opaque app icon that stays visible on dark and light taskbars.
- Built against the Orbis copy on this PC; needs a re-check against the newer Orbis Chat code before merging.

Status: ready to ship. It goes live when the matching juw12/projects patch is merged; the GitHub release download appears once its build workflow has run.
