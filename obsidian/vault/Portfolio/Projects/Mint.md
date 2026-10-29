---
id: mint
app: mint
type: project
status: shipped
date: 2026-10-29
tags: [mint, budgeting, personal-finance, crdt, e2e-encryption, template-marketplace, excel, google-sheets, affiliate, cloudflare-workers, workers-ai, payments, web-push, pwa, offline-first, android, capacitor, i18n, desktop, pywebview]
links: ["https://juw12.github.io/projects/mint/budget/index.html", "https://juw12.github.io/projects/mint/web.html", "https://juw12.github.io/projects/mint/budget/get.html", "apps/mint/"]
---

Mint is one app with two halves. <strong>Budget</strong> is a budget you share like a Google Sheet, with an interface built only for money: a 30-second setup turns take-home pay into needs / wants / savings / investing envelopes, an optional 2-minute quiz assigns one of six money personalities, a live <strong>sheet</strong> with cell-level merging, warnings at 80%, over the limit or when your pace will overspend (including when someone else's edit tips a category), goals and an <strong>investing portfolio</strong> with drift and rebalancing. Sharing is local-first and end-to-end encrypted (AES-GCM, key in the link fragment) over ntfy.sh or a self-hostable stdlib relay, with no account. <strong>Templates</strong> is a live marketplace for Excel / Google Sheets templates: describe a sheet in English or Bahasa Indonesia and Mint AI designs it, tweak it with words (&ldquo;add column Supplier&rdquo;), export a real .xlsx with live formulas and a dashboard, then sell it &mdash; buyers pay the seller directly through the seller's own Midtrans, Xendit or Stripe checkout (QRIS, e-wallets, VA, cards) or a payment link, with coupons, tracked affiliate commissions, seller insights and Web Push notifications, on a Cloudflare Workers + SQLite Durable Object backend. The first time it opens, Mint asks for a language (English, Bahasa Indonesia, 简体中文 or Español) and a region, and the region sets the currency of new budgets and templates. Both halves share one install, one icon, one light / dark / system theme and that one language (Templates is in English and Bahasa Indonesia), and update themselves in place. Free as a Windows and Mac desktop app, an Android app, an iPhone home-screen app and on the web; the desktop and Android builds are opened and checked on their own systems before every release. Plain HTML/CSS/JS, no build step.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/mint/budget/index.html
- **Web** — https://juw12.github.io/projects/mint/web.html
- **Mobile** — https://juw12.github.io/projects/mint/budget/get.html

Monorepo: https://github.com/juw12/projects (`apps/mint/`)

## More links

- **Templates** — https://juw12.github.io/projects/mint/app.html
- **Live demo** — https://juw12.github.io/projects/mint/budget/demo.html
- **Get the app** — https://juw12.github.io/projects/mint/budget/get.html
- **Windows app** — https://github.com/juw12/projects/releases/download/mint/Mint-Windows-Setup.exe
- **Mac app** — https://github.com/juw12/projects/releases/tag/mint
- **Android app (APK)** — https://github.com/juw12/projects/releases/download/mint/Mint-Android.apk
