---
id: vitals
app: vitals
type: project
status: shipped
date: 2026-10-29
tags: [device-health, storage-cleaner, battery, undo-vault, chat-assistant, pwa, python-stdlib, local-only]
links: ["https://juw12.github.io/projects/vitals/app.html", "https://juw12.github.io/projects/vitals/index.html", "https://juw12.github.io/projects/vitals/mobile.html", "apps/vitals/"]
---

Honest device-health copilot for Mac, Windows, Linux, iPhone and Android. Safety-graded storage cleaning where every cleanup sits in a 72-hour Undo Vault with measured before/after receipts; a goal planner (“free 10 GB without touching downloads”); a transparent health score; battery wear forecast, Drain Detective and idle-drainer alerts; a baseline that learns <em>your</em> normal; and a chat that diagnoses from plain words and runs reversible fixes. Desktop apps for Windows, Mac and Linux that open in their own window and keep checking in the background (Python bundled; starts at login), an Android app, Add to Home Screen on iPhone, or a one-copy-paste install; pair a phone by scanning a QR code. Zero-dependency Python agent + offline PWA, local-only, no telemetry.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/vitals/app.html
- **Web** — https://juw12.github.io/projects/vitals/index.html
- **Mobile** — https://juw12.github.io/projects/vitals/mobile.html

Monorepo: https://github.com/juw12/projects (`apps/vitals/`)

## Download the app (1.2.1)

Release page: https://github.com/juw12/projects/releases/tag/vitals

- **Windows 10/11** — `Vitals-Windows-Setup.exe` (no admin; replaces an older Vitals automatically) or `Vitals-Windows-Portable.zip`. Unsigned, so SmartScreen asks once: *More info → Run anyway*.
- **Mac** — `Vitals-macOS-AppleSilicon.dmg` or `Vitals-macOS-Intel.dmg`; drag to Applications, first launch via *System Settings → Privacy & Security → Open Anyway*.
- **Linux** — `Vitals-Linux-x64.deb` (pulls in WebKitGTK for the window) or `Vitals-Linux-x64.tar.gz`.
- **Android** — `Vitals-Android.apk`. **iPhone** — Add to Home Screen from Safari, or the unsigned `.ipa` for sideloading.

### A real app window (1.2.0 → 1.2.1)

- Opening Vitals shows the dashboard in **its own window with the Vitals icon** — Edge WebView2 on Windows, WebKit on Mac, WebKitGTK on Linux — instead of a browser tab.
- Closing the window keeps the background agent running; opening Vitals again brings the same window back; the window remembers its size.
- `Vitals --browser` still opens it in the web browser; without a web view it falls back to an Edge/Chrome app window, then the browser.
- 1.2.1: the agent no longer stalls on start on macOS 15 (skips a reverse-DNS lookup that could hang 30–70 s), waits for a slow first start instead of reporting a busy port, and logs where it is stuck if start-up hangs.

## Install from a terminal (one step)

- **Mac / Linux** — open Terminal, paste: `curl -fsSL https://juw12.github.io/projects/vitals/install.sh | sh`
- **Windows** — Win+R, paste: `powershell -ExecutionPolicy Bypass -c "irm https://juw12.github.io/projects/vitals/install.ps1 | iex"`
- Installs into the user folder (no admin), sets up Python if needed, adds a Vitals app icon, starts at login, opens the dashboard; the web page auto-connects.
- **Phone** — Devices → Connect my phone → scan the QR with the camera (single-use code, same Wi-Fi).

## Simple mode (default)

- **One status, one button** — Home says how the device is in plain words ("A few things to tidy up") with one **Fix everything safely** button. A first launch runs the checkup by itself.
- **What I found** — short plain-language items, each with its own one-tap fix (free up space, close the app using the most memory, restart, battery settings).
- **Fix sheet** — lists exactly what gets cleared (only junk that rebuilds itself), then *keep a 3-day backup* (default) or *free the space now* (suggested under 5% free). Undo sits on the result card.
- **Automatic care** — one switch: a weekly safe cleanup into the Undo Vault plus a desktop notification when storage gets low.
- **Ask in your own words** — "just fix it" or "make it faster" in chat runs the same safe fix. **Detailed view** brings back every score, chart and tool.

## What makes it different

- **Undo Vault** — every cleanup is a move with one-click restore for 72 h; *Free now* is opt-in.
- **Proof receipts** — free disk space measured before and after every clean, restore and purge.
- **Goal planner** — "free 10 GB without touching downloads" → lowest-risk mix, exclusions honored.
- **Your normal** — hourly CPU/memory baseline from local history; flags what is unusual *for this device*.
- **Drain Detective + idle drainers** — CPU time by app on battery and while you were away.
- **Battery wear forecast** — design vs full-charge capacity, cycles, trend once a week of data exists.
- **Fix-it chat** — offline intent engine over live data; optional local Ollama fallback, never cloud.

Demo: https://juw12.github.io/projects/vitals/#demo
