# Update - mint (Budget joins Mint)

- When: 2026-10-29 18:09
- What: The budgeting app and Templates are now one app, Mint 3.0. Budget is the home screen at /projects/mint/budget/; Templates, the spreadsheet-template studio and marketplace, is one tap away and keeps its URLs, API, Android app and share links. One install that opens on Budget, the Mint mark and green on both halves, one light / dark / system theme and one language across both, and two service workers that leave each other's caches alone (the old budget worker used to wipe Templates'). Old budget-app links, invites with their key, the get / demo / tests pages and open budget tabs move over by themselves; storage keys and relay topics keep their names, so every budget and live share carries over.
- App: https://juw12.github.io/projects/mint/
- Repos: juw12/projects (`apps/mint`, `scripts/build_site.py`, `scripts/apps.json`; commits a186eff, 2d5d6ac), juw12/portfolio (Mint card regenerated in the house style, old budget card retired, notes merged)
- Checks: 30 scripted merge checks (front door, old links and invites, shared theme and language both ways, a returning Budget user keeps every budget and sees "Updated to Mint 3.0.0", phone layouts); the 40 UI checks; 20 update-flow checks; browser self-test 103/103; 36 Budget Python tests plus the Templates core tests; CI and Pages deploy green; live: front door, redirects with invite keys, both service workers and caches side by side, the retiring budget worker clears only its own caches, 3.0.0 served at /mint/budget/ and the old address.
- Pending: the Android APK was not rebuilt (it opens on Templates, Budget is one tap away, and Budget's downloads need Chrome or the installed web app); Old budget icons already on home screens open the redirect until Mint is installed; Templates speaks English and Indonesian only.

## Notes

- [[Mint]] · [[Mint — product note]]
