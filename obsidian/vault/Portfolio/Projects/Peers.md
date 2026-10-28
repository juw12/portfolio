---
id: peers
app: peers
type: project
status: shipped
date: 2026-10-28
tags: [PWA, reviews, 32 categories, offline-first]
links: ["https://juw12.github.io/projects/peers/app.html", "https://juw12.github.io/projects/peers/", "https://juw12.github.io/projects/peers/mobile.html", "apps/peers/"]
---

Offline-first review app across 32 categories, from food to AI tools, with a built-in Use it / Wait / Skip scorecard. Now with a Ctrl/⌘K command palette, keyboard shortcuts, undo, saved reviews and light/dark themes with custom accents.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/peers/app.html
- **Web** — https://juw12.github.io/projects/peers/
- **Mobile** — https://juw12.github.io/projects/peers/mobile.html

Monorepo: https://github.com/juw12/projects (`apps/peers/`)

## Latest update — 2026-10-28 · Peers Plus

A self-contained block at the end of `web/index.html`. It stays fully offline (no fetch/XHR) and `mobile.html` is unchanged:

- **Command palette** — `Ctrl/⌘ K` across views, actions, categories, places, products, people and reviews, with recents.
- **Keyboard shortcuts** — `G` + letter to jump, `/` search, `J`/`K` move, `L` upvote, `S` save, `W` write, `T` theme, `?` sheet.
- **Undo toasts** — votes, follows, cart, moderation, mark-all-read, deletions, cancelled subscriptions.
- **Saved reviews** — Save / Share on every review card, a *Saved* view with filter and clear-all (`state.saved`).
- **Appearance** — light / dark / auto theme, 7 accents, density, reduce motion, compact sidebar rail.
- Verified: 50/50 browser checks, static-integrity and API suites green, works in server mode.

Commit `7bef593` in juw12/projects.
