# Update - mint budget (web, iPhone and Android, free)

- When: 2026-10-29 00:26
- What: Budget 1.1.0 is free on every platform. The web app gains PNG/maskable icons, iOS home-screen meta tags, app shortcuts (Add expense, Open sheet) and a new install page (`get.html`) that detects iPhone, Android or computer, shows a QR code on desktop, and only offers native downloads once they are published. A Capacitor 8 shell (`apps/mint/mobile/`) wraps the live HTTPS site for Android (signed APK) and iPhone (unsigned IPA for sideloading), with haptics, the native share sheet, Android Back handling and invite deep links.
- Install: https://juw12.github.io/projects/mint/budget/get.html
- App: https://juw12.github.io/projects/mint/budget/
- Repos: juw12/projects (`apps/mint/web/budget`, `scripts/apps.json`; commits dc56df5, 93666a7), juw12/portfolio (card links, notes)
- Checks: browser self-test 87/87 core; simulated Capacitor bridge (native mode, haptics on add and limit crossing, Back closes the sheet, then goes home, then minimises, native share with the invite link, deep-link Join card); `get.html` on desktop, iPhone and Android with no console errors; 18 Budget static tests (Capacitor HTTPS config, icon pixel sizes, version parity, workflow assets match the download links); monorepo `check_site.py` passes; CI and Pages green; live site serves 1.1.0.
- Pending: the Android/iPhone build workflow ships as `apps/mint/mobile/ci/` (mobile workflow). It starts building and publishing the APK and IPA once it's copied to `.github/workflows/`, which needs a GitHub token with the `workflow` scope. Until then phones install the home-screen web app.

## Notes

- [[Mint]] · [[Mint — product note]]
