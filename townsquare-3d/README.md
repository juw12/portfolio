# Townsquare 3D

A shared 3D town for phone and desktop browsers: walk around, claim land, grow and make goods,
trade at the market, build, and watch the town come alive with nine townsfolk who keep their own routines.

**Play in the browser:** [juw12.github.io/portfolio/townsquare-3d/](https://juw12.github.io/portfolio/townsquare-3d/)
· [juwenlie.pages.dev/townsquare-3d/](https://juwenlie.pages.dev/townsquare-3d/)
(no install; works on phones; progress is saved in your browser)

![The plaza with townsfolk](screenshots/plaza.jpg)

## Get it on your device

- **Windows:** [`Townsquare3D-Windows-Setup.exe`](https://github.com/juw12/portfolio/releases/download/townsquare-3d-desktop/Townsquare3D-Windows-Setup.exe) (no admin needed; if Windows says it protected your PC, choose *More info → Run anyway*), or without installing [`Townsquare3D-Windows-Portable.zip`](https://github.com/juw12/portfolio/releases/download/townsquare-3d-desktop/Townsquare3D-Windows-Portable.zip).
- **Mac:** [`Townsquare3D-macOS-AppleSilicon.dmg`](https://github.com/juw12/portfolio/releases/download/townsquare-3d-desktop/Townsquare3D-macOS-AppleSilicon.dmg) (M1 and newer) or [`Townsquare3D-macOS-Intel.dmg`](https://github.com/juw12/portfolio/releases/download/townsquare-3d-desktop/Townsquare3D-macOS-Intel.dmg). The first time, macOS blocks it because it is not notarized: **System Settings → Privacy & Security → Open Anyway**.
- **Android:** [`Townsquare3D-android.apk`](https://github.com/juw12/portfolio/releases/download/townsquare-3d-android/Townsquare3D-android.apk): open the file on the phone and allow your browser to install apps once.
- **iPhone:** open https://juw12.github.io/portfolio/townsquare-3d/ in Safari, tap Share, then **Add to Home Screen**.

The Windows, Mac and Android apps are the web app in its own window ([`desktop/`](desktop/README.md), [`android/`](android/README.md)) and change with it. Each build is opened on GitHub's machines before it is published: on Windows and on a Mac the page loads, the app starts and can store data; on an Android emulator it installs, opens and stays up. They are not code-signed or notarised, and no real phone or PC has run them yet.

## What you can do

| | |
| --- | --- |
| **Land** | Claim 10 × 10 m plots (the first one is free) and build with blocks, walls, glass, lamps, trees, flowers and benches. |
| **Production** | Wheat fields, woodlots, quarries, ovens and sawmills make goods over time; collect them when they're ready. |
| **Market** | Sell and buy at Rosa's stall. Prices move with supply and demand, and Rosa posts a daily order for a bonus. |
| **Progress** | A goal chain from your first plot to 1,000 coins, plus XP, levels and titles, a town feed and small celebrations. |
| **Townsfolk** | Nine residents with homes, daily routines and chatter, driven by the town clock and a day/night sky. |
| **Social** *(multiplayer server)* | Friends, `/visit`, share links, stars on plots, top plots, co-builders, chat with a word filter, mute and report. |

Designed to be gripping without dark patterns: no paid randomness, no streaks, no fake urgency.

| | |
| --- | --- |
| ![Golden hour](screenshots/golden-hour.jpg) | ![A farm plot](screenshots/farm.jpg) |
| ![Rosa's market stall](screenshots/market.jpg) | ![Daily order](screenshots/daily-order.jpg) |
| ![Visiting a friend's plot](screenshots/visit.jpg) | ![On a phone](screenshots/phone.jpg) |

## Controls

| Desktop | Phone | Action |
| --- | --- | --- |
| **WASD** / arrows · **Shift** | Left joystick | Walk · run |
| **Space** | JUMP button | Jump |
| Drag | Drag | Look around |
| **E** | Tap | Sit, collect goods, open the market |
| **B** | Build button | Build mode |
| **Enter** | Chat box | Chat (`/help` lists commands) |

## Solo mode on this page

GitHub Pages only serves static files, so this copy runs in **solo mode**: the game's *real* Python
server logic (economy, land, goals, townsfolk, safety rules) is loaded into your browser with
[Pyodide](https://pyodide.org/) (Python compiled to WebAssembly), and the game's `api/*` requests are
answered inside the page. Your town is saved in the browser (IndexedDB). The first visit downloads
about 10 MB for the Python runtime and then starts in a few seconds.

![Solo mode running from the portfolio](screenshots/solo-pages.jpg)

Multiplayer (other people, friends, moderation) needs the Python server, which runs the same code
over HTTP with HTTPS hosting through Caddy or Docker Compose.

## How it's built

- **Client:** plain JavaScript ES modules + [three.js](https://threejs.org/); builds are drawn as instanced
  batches (about 3× fewer draw calls in a busy town); phones get far-away players less often.
- **Server:** one Python file using only the standard library (`engine/server.py`), with the economy,
  goals, orders, progress, townsfolk, accounts (PBKDF2) and moderation in separate modules.
  137 unit tests cover it.
- **Assets:** the rigged, animated character and the market stall and producer models are generated
  by Blender scripts, exported as glTF (`models/`).
- **Static build:** `build_web.py` copies the client, adds `solo.js` and puts the server modules in
  `engine/`; every path is relative, so the same files run at any URL.
