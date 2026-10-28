"""render_email.py - email edition of the paper (Outlook, Gmail, Apple Mail safe).

Public API:
    render_email(data: dict, options: dict | None = None) -> str

Table layout, inline styles, no scripts, one hero image, kept well under
Gmail's 102 KB clipping limit. Options mirror render.py (brand, accent,
page_url for "Read on the web", public footer).
"""
from __future__ import annotations

import html
import re

FONT_SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
FONT_SERIF = "Georgia,'Times New Roman',serif"
INK = "#15171a"
INK2 = "#4a4f57"
INK3 = "#80858e"
LINE = "#e7e4dd"
BG = "#f4f2ed"
UP = "#0b7a46"
DOWN = "#c32a1f"


def esc(value) -> str:
    return html.escape(str(value or ""), quote=True)


def safe_url(url) -> str:
    url = str(url or "").strip()
    return url if re.match(r"^https?://", url, re.IGNORECASE) else ""


def _trim(text, limit):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-") + "…"


def _meta(article, accent):
    bits = [esc(article.get("source"))]
    if article.get("published_display"):
        bits.append(esc(article["published_display"]))
    coverage = int(article.get("coverage") or 1)
    if coverage > 1:
        bits.append(f'<span style="color:{accent};font-weight:600;">{coverage} sources</span>')
    return f'<div style="font:12px/1.4 {FONT_SANS};color:{INK3};margin-top:6px;">{" · ".join(bits)}</div>'


def _section_label(text, accent):
    return (
        f'<tr><td style="padding:28px 28px 8px;"><div style="font:700 11px/1 {FONT_SANS};letter-spacing:1.4px;'
        f'text-transform:uppercase;color:{accent};border-bottom:2px solid {INK};padding-bottom:9px;">{esc(text)}</div></td></tr>'
    )


def _headline_row(article, accent, show_summary=True, summary_len=170):
    url = esc(safe_url(article.get("url")))
    summary = _trim(article.get("summary"), summary_len) if show_summary else ""
    summary_html = (
        f'<div style="font:14px/1.5 {FONT_SANS};color:{INK2};margin-top:4px;">{esc(summary)}</div>' if summary else ""
    )
    return (
        f'<tr><td style="padding:12px 28px;border-bottom:1px solid {LINE};">'
        f'<a href="{url}" style="font:700 16px/1.35 {FONT_SERIF};color:{INK};text-decoration:none;">{esc(article.get("title"))}</a>'
        f"{summary_html}{_meta(article, accent)}</td></tr>"
    )


def render_email(data: dict, options: dict | None = None) -> str:
    opts = {
        "brand": "The Morning Paper",
        "accent": "#b4232c",
        "public": False,
        "page_url": "",
        "site_url": "",
        "site_name": "",
        "headlines_per_section": 4,
        "markets_title": "Markets",
    }
    opts.update(options or {})
    accent = opts["accent"]
    front = list(data.get("front_page") or [])
    brief = data.get("brief") or {}
    rows = []

    # Header
    web_link = (
        f'<a href="{esc(opts["page_url"])}" style="color:{INK3};text-decoration:underline;">Read on the web</a>'
        if opts.get("page_url") else ""
    )
    rows.append(
        f'<tr><td style="padding:26px 28px 18px;border-bottom:1px solid {LINE};">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="font:700 24px/1.1 {FONT_SERIF};color:{INK};">'
        f'<span style="display:inline-block;width:12px;height:12px;background:{accent};border-radius:3px;margin-right:8px;"></span>'
        f'{esc(opts["brand"])}</td>'
        f'<td align="right" style="font:12px/1.4 {FONT_SANS};color:{INK3};">{esc(data.get("date_display"))}<br>{web_link}</td>'
        f"</tr></table></td></tr>"
    )

    # The Brief
    bullets = brief.get("bullets") or []
    if bullets:
        ai = brief.get("provider") in ("github-models", "ollama")
        label = "The Brief · AI summary" if ai else "The Brief"
        items = []
        for number, bullet in enumerate(bullets, start=1):
            url = esc(safe_url(bullet.get("url")))
            items.append(
                f'<tr><td valign="top" style="width:26px;padding:9px 0;font:700 15px/1.45 {FONT_SERIF};color:{accent};">{number}</td>'
                f'<td style="padding:9px 0;font:15px/1.5 {FONT_SANS};color:{INK};border-top:{"0" if number == 1 else f"1px solid {LINE}"};">'
                f'{esc(bullet.get("text"))} <a href="{url}" style="color:{INK3};font-size:12px;text-decoration:none;white-space:nowrap;">{esc(bullet.get("source"))}&nbsp;↗</a></td></tr>'
            )
        lede = (
            f'<div style="font:600 17px/1.45 {FONT_SERIF};color:{INK};margin:0 0 8px;">{esc(brief.get("lede"))}</div>'
            if brief.get("lede") else ""
        )
        note = (
            '<div style="font:11px/1.4 ' + FONT_SANS + f';color:{INK3};margin-top:8px;">Written by AI from the linked reporting. Tap through before you quote.</div>'
            if ai else ""
        )
        rows.append(
            f'<tr><td style="padding:22px 28px 6px;">'
            f'<div style="background:#faf9f6;border:1px solid {LINE};border-radius:12px;padding:18px 20px;">'
            f'<div style="font:700 11px/1 {FONT_SANS};letter-spacing:1.4px;text-transform:uppercase;color:{accent};margin-bottom:12px;">{label}</div>'
            f'{lede}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{"".join(items)}</table>{note}'
            f"</div></td></tr>"
        )

    # Lead story
    if front:
        lead = front[0]
        url = esc(safe_url(lead.get("url")))
        image = safe_url(lead.get("image"))
        image_html = (
            f'<a href="{url}"><img src="{esc(image)}" width="544" alt="" '
            f'style="display:block;width:100%;max-width:544px;height:auto;border-radius:10px;margin-bottom:14px;border:0;"></a>'
            if image else ""
        )
        why = lead.get("why")
        why_html = (
            f'<div style="background:#f6f4ef;border-left:3px solid {accent};padding:10px 12px;margin-top:10px;'
            f'font:14px/1.5 {FONT_SANS};color:{INK};"><b style="color:{accent};">Why it matters:</b> {esc(why)}</div>'
            if why else ""
        )
        related = [r for r in lead.get("related") or [] if safe_url(r.get("url"))]
        related_html = ""
        if related:
            links = ", ".join(
                f'<a href="{esc(safe_url(r["url"]))}" style="color:{INK2};">{esc(r.get("source"))}</a>' for r in related
            )
            related_html = f'<div style="font:12px/1.5 {FONT_SANS};color:{INK3};margin-top:8px;">Also reported by {links}</div>'
        rows.append(_section_label("Top story", accent))
        rows.append(
            f'<tr><td style="padding:8px 28px 14px;">{image_html}'
            f'<a href="{url}" style="font:700 23px/1.22 {FONT_SERIF};color:{INK};text-decoration:none;">{esc(lead.get("title"))}</a>'
            f'<div style="font:15px/1.55 {FONT_SANS};color:{INK2};margin-top:8px;">{esc(_trim(lead.get("summary"), 260))}</div>'
            f"{why_html}{_meta(lead, accent)}{related_html}</td></tr>"
        )

    # More top stories
    if len(front) > 1:
        rows.append(_section_label("Also on the front page", accent))
        for article in front[1:]:
            row = _headline_row(article, accent)
            if article.get("why"):
                row = row.replace(
                    "</td></tr>",
                    f'<div style="font:13px/1.5 {FONT_SANS};color:{INK};margin-top:6px;"><b style="color:{accent};">Why it matters:</b> {esc(article["why"])}</div></td></tr>',
                    1,
                )
            rows.append(row)

    # Markets
    markets = data.get("markets") or {}
    quotes = (markets.get("indices") or []) + (markets.get("commodities") or [])
    if quotes:
        cells = []
        for quote in quotes:
            color = UP if quote.get("dir") == "up" else DOWN if quote.get("dir") == "down" else INK3
            sign = "+" if quote.get("dir") == "up" else ""
            cells.append(
                f'<tr><td style="padding:7px 0;border-bottom:1px solid {LINE};font:600 14px {FONT_SANS};color:{INK};">{esc(quote.get("name"))}</td>'
                f'<td align="right" style="padding:7px 0;border-bottom:1px solid {LINE};font:14px Consolas,Menlo,monospace;color:{INK};">{esc(quote.get("price"))}</td>'
                f'<td align="right" style="padding:7px 0 7px 12px;border-bottom:1px solid {LINE};font:600 14px Consolas,Menlo,monospace;color:{color};width:80px;">{sign}{esc(quote.get("pct"))}%</td></tr>'
            )
        movers = []
        watch = (markets.get("watchlist_us") or []) + (markets.get("watchlist_id") or [])

        def _pct(q):
            try:
                return float(str(q.get("pct", "0")).replace(",", ""))
            except ValueError:
                return 0.0

        if watch:
            ranked = sorted(watch, key=_pct)
            picks = ranked[-3:][::-1] + ranked[:3]
            chips = []
            for quote in picks:
                color = UP if _pct(quote) > 0 else DOWN if _pct(quote) < 0 else INK3
                chips.append(
                    f'<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 9px;border:1px solid {LINE};border-radius:999px;'
                    f'font:12px {FONT_SANS};color:{INK};"><b>{esc(quote.get("symbol", "").replace(".JK", ""))}</b> '
                    f'<span style="color:{color};font-weight:600;">{_pct(quote):+.2f}%</span></span>'
                )
            movers.append(
                f'<div style="font:600 11px/1 {FONT_SANS};letter-spacing:1px;text-transform:uppercase;color:{INK3};margin:14px 0 8px;">Watchlist movers</div>'
                + "".join(chips)
            )
        rows.append(_section_label(opts["markets_title"], accent))
        rows.append(
            f'<tr><td style="padding:4px 28px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{"".join(cells)}</table>'
            f'{"".join(movers)}</td></tr>'
        )

    # Sections
    shown = {a.get("url") for a in front}
    for section in data.get("sections") or []:
        articles = [a for a in section.get("articles") or [] if a.get("url") not in shown][: int(opts["headlines_per_section"])]
        if not articles:
            continue
        rows.append(_section_label(section.get("title", ""), accent))
        for article in articles:
            rows.append(_headline_row(article, accent, summary_len=130))

    # Footer
    if opts["public"]:
        footer = (
            f'You get {esc(opts["brand"])} because you subscribed at '
            f'<a href="{esc(opts["site_url"])}" style="color:{INK2};">{esc(opts["site_name"] or opts["site_url"])}</a>. '
            "Curated automatically every morning from public reporting; every story links to its publisher."
        )
    else:
        footer = f'Generated {esc(data.get("generated_at"))} on your PC.'
    rows.append(
        f'<tr><td style="padding:26px 28px 30px;font:12px/1.6 {FONT_SANS};color:{INK3};">{footer}</td></tr>'
    )

    preheader = esc(_trim(brief.get("lede") or (front[0].get("title") if front else ""), 140))
    card = (
        f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        f'style="width:100%;max-width:600px;background:#ffffff;border:1px solid {LINE};border-radius:14px;">'
        f'{"".join(rows)}</table>'
    )
    if opts.get("fragment"):
        # Newsletter platforms wrap the body in their own template + unsubscribe footer.
        return f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>{card}'
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>{esc(opts["brand"])} · {esc(data.get("date_display"))}</title></head>
<body style="margin:0;padding:0;background:{BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid {LINE};border-radius:14px;">
{''.join(rows)}
</table></td></tr></table></body></html>"""
