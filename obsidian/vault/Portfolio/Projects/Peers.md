---
id: peers
app: peers
type: project
status: shipped
date: 2026-10-30
tags: [PWA, reviews, 32 categories, offline-first, Windows app]
links: ["https://juw12.github.io/projects/peers/app.html", "https://juw12.github.io/projects/peers/", "https://juw12.github.io/projects/peers/mobile.html", "apps/peers/"]
---

Offline-first review app across 32 categories, from food to AI tools, with a built-in Use it / Wait / Skip scorecard. Now with a Ctrl/⌘K command palette, keyboard shortcuts, undo, saved reviews and light/dark themes with custom accents.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/peers/app.html
- **Web** — https://juw12.github.io/projects/peers/
- **Mobile** — https://juw12.github.io/projects/peers/mobile.html

Monorepo: https://github.com/juw12/projects (`apps/peers/`)

## More links

- **Windows app** — https://github.com/juw12/projects/releases/download/peers/Peers-Windows-Setup.exe

## Latest update — 2026-10-30 · Windows app

- **Peers for Windows** — the Peers app with its own local server in one program; every review, vote and setting is saved to a SQLite database in the user's app-data folder.
- Works offline; one window at a time; update notice when a newer desktop version is published.
- Checked: the built app saved through the app's own save path to the database and kept the change after a restart with a fresh profile.

Status: ready to ship. It goes live when the matching juw12/projects patch is merged; the GitHub release download appears once its build workflow has run.
