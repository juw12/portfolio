# Update - twin 1.14 (updates inside the app)

- When: 2026-10-29 16:45
- What: Twin 1.14.0 tells you when a new version is ready and installs it in one tap. The installed app (Home Screen / PWA, Twin Indonesia included) downloads a new version in the background, then shows "Update ready · Twin X" with the release notes; nothing reloads until you tap Update, Later hides it for 12 hours, and Me → App version shows the version with Check for updates. On your own Twin server, "Update Twin on this computer" asks first, downloads the published bundle, checks its SHA-256 and version, backs up the install, keeps your data, restarts and reloads you into the new version still signed in. Git clones are told to `git pull`; `--no-self-update` turns it off.
- App: https://juw12.github.io/projects/twin/
- Release notes: https://juw12.github.io/projects/twin/release.json
- Repos: juw12/projects (`apps/twin`, `scripts/apps.json`, `.github/workflows/pages.yml`; commit 6273c2e), juw12/portfolio (card copy + notes), juw12/juw12 (profile line)
- Checks: new update test suite (44 checks: bundle, checksum and unsafe-zip refusal, git and disabled installs, end-to-end self-update and restart in a temporary copy); 150 real-browser checks; a real Chrome run 19/19 (notice → one-tap update, Twin Indonesia, server self-update with backup and the session kept); all Twin suites; CI (Python 3.12 and 3.13) and Pages deploy green; live site serves 1.14.0 and the download matches its SHA-256.
- Limits: the move from 1.13 happens automatically once (1.13 can't show the notice); phones using the server's http:// LAN address get the server notice but keep no offline copy; downloads are trusted through HTTPS plus the checksum, not code-signed.

## Notes

- [[Twin]]
