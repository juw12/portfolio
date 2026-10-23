# Juwen Lie — Portfolio

Interactive personal portfolio for **Juwen Lie** — R&D Mechanical Engineer (Mechanical · Aerospace · AI · Tech · Systems).

A single-page, **zero-dependency** static site in a "Morning Paper" editorial theme (paper/ink with a newspaper-red accent, Georgia serif type, and newsprint-halftone imagery).

**Live:** https://juwpegatron.github.io/portfolio/

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
| `app.js` | Theme toggle, project filters, timeline reveal, mobile nav, thumbnail swap |
| `assets/projects/` | Project imagery (newsprint-halftone) |
| `assets/qr/` | Contact QR codes (LinkedIn, GitHub, email, bio.site) |
| `.github/workflows/pages.yml` | Deploys to GitHub Pages on push to `main` |

## CV & documents

| File | Purpose |
|---|---|
| `assets/cv/Juwen_Lie_CV_2026.pdf` | Résumé, 1 page (apply-ready) |
| `assets/cv/Juwen_Lie_CV_2026.docx` / `.md` | Editable version |
| `assets/cv/Juwen_Lie_CV_RnD_Mechanical.pdf` / `.docx` | Targeted: mechanical R&D |
| `assets/cv/Juwen_Lie_CV_Product_Systems.pdf` / `.docx` | Targeted: product / systems |
| `assets/cv/Juwen_Lie_CV_2page.pdf` / `.docx` | Expanded, 2 pages |
| `assets/cv/Juwen_Lie_CV_MorningPaper.pdf` | Themed (newspaper look) |
| `assets/cv/Cover_Letter_and_Intro_Templates.md` | Cover-letter / outreach templates |

## Notes

- No frameworks, no build tooling, no external fonts or CDNs.
- Deployed with GitHub Pages (Source: **GitHub Actions**).
