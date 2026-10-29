# Update - vitals 1.2.1 (opens in its own window)

- When: 2026-10-29 18:37
- What: The Vitals desktop apps are real apps now. Opening Vitals on Windows, Mac or Linux shows the dashboard in its own window with the Vitals icon (Edge WebView2 / WebKit / WebKitGTK) instead of a browser tab; closing it keeps the background agent running, opening it again brings the same window back, and `--browser` keeps the old behaviour. 1.2.1 also fixes the Intel Mac build: Python's HTTP server did a reverse-DNS lookup on start that stalls 30–70 s on macOS 15, so the agent looked dead; it now starts in about 4 s, waits for a slow first start instead of blaming a busy port, and logs where it is stuck if start-up ever hangs.
- Download: https://github.com/juw12/projects/releases/tag/vitals (Windows setup + portable, Mac Apple silicon + Intel, Linux .deb + .tar.gz, Android, iPhone)
- Repos: juw12/projects (`apps/vitals`, `scripts/apps.json`, `.github/workflows/vitals-apps.yml`; commits 28e4dae, 34d360a), juw12/portfolio (card copy + notes), juw12/juw12 (profile line)
- Checks: CI opens every built app (Windows, Mac Apple silicon + Intel, Linux under a virtual display) and confirms its own window shows the live dashboard, a second launch focuses it and `--stop` closes it; Windows installer and Linux .deb install/run/uninstall; desktop, API, brain and installer test suites; the frozen Windows build checked by hand on a real PC.
- Limits: still unsigned, so SmartScreen / Gatekeeper ask once; Windows needs the WebView2 runtime (built into Windows 10/11); on some locked-down Windows PCs the process list can come back empty because `tasklist /v` takes ~40 s.

## Notes

- [[Vitals]]
