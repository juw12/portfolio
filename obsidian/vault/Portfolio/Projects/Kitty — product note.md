---
id: kitty-product-note
app: kitty
type: product-note
status: live
date: 2026-10-28
tags: [budgeting, personal-finance, shared-budget, crdt, e2e-encryption, personality-quiz, investing, pwa]
---

# Kitty — product note

Project card: [[Kitty]]. A *kitty* is a shared pot of money.

- Live app: https://juw12.github.io/projects/kitty/
- Demo household: https://juw12.github.io/projects/kitty/demo.html
- Self-test: https://juw12.github.io/projects/kitty/tests.html
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

## Verified (2026-10-28)

- Browser self-test 92/92, including live two-client sync through ntfy.sh and the local relay (about 1 s propagation).
- UI walk-through: quiz → result → build budget on a 390×844 phone; quick-add warning; two-browser share → join → a remote edit triggers "Dining out is at 96%" on the other device in under 1 s.
- Python: relay tests (publish/poll/SSE, 400/413, restart persistence) and static web checks on Python 3.9 and 3.13. Monorepo `check_site.py` passes.

## Limits and next steps

- The public ntfy.sh relay caches messages for about 12 h and rate-limits; self-host `server/relay.py` for always-on sync.
- Investment prices are manual (no market-data API yet).
- Tips are general guidance, not financial advice.
- Ideas: recurring transactions, split-the-bill settle-up, receipt OCR, price feeds, native wrappers.
