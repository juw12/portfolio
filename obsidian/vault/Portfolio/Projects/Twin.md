---
id: twin
app: twin
type: project
status: shipped
date: 2026-10-30
tags: [TwinAgent, multi-agent research, global markets, exchange calendars, real-time data, multi-currency, paper trading, Interactive Brokers, Alpaca API, Indonesia (IDX), crypto & gold, PWA, desktop app]
links: ["https://juw12.github.io/projects/twin/?v=1.15.0", "https://juw12.github.io/projects/twin/web.html", "https://juw12.github.io/projects/twin/mobile.html", "apps/twin/"]
---

Twin is an iPhone-ready investing and trading companion with a clean, professional design (1.5.1: new design system, line icons, dark and light themes) that tells you when a new version is ready and installs it in one tap. New in 1.15: the Twin desktop app for Windows and Mac — your own Twin server and app in one program, so real trading with Alpaca or Interactive Brokers needs no Python or terminal — and Add money: see your broker cash and buying power, follow a step-by-step deposit at your broker and get told when the money arrives (Twin never holds your money). From 1.14: updates inside the app — the installed app shows "Update ready" with what's new and updates in one tap (nothing reloads by surprise), and a Twin running on your own computer can update itself from the app: it downloads the published bundle, checks its SHA-256, backs up the whole Twin folder, keeps accounts and data, and restarts; Me shows the version with a Check for updates button. From 1.13: two wallets, one picture — move practice money between your US dollar portfolio and the Twin Indonesia rupiah wallet at the delayed mid rate minus a 0.5% practice spread; both ledgers update together (in one revision-checked request on your own server, or in this browser on the web demo), moved money counts as money put in so returns stay honest, and Portfolio and Me show both wallets and the combined total. From 1.12: the Twin Indonesia rupiah wallet shows on Home and Me, syncs to your Twin account on your own server (conflict-safe across devices), and Indonesian, crypto and gold headlines come from every feed through the server or refresh hourly on the web demo. From 1.11: Twin Indonesia, the rupiah side of Twin at twin/id/ — IDX stocks in 100-share lots with price steps and broker fees, US stocks at the shown USD/IDR rate, crypto and gold priced in rupiah, community rooms with Scam Shield, an Analyst Desk whose ideas are scored against real prices, and nine interactive lessons, with a separate rupiah practice wallet. From 1.10: a premium landing page and the premium look on every tab — glowing portfolio card on Invest, gradient academy and colourful course tiles on Learn, rounded Trade and News cards, and a big avatar header on Me. From 1.9: a premium dark design with a glowing balance hero, quick actions, swipeable cards and a Buy/Sell dock on every stock. From 1.8: big bold numbers, soft borderless cards, pill buttons, coloured ticker badges, a floating glass tab bar, charts that draw themselves in, count-up portfolio value and swipe-to-close sheets. New in 1.7: real-time prices from your own Interactive Brokers, Alpaca or Finnhub account with the source shown on every stock page (Yahoo stays the labelled, delayed fallback), a read-only IBKR gateway self-test, Qatar and Abu Dhabi holiday calendars, daily backups of your data and a safe updater. From 1.6: the web demo covers about 280 stocks and ETFs on 35+ exchanges plus 34 indices, refreshed hourly; market status follows real exchange calendars (holidays, early closes); FX rates refresh every minute with their time shown; and real orders can go through Interactive Brokers for world exchanges as well as Alpaca for US listings. From 1.5: TwinAgent, a free research team of five analysts (trend, SEC-filed fundamentals, risk, relevance-screened headlines, famous investors' 13Fs) that argue a bull and bear case from cited, dated evidence; a portfolio manager rates the stock and a risk gate built from your own limits sizes or blocks the idea. No AI subscription, the same evidence always gives the same report, future data is filtered out, and a walk-forward scorecard tests the price evidence over decades against buy-and-hold. Search stocks by company, ticker or country — Tokyo, Hong Kong, Jakarta, London, Frankfurt, Mumbai, Toronto, São Paulo, Sydney and more — with exchange, currency, market status and next holidays, ≈ USD price with the FX time and US-listing hints on every stock page. World markets shows market clocks, 34 indices, movers and a heatmap; practice trades in a separate $10,000 USD portfolio convert foreign prices at current FX rates, and totals can be shown in your home currency (25 currencies). Continue as guest or share a ?guest link; market, limit, stop, stop-limit and trailing orders with brackets, price alerts, scrub charts with SMA/EMA/RSI, portfolio X-ray with country and currency exposure, a bar-by-bar Replay Lab and 12 Twin Academy lessons. The local server searches any Yahoo Finance listing; the web demo uses an hourly snapshot of about 280 global stocks and ETFs. Optional real trading on the local server through your own Alpaca (US) or Interactive Brokers (world exchanges) account, with preview, confirm, caps and submission-time checks. Not financial advice.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/twin/?v=1.15.0
- **Web** — https://juw12.github.io/projects/twin/web.html
- **Mobile** — https://juw12.github.io/projects/twin/mobile.html

Monorepo: https://github.com/juw12/projects (`apps/twin/`)

## More links

- **Windows app** — https://github.com/juw12/projects/releases/download/twin/Twin-Windows-Setup.exe
- **Mac app** — https://github.com/juw12/projects/releases/tag/twin

## Latest update — 2026-10-30 · Twin 1.15.0 desktop app and Add money

- **Desktop app for Windows and macOS** with real trading and in-app updates.
- **Add money**: fund the linked broker account from inside Twin.
- Card and profile links: Windows app, Mac app, Web and Mobile web.

Status: ready to ship. It goes live when the matching juw12/projects patch is merged; the GitHub release download appears once its build workflow has run.
