---
id: airiz-motor
app: airiz-motor
type: project
status: shipped
date: 2026-10-31
tags: [Windows app, Web Serial, Bluetooth control, camera sharing, macro runner, offline demo]
links: ["https://github.com/juw12/projects/releases/download/airiz-desktop-v1.11.21/AIRIZ-Console-Setup-1.11.21-x64.exe", "https://juw12.github.io/projects/airiz-motor/", "https://juw12.github.io/projects/airiz-motor/", "apps/airiz-motor/"]
---

Downloadable Windows console (v1.11.21) with a locally bundled controller, serial port chooser, macros and offline demo. Remote by code lets a phone or another PC control the AIRIZ and see its camera through this PC with the owner's 6-digit code. The dashboard shows real device facts: the firmware the AIRIZ reports, live link activity, a camera check that confirms each jog really moved the camera, automatic aim and timing calibration from the camera picture, a camera-based wobble test that grades the rising head 1 to 4, and a read-only hardware check report. Camera tab: **Home key** sends the camera home; auto night vision uses both the on-board light sensor and the camera mean luminance (either source can pull the mode to night, both must agree to go back to day). Camera tools add presets, motion detection, a siren and talk / listen through the AIRIZ speaker and microphone. The browser and mobile-web editions remain available.

## App / Web / Mobile

- **App** — https://github.com/juw12/projects/releases/download/airiz-desktop-v1.11.21/AIRIZ-Console-Setup-1.11.21-x64.exe
- **Web** — https://juw12.github.io/projects/airiz-motor/
- **Mobile** — https://juw12.github.io/projects/airiz-motor/

Monorepo: https://github.com/juw12/projects (`apps/airiz-motor/`)
Commit: [`1e8cb52`](https://github.com/juw12/projects/commit/1e8cb52a5e699d982cb99ead94980dc4fe664650) (AIRIZ Console 1.11.21: Go home keyboard shortcut + camera-based auto night mode)

## More links

- **Android app** — https://github.com/juw12/projects/releases/download/airiz-mobile-v1.0.3/AIRIZ-Mobile-1.0.3-android.apk
- **iPhone (Bluefy)** — https://juw12.github.io/projects/airiz-motor/iphone.html

## Update Log

- **2026-10-31 1.11.21** — `Go home` keyboard shortcut + camera-based auto night mode. `Home` key on the Camera tab sends the camera home (routed through `askHost` so a remote controller still asks the cable console); the `Go home` button is now exception-safe. Auto night vision samples the camera mean luminance on the main thread every ~700 ms with hysteresis (defaults 22 / 60 in 0..255 luminance units, tunable); a new `combinedNightDecision` says night when either source says dark and only switches back to day when both say bright. Tests: `desktop/tests/ptz-core.test.cjs` (+12 assertions) and new `desktop/tests/ptz-go-home.test.cjs`.
- 2026-10-31 1.11.20 — wobble test fixes
- 2026-10-30 1.11.17 — real device facts instead of decoration
