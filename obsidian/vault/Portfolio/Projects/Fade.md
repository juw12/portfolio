---
id: fade
app: fade
type: project
status: shipped
date: 2026-10-30
tags: [PWA, Nostr, direct payments, haircut shorts, creator commissions, Windows app]
links: ["https://juw12.github.io/projects/fade/", "https://juw12.github.io/projects/fade/web.html", "https://juw12.github.io/projects/fade/mobile.html", "apps/fade/"]
---

Barber marketplace with haircut shorts, live on the decentralised Fade Network or your own server: real accounts, end-to-end encrypted bookings and DMs, direct payments (PayPal, Venmo, Cash App, Stripe links, bank/QR, Lightning) with a 0% fee, private-by-default, recallable push notifications and 2 h reminders, automatic transcoding, nudity checks that don't trust the uploader's app (re-checked by the server, or by every viewer's device before anything is shown), human review of new accounts' first posts, built-in violence/weapon/hate-symbol checks (Sightengine) and a hook for CSAM hash-matching services, evidence export for moderators, re-upload blocking and spam filters, moderation that reaches even the offline demo, and 5–10% creator commissions when a short sends a booking.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/fade/
- **Web** — https://juw12.github.io/projects/fade/web.html
- **Mobile** — https://juw12.github.io/projects/fade/mobile.html

Monorepo: https://github.com/juw12/projects (`apps/fade/`)

## More links

- **Windows app** — https://github.com/juw12/projects/releases/download/fade/Fade-Windows-Setup.exe

## Latest update — 2026-10-30 · Windows app

- **Fade for Windows** — the live Fade app in its own window, on the same Fade Network as the website and phones (shared accounts, barbers, shorts, bookings and DMs).
- Stays signed in: the account key and unsent changes are mirrored to a file in the user's app-data folder and restored after restarts, reinstalls or cleared data.
- Booking requests, confirmations, DMs, payments and the 2-hour reminder show as Windows notifications; payment links open in the browser, Lightning invoices in the wallet app.
- Checked: the built app went live against a local copy of the network, created a real account (its profile read back from the relay) and came back signed in after a restart with a fresh profile.

Status: ready to ship. It goes live when the matching juw12/projects patch is merged; the GitHub release download appears once its build workflow has run.
