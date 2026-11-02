---
id: crewcup
app: crewcup
type: project
status: working-prototype
date: 2026-11-02
tags: [crewcup, office-coffee, b2b, loyalty, pwa, i18n, python, sqlite]
links: ["https://github.com/juw12/projects/tree/main/apps/crewcup", "apps/crewcup/"]
---

CrewCup is office coffee for teams in <strong>Indonesia and Southeast Asia</strong>. Employees order their usual in one tap or join a <strong>group coffee run</strong> with a cutoff (everyone's share is held, so the runner never pays upfront), paid from the <strong>company allowance</strong>, then pick up at a partner café with their <strong>company badge QR</strong>. Cafés get an order board batched by pickup slot, cup labels with allergy warnings, stock, payouts and catering; HR gets budgets, spend and tax receipts, runner fairness and an audit log. Includes <strong>company rewards</strong> (send a coffee, nominations), a loyalty program with points, tiers, coupons, café offers and achievements, and the <strong>CrewCup Network</strong> to meet other companies in your building. QRIS-style top-ups, live updates, English and Bahasa Indonesia. Plain Python server (no dependencies) on SQLite, 101 tests.

## Run it

- `python server.py` in `apps/crewcup/`, then open http://localhost:8787 (add `--reset` for fresh demo data)
- `http://localhost:8787/preview.html` shows three phones side by side, each a different user, updating live
- Tests: `python -m unittest discover -s tests` (101 tests)

## Source

- **Source** — https://github.com/juw12/projects/tree/main/apps/crewcup

Monorepo: https://github.com/juw12/projects (`apps/crewcup/`)
