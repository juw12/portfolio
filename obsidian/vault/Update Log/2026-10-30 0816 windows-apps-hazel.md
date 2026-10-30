# Update - Windows apps for Fade, Peers and ME R&D Toolkit, Twin desktop, Sweep apps, Hazel 2.0

- When: 2026-10-30 08:16
- What:
  - **Fade for Windows** — the live Fade app in its own window on the public Fade Network: stays signed in, Windows notifications for bookings, DMs, payments and the 2-hour reminder, payment links open outside.
  - **Peers for Windows** — Peers with its own local server and a SQLite database in the user's app-data folder.
  - **ME R&D Toolkit for Windows** — projects and the private data pack kept on the PC, Open buttons that open data-pack files in their own program, and the file vault built in (serves teammates on the LAN).
  - **Twin 1.15.0** — desktop app for Windows and macOS, and Add money.
  - **Sweep v20–v21** — working phone views and a project flow bar; apps for Windows, Mac, Android and iPhone that update themselves.
  - **Hazel 2.0** — Shortcraft and Sped become Hazel Shorts and Hazel Sped inside one Hazel studio next to Hazel Long; new house-style card from the real Hazel home.
  - **Orbis** — Back returns to the previous screen after pressing a menu (in-app Back button in the installed window) and a taskbar icon that stays visible in dark mode.
  - **Vertex v4** — new viewport renderer, gearbox generator, solid-mesh exports with through-holes, reworked workspaces.
- Portfolio: Fade, Peers, ME R&D Toolkit, Twin and Sweep cards get their Windows / Mac / Android download links; Shortcraft and Sped cards fold into the Hazel card (20 → 18 cards); Sweep and Peers card text shortened to the 130-character card limit.
- Repos: juw12/projects (patches: fade-windows-app, peers-windows-app, me-rd-toolkit-windows-app, twin-desktop-and-funding, sweep-apps, hazel-unification, orbis-back-and-icon, vertex-improvements), juw12/portfolio (cards, Hazel card art, notes, vault zip), juw12/juw12 (profile lines)
- Checks: each desktop app's built program passed its two-launch smoke test (data kept after a restart with a fresh profile); catalog changes from all six patches merge cleanly; untouched portfolio cards are byte-identical; the new Hazel card passes the house-style rules (1600x1000 from the live UI).
- Status: prepared on this PC, not pushed yet (GitHub was unreachable). Merge the juw12/projects patches first: the portfolio's hourly card sync reads the catalog from juw12/projects, and the Windows download links only work once each app's release workflow has published.

## Notes

- [[Fade]] · [[Peers]] · [[ME R&D Toolkit]] · [[Twin]] · [[Sweep]] · [[Hazel]] · [[Orbis]] · [[Vertex]]
