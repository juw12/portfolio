# Juwen Lie — Portfolio

Interactive personal portfolio for **Juwen Lie** — R&D Mechanical Engineer (Mechanical · Aerospace · AI · Tech · Systems).

A single-page, **zero-dependency** static site with a clean, professional layout: system fonts, light/dark themes (follows the OS setting, remembers your choice), filterable and searchable project cards, and a details dialog per project.

**Live:** https://juwenlie.pages.dev/ (Cloudflare Pages, auto-deploys from `main`). The old https://juw12.github.io/portfolio/ address still serves the same site (canonical URL points to pages.dev).

## Local preview

Open `index.html` directly in a browser, or serve the folder:

```
python -m http.server 8000
```

Then visit http://localhost:8000/. The site works fully offline (`file://`) — no build step and no external requests.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | The page (hero, about, experience, projects, skills, education, contact, connect) |
| `styles.css` | Theme + layout |
| `app.js` | Theme toggle, active-section nav, reveal on scroll, project filters + search, project details dialog, copy email |
| `assets/projects/` | Project imagery (newsprint-halftone) |
| `assets/qr/` | Contact QR codes (LinkedIn, GitHub, email, bio.site) |
| `obsidian/` | Portfolio Obsidian vault: every project note as Markdown plus a one-file zip bundle — see [`obsidian/README.md`](obsidian/README.md) |
| `.github/workflows/pages.yml` | Deploys to GitHub Pages on push to `main` (kept so old links keep working) |

## AI Daily (`/news/`)

A public daily AI briefing, built every morning at 06:00 WIB by `.github/workflows/ai-daily.yml`:
`scripts/ai_daily/build_ai_daily.py build` collects AI feeds, clusters duplicate stories across
outlets, writes "The Brief" with GitHub Models (workflow token, `models: read`), and publishes
`news/index.html`, `news/YYYY-MM-DD.html`, `news/archive.json` and `news/feed.xml`.
`... send` then emails the edition from Gmail to the AI Daily Google Group, which delivers it to every member (once per day, `news/sent.json`).

- Feeds, sections and topic filter: `scripts/ai_daily/config_ai_daily.json`.
- Email delivery needs two things: the Google Group name in `assets/subscribe.js` (also turns on
  the AI Daily checkbox in the /hi/ and /log/ signup forms) and the `GMAIL_APP_PASSWORD` repository secret
  (optional `GMAIL_ADDRESS`, default juwen12006@gmail.com). Group settings: anyone can join, only owners post.
- Run it by hand: Actions → AI Daily → Run workflow (tick "send" to email).

## Project cards

Most cards are generated from `scripts/apps.json` in [juw12/projects](https://github.com/juw12/projects) by `scripts/publish_portfolio.py` (hourly via `.github/workflows/sync-cards.yml`). Each app has a one-line `summary` (the card text, kept under ~120 characters so every card is the same size) and a full `description` (shown when the card is clicked). Edit the catalog, not the generated block in `index.html`.

## CV & documents

CVs and employer-specific information are shared privately on request.

## Notes

- No frameworks, no build tooling, no external fonts or CDNs.
- Hosted on Cloudflare Pages (no build step, output directory `/`); GitHub Pages kept as a mirror so old links keep working.

## Ownership

Maintained by [@juw12](https://github.com/juw12).
Original commit authorship is preserved.
