---
id: vitals
app: vitals
type: project
status: shipped
date: 2026-10-29
tags: [device-health, storage-cleaner, battery, undo-vault, chat-assistant, pwa, python-stdlib, local-only]
links: ["https://juw12.github.io/projects/vitals/app.html", "https://juw12.github.io/projects/vitals/index.html", "https://juw12.github.io/projects/vitals/mobile.html", "apps/vitals/"]
---

Honest device-health copilot for Mac, Windows, Linux, iPhone and Android. Safety-graded storage cleaning where every cleanup sits in a 72-hour Undo Vault with measured before/after receipts; a goal planner (“free 10 GB without touching downloads”); a transparent health score; battery wear forecast, Drain Detective and idle-drainer alerts; a baseline that learns <em>your</em> normal; and a chat that diagnoses from plain words and runs reversible fixes. Installs with one copy-paste (app icon, starts at login, Python set up automatically on Windows); pair a phone by scanning a QR code. Zero-dependency Python agent + offline PWA, local-only, no telemetry.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/vitals/app.html
- **Web** — https://juw12.github.io/projects/vitals/index.html
- **Mobile** — https://juw12.github.io/projects/vitals/mobile.html

Monorepo: https://github.com/juw12/projects (`apps/vitals/`)

## Install (one step)

- **Mac / Linux** — open Terminal, paste: `curl -fsSL https://juw12.github.io/projects/vitals/install.sh | sh`
- **Windows** — Win+R, paste: `powershell -ExecutionPolicy Bypass -c "irm https://juw12.github.io/projects/vitals/install.ps1 | iex"`
- Installs into the user folder (no admin), sets up Python if needed, adds a Vitals app icon, starts at login, opens the dashboard; the web page auto-connects.
- **Phone** — Devices → Connect my phone → scan the QR with the camera (single-use code, same Wi-Fi).

## What makes it different

- **Undo Vault** — every cleanup is a move with one-click restore for 72 h; *Free now* is opt-in.
- **Proof receipts** — free disk space measured before and after every clean, restore and purge.
- **Goal planner** — "free 10 GB without touching downloads" → lowest-risk mix, exclusions honored.
- **Your normal** — hourly CPU/memory baseline from local history; flags what is unusual *for this device*.
- **Drain Detective + idle drainers** — CPU time by app on battery and while you were away.
- **Battery wear forecast** — design vs full-charge capacity, cycles, trend once a week of data exists.
- **Fix-it chat** — offline intent engine over live data; optional local Ollama fallback, never cloud.

Demo: https://juw12.github.io/projects/vitals/#demo
