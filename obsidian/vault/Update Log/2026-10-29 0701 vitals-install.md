# Update - vitals (one-step install + QR phone pairing)

- When: 2026-10-29 07:01
- What: Getting the full app is now one copy-paste. `install.sh` (Mac/Linux) and `install.ps1` (Windows, via Win+R) install into the user folder, set up Python if missing, add a Vitals app icon, start at login and open the dashboard; the web page shows an Install wizard and connects by itself when Vitals starts. Phones pair by scanning a QR code ("Connect my phone"), no restart or typing; codes are single-use. Second launch just opens the dashboard.
- Install page: https://juw12.github.io/projects/vitals/#view=devices
- Repos: juw12/projects (`apps/vitals`, `scripts/apps.json`; commit 10e0a1e), juw12/portfolio (card copy, note, log, vault zip)
- Checks: installer sandbox run (install → launch → update → uninstall keeps the vault) 14/14; agent 54/54; brain 57/57; QR output identical to the `qrcode` reference for 6 cases (v1–v7); real QR link opened over LAN auto-paired.

## Notes

- [[Vitals]]
