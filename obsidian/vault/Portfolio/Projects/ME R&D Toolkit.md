---
id: me-rd-toolkit
app: me-rd-toolkit
type: project
status: shipped
date: 2026-10-30
tags: [npi, design-review, checklists, cpk, pwa, offline-first, file-vault]
links: ["https://juw12.github.io/projects/me-rd-toolkit/index.html", "https://juw12.github.io/projects/me-rd-toolkit/index.html", "https://juw12.github.io/projects/me-rd-toolkit/index.html", "apps/me-rd-toolkit/"]
---

Offline-first workspace for hardware/mechanical R&D: NPI task flow, OK/NG/NA review checklists, issue log and one-page project report, 11 calculators (Cpk, x̄ − 3σ, torque window, stack-up, snap-fit, thermal pad, IEC openings, ΔE) and an optional stdlib-only file vault server. Ships with generic demo data; real content loads from a private data pack.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/me-rd-toolkit/index.html
- **Web** — https://juw12.github.io/projects/me-rd-toolkit/index.html
- **Mobile** — https://juw12.github.io/projects/me-rd-toolkit/index.html

Monorepo: https://github.com/juw12/projects (`apps/me-rd-toolkit/`)

## More links

- **Windows app** — https://github.com/juw12/projects/releases/download/me-rd-toolkit/ME-RD-Toolkit-Windows-Setup.exe

## Latest update — 2026-10-30 · Windows app

- **ME R&D Toolkit for Windows** — the toolkit in its own window with data kept on the PC.
- Projects and checklist results are mirrored to disk and survive restarts, reinstalls and cleared data; the private data pack lives in a `private` folder (imported packs are saved there too).
- Data-pack file and folder paths get an Open button that opens them in their own program (CAD, Excel, PDF, Explorer); programs and scripts are refused.
- The file vault can run inside the app and serve teammates on the LAN with the shared password, read-only and logged.
- Checked: two launches of the built app with a test vault — data pack and projects restored with a fresh profile, vault search/exclusions/opening, Open buttons, teammates' access 401 without and 200 with the password.

Status: ready to ship. It goes live when the matching juw12/projects patch is merged; the GitHub release download appears once its build workflow has run.
