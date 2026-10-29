# Update - kitty (updates arrive by themselves)

- When: 2026-10-29 16:34
- What: Kitty 1.5.0 notices new versions on its own and updates in place. Each release publishes a small version.json with notes in four languages; the app checks it at start, every 30 minutes, when you return to it and when the connection comes back. A new version shows a toast with an Update button, a card in the bell, a row in the phone More sheet and an Updates card in Settings. One tap updates without losing anything (same page, month and scroll); with "Install updates automatically" on it also updates itself the next time you switch away, never mid-task. Afterwards a one-time "What's new" lists the release notes in your language. The iPhone and Android apps update the same way because they load the live site.
- App: https://juw12.github.io/projects/kitty/
- Repos: juw12/projects (`apps/kitty`, `scripts/apps.json`; commit 209819f), juw12/portfolio (notes)
- Checks: 20 scripted update-flow checks with a faked newer release (notify, update now, auto-update on switch-away, never with a sheet open, off switch, What's new after update in English and Indonesian, up-to-date and offline); the 40 v1.4 UI checks; translation crawl clean in id / zh / es; browser self-test 103/103; 34 Python tests; CI and Pages deploy green; live site serves 1.5.0.
- Pending: native-speaker review of translations; native APK/IPA workflow still needs a token with the `workflow` scope.

## Notes

- [[Kitty]] · [[Kitty — product note]]
