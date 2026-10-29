---
id: mint-product-note
app: mint
type: product-note
status: live
date: 2026-10-29
tags: [mint, budgeting, personal-finance, shared-budget, crdt, e2e-encryption, personality-quiz, investing, template-marketplace, excel, google-sheets, affiliate, creator-economy, cloudflare-workers, workers-ai, pwa, android, capacitor, i18n]
aliases: [Sheetmint, Kitty — product note]
---

# Mint — product note

Project card: [[Mint]]. Mint is one app with two halves: **Budget**, the home screen (Kitty until 2026-10-29), and **Templates**, the spreadsheet-template studio and marketplace (renamed from Sheetmint). Stackup was retired on 2026-10-26.

- Live app: https://juw12.github.io/projects/mint/
- Budget: https://juw12.github.io/projects/mint/budget/ · demo household: https://juw12.github.io/projects/mint/budget/demo.html · self-test: https://juw12.github.io/projects/mint/budget/tests.html
- Templates: https://juw12.github.io/projects/mint/app.html · API: https://mint-api.juw12.workers.dev/api/health
- Install on iPhone / Android / computer (free): https://juw12.github.io/projects/mint/budget/get.html
- Code: https://github.com/juw12/projects/tree/main/apps/mint

## Mint 3.0: one app (2026-10-29)

- **Why.** Both halves serve people who already run their money in spreadsheets: Budget for a household's own money, Templates for the sheets people make, buy and sell. One name, one install and one look make each a natural next step from the other instead of two thin products.
- **Shape.** Budget is the home screen (`/projects/mint/budget/`). Templates keeps its URLs (`app.html`, `web.html`, `mobile.html`), API, Android APK and share / affiliate links. The front door (`/projects/mint/`) sends template links (`#/…`, `?ref`, `?coupon`, `?listing`, `?item`, `?api`) to Templates and everything else to Budget.
- **One product.** Each half links to the other: Budget's sidebar (*Also in Mint → Templates*), phone More sheet and welcome page; Templates' top bar and the first tab on phones. One manifest keeps Mint's install id and opens on Budget; the Mint mark and green on both halves; one light / dark / system theme (`mint.theme`) and one language (Budget `kitty.lang` ↔ Templates `mint.lang`), followed live by tabs that are already open.
- **Nobody loses anything.** Old `/projects/kitty/` pages are redirect stubs that keep the hash and query, so invite links still open the right budget with their key, and `get`, `demo` and `tests` redirect too. `/projects/kitty/version.json` serves the 3.0.0 release, so an open Kitty 1.5 tab announces the update and reloads into Mint; a retiring worker at the old address clears only the `kitty-*` caches. Storage keys (`kitty.*`), the `window.Kitty` namespace and the relay topics keep their names on purpose, so every budget and live share carries over.
- **Fixed on the way.** Kitty's service worker deleted every cache on the origin, Mint's included. The two workers now have separate scopes (`budget/` and `mint/`) and only clear their own caches.
- **Verified.** 30 scripted merge checks (front door, old links and invites, shared theme and language both ways, a returning Kitty user keeps every budget and sees "Updated to Mint 3.0.0", phone layouts), the 40 UI checks, 20 update-flow checks, browser self-test 103/103, 36 Budget Python tests plus the Templates core tests, CI and the Pages deploy green. Live: front door and redirects with invite keys, both service workers and caches side by side, the retiring worker, 3.0.0 served at both addresses.
- **Open.** The Android APK was not rebuilt: it opens on Templates with Budget one tap away, and Budget's downloads need Chrome or the installed web app there. Kitty icons already on home screens open the redirect until Mint is installed. Templates speaks English and Indonesian only.

## Budget (formerly Kitty)

A *kitty* is a shared pot of money; the name lives on in the storage keys.

### Why

Couples and housemates budget in a shared Google Sheet because it is the only tool everyone can
edit at once, but a spreadsheet does not understand money. It won't warn you, plan for you, or
tell you who overspent. Dedicated budgeting apps look great but are single-player, and many
want a bank login and a subscription. Budget aims for the gap: **the collaboration of a sheet with
the polish and brains of a budgeting app**, and no account.

### Positioning

| | Google Sheets | Typical budgeting app | **Mint Budget** |
| --- | --- | --- | --- |
| Live multi-user editing | ✅ | rarely | ✅ cell-level merge |
| Understands budgets and limits | ❌ | ✅ | ✅ plus pace forecast |
| Plans from income and personality | ❌ | partial | ✅ 14-question quiz → persona → plan |
| Warnings before a limit breaks | ❌ | ✅ | ✅ including from other people's edits |
| Investing portfolio and rebalancing | manual | separate app | ✅ built in |
| Privacy | Google account | bank login, cloud | no account, E2E-encrypted, local-first |

### How it works

1. **Quiz** on needs, wants and behaviour → five trait scores → persona (🐿️ Squirrel, 🦉 Owl, 🦋 Butterfly, 🦁 Lion, 🐬 Dolphin, 🐢 Turtle), plus a secondary "with a bit of…" persona.
2. **Plan** splits take-home pay into needs, wants, savings and investing by persona, then corrects for a thin emergency fund (shifts from investing to savings), debt, and actual rent (never budgets housing below what you pay, and says so when housing is above the 30% guideline).
3. **Track** in the Sheet or with quick-add (`25k`, `1,5jt`, `Rp 25.000` all parse). Quick-add previews "this brings Groceries to 86%" before saving.
4. **Warn** at a configurable threshold (default 80%), when over, and when the current pace projects an overspend. Shown as toasts, the bell and browser notifications.
5. **Share** with one link. The AES-GCM key sits in the URL fragment, so the relay (ntfy.sh or the self-hosted stdlib relay) only ever sees ciphertext.

### Platforms (all free)

| Platform | How | Notes |
| --- | --- | --- |
| Web | Open https://juw12.github.io/projects/mint/; Chrome/Edge can install it as a desktop window that opens on Budget | Full app, offline shell via service worker |
| iPhone / iPad | Safari → Share → **Add to Home Screen** (guided on `get.html`) | Full-screen app with its own icon and shortcuts |
| Android | `Mint-android.apk` from the `mint-android` release, or install the web app from Chrome | The APK is the Templates Capacitor shell; it loads the live site, opens on Templates and has Budget first in the tab bar. Invites use the native share sheet |

- **History:** Kitty 1.1 had its own Capacitor shell (`apps/kitty/mobile`) with haptics, the native share sheet, Back-button handling, invite deep links and a GitHub Actions build with an emulator run, but the workflow was never activated (pushing workflow files needs a token with the `workflow` scope), so no Kitty APK/IPA was ever published. Mint 3.0 removed that shell; Budget still uses those native hooks when a shell provides them and skips them quietly otherwise.
- **Store listings** are out of scope for "free": the App Store needs an Apple Developer account ($99/year) and Google Play a one-time $25 registration.

### Languages and design (v1.2)

- **Four languages:** English, Bahasa Indonesia, 简体中文 and Español. First launch follows `?lang=` → saved choice → browser language; switch any time from the picker on the welcome screen or **Settings → Preferences**. Month names and dates follow the locale.
- **How it works:** one source table, `apps/mint/budget/i18n/strings.txt` (~815 rows today, `English || Indonesian || Chinese || Spanish`). `build_i18n.py` validates columns, `{placeholder}` sets and duplicates, then writes `web/budget/js/lang/{id,zh,es}.js`. The runtime (`web/budget/js/i18n.js`) translates rendered text and attributes in place with a MutationObserver, handles templated strings (`{n} people`, `Tip for {name}`) and leaves user data (budget names, notes, amounts) untouched. Views did not need rewriting.
- **Design system 1.2:** neutral off-white / near-black surfaces, a single indigo accent, ink-coloured primary buttons, quieter cards and KPI labels, an SVG cat-head logo (the Mint mark since 3.0), and a rebuilt welcome page (headline, two CTAs, trust row, icon feature grid, persona strip, closing CTA band). The "beta" labels are gone.
- **Viral loop:** **Share your result** on the *You* tab renders a 1080×1350 money-animal card in the user's language (animal, name, tagline, three strengths, "What kind of money animal are you?" + link). Phones get the native share sheet with the image; desktops download the PNG and copy the invite text.

### Simpler setup and daily use (v1.3)

- **30-second setup:** "Get started" now asks three things (name, take-home pay with a currency guessed from the language/device, who the budget is for) and builds a ready budget immediately. The 14-question money-animal quiz is optional and offered afterwards. Unknowns get neutral defaults (no assumed debt or missing safety net).
- **Getting started checklist** on Home: create budget ✓ → add first expense → check the plan → invite people (optional) → find your money animal (optional). Steps tick themselves off, only the next step shows its explanation, it can be hidden, and it never shows in the demo.
- **Faster expense entry:** typing what it was auto-picks the category, first from the user's own history ("Anytime" → Fitness once used), then from everyday words in four languages ("coffee", "Grab", "listrik", "午饭", "almuerzo"); a manual pick always wins. Recent descriptions autocomplete.
- **Phone layout:** "left to spend" is the first thing on Home, with a compact ring beside it. Fixed a stretched name box in the quiz.
- New budgets get their default name in the user's language ("Rumah kita", "我们的家").

### Calmer look, one-tap themes (v1.4)

- **Light / Dark / System in one tap:** the theme button sits in the top bar on every screen, phones included. The new theme grows out of the pressed button (View Transitions; other browsers cross-fade) and the choice is remembered. **Settings → Appearance** shows three live preview tiles, the phone **More** sheet has the same switch, and `T` toggles it from the keyboard. The browser/status-bar colour follows the theme.
- **Calm motion:** rings sweep, bars grow, the pace line draws and money figures count up only when a page or month opens. Live re-renders (typing, sync, clock ticks) no longer replay the animations, and `prefers-reduced-motion` turns all of it off.
- **Phone layout:** one tidy header row (logo, month switch, theme, bell), a tab bar with a big **+** in the middle (Overview · Sheet · + · Budget · More) and a **More** sheet for theme, language, Goals, Invest, You, Share and Settings. Every dialog opens as a bottom sheet with a grip you can drag down to close. The sheet toolbar stacks into full-width search, one row of filters and one row of actions.
- **Small things that add up:** the overview KPI cards (Income, Spent, Saved, Safe) open the page behind the number; toasts show a draining time line, pause while the mouse rests on them, swipe away on touch and move to the top while a sheet is open; the daily tip waits until dialogs close; keyboard shortcuts `N` add · `1`–`8` pages · `/` search · `?` list them all.
- **Fixed:** typing in the sheet search lost focus after the first letter because each keystroke re-rendered the page. The caret now stays in the box, and Chinese/Japanese input methods filter once the word is composed.

### Updates arrive by themselves (v1.5)

- **Release manifest:** every deploy publishes `web/version.json` with the live version and two or three release notes in English, Indonesian, Chinese and Spanish. Open copies of Kitty read it when they start, every 30 minutes, when you come back to the app and when the connection returns.
- **Heads-up in the app:** a newer version shows a toast ("Kitty 1.6.0 is ready" + **Update**), a card at the top of the bell (which counts it), an **Update Kitty** row at the top of the phone More sheet and an **Updates** card in Settings with the version, *Check for updates* and *What's new*.
- **Update in place:** one tap saves the budget, re-downloads the app files past the browser cache, reloads and lands on the same page, month and scroll position. With *Install updates automatically* on (the default) Kitty also updates itself the next time you switch away, but never while a sheet, the quiz or a half-typed field is open.
- **Afterwards:** "Updated to Kitty 1.5.0" appears once, with *What's new* listing the notes in your language. Brand-new visitors are not told about an update.
- **Safety nets:** the service worker now revalidates every request (cheap 304s), never caches `version.json` and accepts SKIP_WAITING; if a reload still returns old files (a cache catching up), Kitty stays quiet for 10 minutes instead of looping, while the bell keeps the offer. The iPhone and Android apps load the live site, so they update the same way.
- **Releasing:** bump `K.VERSION` and `web/budget/version.json` together (tests fail if they drift) and the service-worker cache name. `/projects/kitty/version.json` is copied from Budget at build time, so old Kitty tabs see every release.

### Verified (2026-10-28)

- Browser self-test 92/92, including live two-client sync through ntfy.sh and the local relay (about 1 s propagation).
- UI walk-through: quiz → result → build budget on a 390×844 phone; quick-add warning; two-browser share → join → a remote edit triggers "Dining out is at 96%" on the other device in under 1 s.
- Python: relay tests (publish/poll/SSE, 400/413, restart persistence) and static web checks on Python 3.9 and 3.13. Monorepo `check_site.py` passes.
- v1.1 mobile: self-test still 87/87 core in the browser; with a simulated Capacitor Android bridge the app detects native mode, fires haptics on add and on a limit crossing, closes the quick-add sheet / goes home / minimises on Back, opens the native share sheet with the invite link and shows the Join card for a deep-linked invite. `get.html` picks the right platform card on desktop, iPhone and Android, and shows "building soon" plus the Add to Home Screen fallback until the release assets exist. New static tests check the Capacitor config (HTTPS `server.url`), icon pixel sizes, version parity and that the workflow publishes the exact files `get.html` links to.

- v1.2 (2026-10-29): crawl of every view in id / zh / es with the missing-string collector: no untranslated UI text left (only user data and locale-formatted dates). Share cards rendered for all 6 animals × 4 languages with no overflow. Phone (390×844) welcome, overview and You screens checked. Browser self-test 87/87; 30 Python tests including new `test_i18n.py` (table valid, packs up to date, load order, service-worker cache); `check_site.py` passes with no Kitty warnings.
- v1.3 (2026-10-29): setup flow walked through in English, Indonesian, Chinese and Spanish on a 390×844 phone (3 taps to a budget, currency IDR for Indonesian and CNY for Chinese); checklist goes 1 → 2 → 3 of 5 and hides; full quiz still completes from the checklist; auto-category picks the right envelope in all four languages; crawl of every view finds no untranslated UI text; browser self-test 99/99 (12 new tests for currency and category guessing); 30 Python tests; `check_site.py` passes.
- v1.4 (2026-10-29): 40 scripted UI checks in Chromium on desktop (1280×860), phone (390×844) and narrow phones (320 and 360 px): theme switch by top-bar button, Appearance tile, More sheet and `T`, kept after reload, status-bar colour; reduced motion; no animation replay on live re-renders, month change animates, count-up lands on the exact figure; tab bar, More navigation, bottom-sheet drag-to-close and snap-back, toasts above an open sheet; shortcuts, and typing never triggers them; no horizontal overflow. Every page reviewed in light and dark. New strings translated in id / zh / es (crawl clean); browser self-test 99/99; 32 Python tests (new: dark theme overrides every colour token, theme switch reachable everywhere); monorepo CI (`build_site.py`, `check_site.py`, all tests) and the Pages deploy green.
- v1.5 (2026-10-29): 20 scripted update checks in Chromium with a faked newer `version.json`: toast, bell card and count, What's new with notes, Settings card, phone More row; *Update now* shows the updating screen, reloads and keeps page and month; no repeat toast while the old files are still served; automatic install on switch-away, never with a sheet open, and not when switched off; "Updated to Kitty 1.5.0" with notes in English and Indonesian, nothing for first-time visitors; up-to-date and offline states. Update texts translated in id / zh / es; the 40 v1.4 UI checks still pass; browser self-test 103/103; 34 Python tests; monorepo CI and the Pages deploy green; the live site serves 1.5.0.

### Limits and next steps

- The public ntfy.sh relay caches messages for about 12 h and rate-limits; self-host `apps/mint/budget/server/relay.py` for always-on sync.
- Investment prices are manual (no market-data API yet).
- Tips are general guidance, not financial advice.
- Inside the Mint Android app, haptics, Back-button handling and Budget's CSV / backup / result-card downloads need a rebuilt shell (`@capacitor/haptics`, `@capacitor/app` and a download bridge for Budget); Chrome or the installed web app has them all today.
- The native apps need internet on first launch, because they load the live site.
- Invite links open in the browser or the installed web app; there are no verified App Links on the shared github.io domain.
- Translations were written with AI assistance; a native-speaker pass for Indonesian, Chinese and Spanish is still recommended before marketing in those regions.
- Ideas: recurring transactions, split-the-bill settle-up, receipt OCR, price feeds, push reminders.

## Templates

### Why

Selling Sheets / Excel templates still works, but the generic "budget template on Etsy" market is
saturated. The money is in:

- **niche systems**, such as toko stock, kos-kosan rental, arisan, UMKM invoicing in rupiah;
- **bundles**;
- **distribution**: creators and affiliates who post about the template.

Sellers struggle with the build (formulas, dropdowns, a dashboard that doesn't break) and with
marketing. Mint covers the whole loop: **prompt → AI template → tweak → publish → affiliates
promote with a generated content kit → buyer pays the seller → file unlocks.**

### Users

1. **Template creators.** They want a working, good-looking sheet in minutes and a place to sell it.
2. **Buyers.** Small business owners, freelancers and students who need a sheet that works in Excel
   and Google Sheets, with local currency.
3. **Affiliates / content creators.** They want something to promote, with copy ready to post and a
   clear way to get paid.

### Money flow

- The seller sets the price and an affiliate commission $c$ (0–50%). The platform fee $f$ is 0%
  at launch and configurable.
- Per confirmed sale:

  $$\text{seller keeps} = P\,(1 - f - c) \qquad \text{affiliate earns} = P\,c$$

  Example: $P = \text{Rp }49.000$, $c = 30\%$. The affiliate earns Rp 14.700 and the seller keeps
  Rp 34.300 at $f = 0$, or Rp 29.400 at $f = 10\%$. The 10% case is covered by the API and browser
  tests.
- The buyer pays the seller directly through the seller's payment link, quoting the order reference.
  The seller confirms the payment and the file unlocks. The seller pays the affiliate to the payout
  details the affiliate saved, then marks it paid. Mint never holds funds.

### Status

- **Live:**
  - the PWA on GitHub Pages, plus an Android app (Capacitor shell, `Mint-android.apk` on the
    `mint-android` release) and an iPhone home-screen app (Add to Home Screen);
  - the API on Cloudflare: Worker plus a SQLite Durable Object, Workers AI — live at `https://mint-api.juw12.workers.dev` (v2.2.0);
  - accounts that work across devices, with recovery codes, password change and account deletion;
  - the marketplace, orders (expire after 14 days), affiliate ledger and payouts;
  - formula-free previews of paid templates, listing reports with auto-hide, notification badges;
  - Mint AI generation, the content kit, 7 guides, Privacy and Terms pages;
  - **v2.2:** automatic payments — the seller connects their own Midtrans (Snap), Xendit (Invoice)
    or Stripe (Checkout) key (stored AES-GCM encrypted); the order is re-checked against the
    provider API and unlocks instantly; webhooks are only a hint;
  - **v2.2:** Web Push notifications (new order, paid, sold, commission paid); email via Resend is
    coded but off until `RESEND_API_KEY` + `MAIL_FROM` are set.
- **Verified:**
  - 23 end-to-end API checks on local `workerd` (incl. recovery, password change, delete, reports,
    counts, preview stripping).
  - A 40-check real-browser flow with separate seller, affiliate and buyer profiles: publish →
    preview + report → affiliate link → order → badges → confirm → .xlsx download → review → ledger
    → commission paid → change password → forgot password with recovery code → delete account →
    install page → offline fallback.
  - 160 static and JS-core checks.
  - v2.2: 30/30 API checks and 47/47 browser checks against mock Midtrans/Xendit/Stripe; on the
    live API, fake keys were correctly rejected by all three real providers and a dead push
    subscription was pruned. No real paid transaction yet.
  - The Android APK is built and signed locally; it has not been run on a physical phone.

### Next decisions

1. **Platform fee on automatic payments.** Done for the seller's own account (v2.2). Collecting a
   Mint fee needs xenPlatform or Stripe Connect (split payments).
2. **Fee.** Stay at 0% to attract sellers, or turn on 5–10% once payments are automatic.
3. **Email.** Push is live. Email needs a Resend key and a verified sending domain.
4. **Store listings.** Google Play ($25 once) and the App Store (Apple Developer, $99/year + Xcode).
5. **Custom domain** and a lawyer review of the Privacy and Terms pages before marketing.

### Open to-dos

- [x] Deploy the API once (done, v2.2.0): move `apps/mint/cloud/github-workflow.yml` to `.github/workflows/mint-api.yml` and push, or run `npx wrangler login` + `npx wrangler deploy` in `apps/mint/cloud`.
- [ ] Install `Mint-android.apk` on a real phone and check login, buy → checkout in browser, .xlsx share sheet.
- [x] Back up the Android signing key (done, stored privately in more than one place).
- [x] Automatic payments (seller's own Midtrans / Xendit / Stripe) and Web Push — v2.2.
- [ ] Run one real paid order end-to-end with a sandbox/live provider key.
- [ ] Email: `npx wrangler secret put RESEND_API_KEY` + `MAIL_FROM` var after verifying a domain.
- [x] Desktop Excel check: 104/104 formula and dashboard values in the 14 seed templates match Mint (27 Oct 2026).
- [x] Play prerequisites: web account-deletion page, UU PDP privacy update, terms for auto-payments, store listing kit in `apps/mint/store/` (v2.2.1).
- [ ] Play developer account ($25), build AAB (`./gradlew bundleRelease`), closed test with 12 testers × 14 days, then production.
- [ ] Lawyer review of the updated privacy/terms.
- [x] v2.3 (27 Oct 2026): seller coupons (5–90%, per template or store-wide, max uses, expiry, coupon links), listing views + 30-day insights (views, sales, conversion, earnings, daily chart), Open Graph share previews via `/s/<id>` (affiliate + coupon links show title/price on WhatsApp/X/Facebook). API 38/38, browser e2e 55/55, live check 9/9.
- [x] v2.4 (27 Oct 2026): English / Bahasa Indonesia switch (EN/ID button in the top bar; `js/i18n.js` translates the rendered UI from a ~570-phrase dictionary + rules, choice saved per device, first visit follows browser language). User content, typed chat and sheet previews never translate; `<option>` values stay English so filters/publishing keep working. Fallback is English for anything not in the dictionary; legal pages and .xlsx stay English. test_core passed, API 38/38, browser e2e 57/57, live check 6/6.
