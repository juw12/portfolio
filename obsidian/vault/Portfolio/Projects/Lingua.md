---
id: lingua
app: lingua
type: project
status: shipped
version: 2.3.1
date: 2026-10-28
tags: [translation desk, OCR, translation, Windows, iPhone, Android]
links: ["https://juw12.github.io/projects/lingua/picture.html", "https://juw12.github.io/projects/lingua/web.html", "https://juw12.github.io/projects/lingua/mobile.html", "apps/lingua/"]
---

Picture-to-text reader with crop, rotate, batch, history, read-aloud and translation into 16 languages, plus an always-on-top overlay that translates Microsoft Teams captions live. Windows app with a Share-to-phone QR pairing so iPhone and Android can read pictures with the camera through the laptop. Now also includes a translation desk: paste text and translate it with a tone, context, glossary, alternatives and word-choice notes, using the company AI, local AI on the laptop (Ollama) or offline packs.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/lingua/picture.html
- **Web** — https://juw12.github.io/projects/lingua/web.html
- **Mobile** — https://juw12.github.io/projects/lingua/mobile.html

Monorepo: https://github.com/juw12/projects (`apps/lingua/`)

## Install & updates

- **Windows download** — https://github.com/juw12/projects/releases/tag/lingua-v2.3.1 (`Lingua-windows.zip`, unzip, run `Install Lingua.cmd`, no admin rights)
- **Installation & usage guide (PPT, 15 slides)** — https://github.com/juw12/projects/raw/refs/heads/main/apps/lingua/docs/Lingua_Installation_and_Usage_Guide.pptx
- **In-app updates** — ⟳ Updates → Update now (checks on start and every 4 hours; keeps settings, history and `lingua.env`).
- **Share kit** — https://github.com/juw12/projects/tree/main/apps/lingua/tools/share-kit — rebuilds the guide deck and runs an hourly Outlook notifier that replies in the original team e-mail thread whenever a new `lingua-vX.Y.Z` release ships (what's new, version history, update deck). Recipients stay in a local, git-ignored config.

## Version history

| Version | Date | Highlights |
| --- | --- | --- |
| 2.3.1 | 2026-10-27 | Text desk (tone, context, glossary, alternatives & notes); local AI via Ollama as first fallback |
| 2.2.2 | 2026-10-27 | Always-visible Updates button; re-checks every 4 hours |
| 2.2.1 | 2026-10-27 | Updater works behind a dead `HTTPS_PROXY` |
| 2.2.0 | 2026-10-27 | Offline translation packs when the company models are down; online services opt-in only |
| 2.1.0 | 2026-10-27 | In-app updates, per-user installer, redesigned main window |

Shared with three team colleagues on 2026-10-28 (guide deck + gateway settings without any API key); later releases are announced automatically in the same thread.
