# Juwen Lie — Portfolio

Interactive personal portfolio for **Juwen Lie** — R&D Mechanical Engineer (Mechanical · Aerospace · AI · Tech · Systems).

A single-page, **zero-dependency** static site with a clean, professional layout: system fonts, light/dark themes (follows the OS setting, remembers your choice), filterable and searchable project cards, and a details dialog per project.

**Live:** https://juw12.github.io/portfolio/

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
| `.github/workflows/pages.yml` | Deploys to GitHub Pages on push to `main` |

## Project cards

Most cards are generated from `scripts/apps.json` in [juw12/projects](https://github.com/juw12/projects) by `scripts/publish_portfolio.py` (hourly via `.github/workflows/sync-cards.yml`). Each app has a one-line `summary` (the card text, kept under ~120 characters so every card is the same size) and a full `description` (shown when the card is clicked). Edit the catalog, not the generated block in `index.html`.

## CV & documents

CVs and employer-specific information are shared privately on request.

## Notes

- No frameworks, no build tooling, no external fonts or CDNs.
- Deployed with GitHub Pages (Source: **GitHub Actions**).

## Ownership

Maintained by [@juw12](https://github.com/juw12).
Original commit authorship is preserved.
