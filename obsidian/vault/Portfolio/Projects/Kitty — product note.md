---
id: kitty-product-note
app: kitty
type: product-note
status: live
date: 2026-10-28
tags: [budgeting, personal-finance, shared-budget, crdt, e2e-encryption, personality-quiz, investing, pwa, android, ios, capacitor, i18n, multilingual]
---

# Kitty — product note

Project card: [[Kitty]]. A *kitty* is a shared pot of money.

- Live app: https://juw12.github.io/projects/kitty/
- Demo household: https://juw12.github.io/projects/kitty/demo.html
- Self-test: https://juw12.github.io/projects/kitty/tests.html
- Install on iPhone / Android / computer (free): https://juw12.github.io/projects/kitty/get.html
- Code: https://github.com/juw12/projects/tree/main/apps/kitty

## Why

Couples and housemates budget in a shared Google Sheet because it is the only tool everyone can
edit at once, but a spreadsheet does not understand money. It won't warn you, plan for you, or
tell you who overspent. Dedicated budgeting apps look great but are single-player, and many
want a bank login and a subscription. Kitty aims for the gap: **the collaboration of a sheet with
the polish and brains of a budgeting app**, and no account.

## Positioning

| | Google Sheets | Typical budgeting app | **Kitty** |
| --- | --- | --- | --- |
| Live multi-user editing | ✅ | rarely | ✅ cell-level merge |
| Understands budgets and limits | ❌ | ✅ | ✅ plus pace forecast |
| Plans from income and personality | ❌ | partial | ✅ 14-question quiz → persona → plan |
| Warnings before a limit breaks | ❌ | ✅ | ✅ including from other people's edits |
| Investing portfolio and rebalancing | manual | separate app | ✅ built in |
| Privacy | Google account | bank login, cloud | no account, E2E-encrypted, local-first |

## How it works

1. **Quiz** on needs, wants and behaviour → five trait scores → persona (🐿️ Squirrel, 🦉 Owl, 🦋 Butterfly, 🦁 Lion, 🐬 Dolphin, 🐢 Turtle), plus a secondary "with a bit of…" persona.
2. **Plan** splits take-home pay into needs, wants, savings and investing by persona, then corrects for a thin emergency fund (shifts from investing to savings), debt, and actual rent (never budgets housing below what you pay, and says so when housing is above the 30% guideline).
3. **Track** in the Sheet or with quick-add (`25k`, `1,5jt`, `Rp 25.000` all parse). Quick-add previews "this brings Groceries to 86%" before saving.
4. **Warn** at a configurable threshold (default 80%), when over, and when the current pace projects an overspend. Shown as toasts, the bell and browser notifications.
5. **Share** with one link. The AES-GCM key sits in the URL fragment, so the relay (ntfy.sh or the self-hosted stdlib relay) only ever sees ciphertext.

## Platforms (v1.1, all free)

| Platform | How | Notes |
| --- | --- | --- |
| Web | Open the live app; Chrome/Edge can install it as a desktop window | Full app, offline shell via service worker |
| iPhone / iPad | Safari → Share → **Add to Home Screen** (guided on `get.html`) | Recommended free path: full-screen app, own icon, shortcuts |
| iPhone (native) | Unsigned `Kitty-ios-UNSIGNED.ipa` from the `kitty-mobile` release | Sideload with AltStore/Sideloadly; free Apple IDs re-sign every 7 days |
| Android | Signed `Kitty-android.apk` from the `kitty-mobile` release | Haptics, native share sheet, Back button, invite deep links |

- **Architecture:** a Capacitor 8 shell (`apps/kitty/mobile/`) loads the live HTTPS site instead of bundling it. That keeps the WebView a secure context, so `crypto.subtle` (AES-GCM for E2E sharing) is always available, and web fixes reach the apps immediately. When offline on first launch it shows a reconnecting `offline.html`.
- **Native hooks in the web app:** `NATIVE` detection, haptics on adds and limit warnings, the native share sheet for invite links, Android Back (closes a sheet → goes home → minimises), and `appUrlOpen` deep links that open the Join card.
- **Build pipeline:** GitHub Actions workflow (`apps/kitty/mobile/ci/kitty-mobile.yml`): signed release APK plus debug APK, an API 35 emulator run (`scripts/android-e2e.py`: native flag, plugins, secure context + AES-GCM, demo, haptics, Back, live share, intent filter), unsigned IPA plus an iPhone-simulator launch screenshot, then publish to the stable `kitty-mobile` release.
- **Store listings** are out of scope for "free": the App Store needs an Apple Developer account ($99/year) and Google Play a one-time $25 registration.

## Languages and design (v1.2)

- **Four languages:** English, Bahasa Indonesia, 简体中文 and Español. First launch follows `?lang=` → saved choice → browser language; switch any time from the picker on the welcome screen or **Settings → Preferences**. Month names and dates follow the locale.
- **How it works:** one source table, `apps/kitty/i18n/strings.txt` (~760 rows, `English || Indonesian || Chinese || Spanish`). `build_i18n.py` validates columns, `{placeholder}` sets and duplicates, then writes `web/js/lang/{id,zh,es}.js`. The runtime (`web/js/i18n.js`) translates rendered text and attributes in place with a MutationObserver, handles templated strings (`{n} people`, `Tip for {name}`) and leaves user data (budget names, notes, amounts) untouched. Views did not need rewriting.
- **Design system 1.2:** neutral off-white / near-black surfaces, a single indigo accent, ink-coloured primary buttons, quieter cards and KPI labels, an SVG cat-head logo, and a rebuilt welcome page (headline, two CTAs, trust row, icon feature grid, persona strip, closing CTA band). The "beta" labels are gone.
- **Viral loop:** **Share your result** on the *You* tab renders a 1080×1350 money-animal card in the user's language (animal, name, tagline, three strengths, "What kind of money animal are you?" + link). Phones get the native share sheet with the image; desktops download the PNG and copy the invite text.

## Simpler setup and daily use (v1.3)

- **30-second setup:** "Get started" now asks three things (name, take-home pay with a currency guessed from the language/device, who the budget is for) and builds a ready budget immediately. The 14-question money-animal quiz is optional and offered afterwards. Unknowns get neutral defaults (no assumed debt or missing safety net).
- **Getting started checklist** on Home: create budget ✓ → add first expense → check the plan → invite people (optional) → find your money animal (optional). Steps tick themselves off, only the next step shows its explanation, it can be hidden, and it never shows in the demo.
- **Faster expense entry:** typing what it was auto-picks the category, first from the user's own history ("Anytime" → Fitness once used), then from everyday words in four languages ("coffee", "Grab", "listrik", "午饭", "almuerzo"); a manual pick always wins. Recent descriptions autocomplete.
- **Phone layout:** "left to spend" is the first thing on Home, with a compact ring beside it. Fixed a stretched name box in the quiz.
- New budgets get their default name in the user's language ("Rumah kita", "我们的家").

## Calmer look, one-tap themes (v1.4)

- **Light / Dark / System in one tap:** the theme button sits in the top bar on every screen, phones included. The new theme grows out of the pressed button (View Transitions; other browsers cross-fade) and the choice is remembered. **Settings → Appearance** shows three live preview tiles, the phone **More** sheet has the same switch, and `T` toggles it from the keyboard. The browser/status-bar colour follows the theme.
- **Calm motion:** rings sweep, bars grow, the pace line draws and money figures count up only when a page or month opens. Live re-renders (typing, sync, clock ticks) no longer replay the animations, and `prefers-reduced-motion` turns all of it off.
- **Phone layout:** one tidy header row (logo, month switch, theme, bell), a tab bar with a big **+** in the middle (Overview · Sheet · + · Budget · More) and a **More** sheet for theme, language, Goals, Invest, You, Share and Settings. Every dialog opens as a bottom sheet with a grip you can drag down to close. The sheet toolbar stacks into full-width search, one row of filters and one row of actions.
- **Small things that add up:** the overview KPI cards (Income, Spent, Saved, Safe) open the page behind the number; toasts show a draining time line, pause while the mouse rests on them, swipe away on touch and move to the top while a sheet is open; the daily tip waits until dialogs close; keyboard shortcuts `N` add · `1`–`8` pages · `/` search · `?` list them all.
- **Fixed:** typing in the sheet search lost focus after the first letter because each keystroke re-rendered the page. The caret now stays in the box, and Chinese/Japanese input methods filter once the word is composed.

## Verified (2026-10-28)

- Browser self-test 92/92, including live two-client sync through ntfy.sh and the local relay (about 1 s propagation).
- UI walk-through: quiz → result → build budget on a 390×844 phone; quick-add warning; two-browser share → join → a remote edit triggers "Dining out is at 96%" on the other device in under 1 s.
- Python: relay tests (publish/poll/SSE, 400/413, restart persistence) and static web checks on Python 3.9 and 3.13. Monorepo `check_site.py` passes.
- v1.1 mobile: self-test still 87/87 core in the browser; with a simulated Capacitor Android bridge the app detects native mode, fires haptics on add and on a limit crossing, closes the quick-add sheet / goes home / minimises on Back, opens the native share sheet with the invite link and shows the Join card for a deep-linked invite. `get.html` picks the right platform card on desktop, iPhone and Android, and shows "building soon" plus the Add to Home Screen fallback until the release assets exist. New static tests check the Capacitor config (HTTPS `server.url`), icon pixel sizes, version parity and that the workflow publishes the exact files `get.html` links to.

- v1.2 (2026-10-29): crawl of every view in id / zh / es with the missing-string collector: no untranslated UI text left (only user data and locale-formatted dates). Share cards rendered for all 6 animals × 4 languages with no overflow. Phone (390×844) welcome, overview and You screens checked. Browser self-test 87/87; 30 Python tests including new `test_i18n.py` (table valid, packs up to date, load order, service-worker cache); `check_site.py` passes with no Kitty warnings.
- v1.3 (2026-10-29): setup flow walked through in English, Indonesian, Chinese and Spanish on a 390×844 phone (3 taps to a budget, currency IDR for Indonesian and CNY for Chinese); checklist goes 1 → 2 → 3 of 5 and hides; full quiz still completes from the checklist; auto-category picks the right envelope in all four languages; crawl of every view finds no untranslated UI text; browser self-test 99/99 (12 new tests for currency and category guessing); 30 Python tests; `check_site.py` passes.
- v1.4 (2026-10-29): 40 scripted UI checks in Chromium on desktop (1280×860), phone (390×844) and narrow phones (320 and 360 px): theme switch by top-bar button, Appearance tile, More sheet and `T`, kept after reload, status-bar colour; reduced motion; no animation replay on live re-renders, month change animates, count-up lands on the exact figure; tab bar, More navigation, bottom-sheet drag-to-close and snap-back, toasts above an open sheet; shortcuts, and typing never triggers them; no horizontal overflow. Every page reviewed in light and dark. New strings translated in id / zh / es (crawl clean); browser self-test 99/99; 32 Python tests (new: dark theme overrides every colour token, theme switch reachable everywhere); monorepo CI (`build_site.py`, `check_site.py`, all tests) and the Pages deploy green.

## Limits and next steps

- The public ntfy.sh relay caches messages for about 12 h and rate-limits; self-host `server/relay.py` for always-on sync.
- Investment prices are manual (no market-data API yet).
- Tips are general guidance, not financial advice.
- Native APK/IPA builds start once the workflow is activated in `.github/workflows/` (pushing workflow files needs a GitHub token with the `workflow` scope). Until then iPhone and Android users install the home-screen web app, which has the same features.
- The native apps need internet on first launch, because they load the live site.
- Android opens `juw12.github.io` invite links in the app only if the user enables "Open supported links" (no verified App Links on a shared github.io domain).
- Translations were written with AI assistance; a native-speaker pass for Indonesian, Chinese and Spanish is still recommended before marketing in those regions.
- Ideas: recurring transactions, split-the-bill settle-up, receipt OCR, price feeds, push reminders.
