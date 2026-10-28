"""render.py - builds the self-contained web edition of the paper.

Public API:
    render(data: dict, options: dict | None = None) -> str

``data`` follows CONTRACT.md (plus the optional ``brief`` from briefing.py and
``coverage``/``related``/``why`` on articles). ``options`` switches between the
personal Morning Paper and the public AI Daily edition (brand, accent, public
subscribe/archive blocks). The page is a single HTML file: no external fonts,
scripts or CSS, works from file:// and from a web server.
"""
from __future__ import annotations

import html
import json
import re

AUTO_REFRESH_MINUTES = 15

DEFAULT_OPTIONS = {
    "brand": "The Morning Paper",
    "tagline": "Markets, AI, tech & space - curated every morning",
    "accent": "#b4232c",
    "accent_dark": "#ff6b6b",
    "public": False,
    "auto_refresh_minutes": AUTO_REFRESH_MINUTES,
    "markets_title": "Markets",
    "watchlist_titles": {"watchlist_us": "US watchlist", "watchlist_id": "Indonesia watchlist"},
    "site_url": "",
    "site_name": "",
    "page_url": "",
    "rss_url": "",
    "archive": [],
    "subscribe_group": "",
    "subscribe_note": "",
    "og_image": "",
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def esc(value) -> str:
    return html.escape(str(value or ""), quote=True)


def safe_url(url) -> str:
    url = str(url or "").strip()
    return url if re.match(r"^https?://", url, re.IGNORECASE) else ""


def _initials(text: str) -> str:
    words = [w for w in re.split(r"\W+", text or "") if w]
    return "".join(w[0] for w in words[:2]).upper() or "•"


def _sparkline(values, direction: str, width: int = 96, height: int = 28) -> str:
    points = [float(v) for v in values or [] if v is not None]
    if len(points) < 2:
        return ""
    low, high = min(points), max(points)
    span = (high - low) or 1.0
    step = width / (len(points) - 1)
    coords = " ".join(
        f"{i * step:.1f},{height - 3 - (p - low) / span * (height - 6):.1f}" for i, p in enumerate(points)
    )
    return (
        f'<svg class="spark {esc(direction)}" viewBox="0 0 {width} {height}" preserveAspectRatio="none" aria-hidden="true">'
        f'<polyline points="{coords}" fill="none" stroke="currentColor" stroke-width="1.8" '
        f'stroke-linejoin="round" stroke-linecap="round"/></svg>'
    )


def _arrow(direction: str) -> str:
    return {"up": "▲", "down": "▼"}.get(direction, "■")


def _pct(quote: dict) -> str:
    pct = str(quote.get("pct", "0"))
    sign = "+" if quote.get("dir") == "up" and not pct.startswith("+") else ""
    return f"{sign}{pct}%"


def _story_text(article: dict) -> str:
    return esc(" ".join([
        article.get("title", ""), article.get("summary", ""), article.get("source", ""),
        " ".join(article.get("tags") or []),
    ]).lower())


def _meta_row(article: dict, show_coverage: bool = True) -> str:
    parts = [f'<span class="src">{esc(article.get("source"))}</span>']
    if article.get("published_display"):
        parts.append(f'<time datetime="{esc(article.get("published_iso"))}">{esc(article.get("published_display"))}</time>')
    coverage = int(article.get("coverage") or 1)
    if show_coverage and coverage > 1:
        parts.append(f'<span class="cov" title="Reported by {coverage} outlets">{coverage} sources</span>')
    return '<div class="meta">' + '<span class="dot" aria-hidden="true">·</span>'.join(parts) + "</div>"


def _related(article: dict) -> str:
    related = [r for r in article.get("related") or [] if safe_url(r.get("url"))]
    if not related:
        return ""
    items = "".join(
        f'<li><a href="{esc(safe_url(r["url"]))}" target="_blank" rel="noopener">'
        f'<b>{esc(r.get("source"))}</b> {esc(r.get("title"))}</a></li>'
        for r in related
    )
    return f'<details class="related"><summary>Also reported by {len(related)} more</summary><ul>{items}</ul></details>'


def _image(article: dict, css_class: str, eager: bool = False) -> str:
    url = safe_url(article.get("image"))
    if not url:
        return ""
    loading = "eager" if eager else "lazy"
    return (
        f'<div class="{css_class}"><img src="{esc(url)}" alt="" loading="{loading}" '
        f'referrerpolicy="no-referrer" onerror="this.parentNode.classList.add(\'noimg\');this.remove()"></div>'
    )


def _kicker(article: dict, section_titles: dict) -> str:
    label = section_titles.get(article.get("section"), "")
    tags = article.get("tags") or []
    if tags:
        label = f"{label} · {tags[0]}" if label else tags[0]
    return f'<p class="kicker">{esc(label)}</p>' if label else ""


# --------------------------------------------------------------------------- #
# Blocks
# --------------------------------------------------------------------------- #

def _lead(article: dict, section_titles: dict) -> str:
    url = esc(safe_url(article.get("url")))
    why = article.get("why")
    why_html = f'<p class="why"><span>Why it matters</span>{esc(why)}</p>' if why else ""
    image = _image(article, "lead-media", eager=True) or (
        f'<div class="lead-media placeholder" aria-hidden="true"><span>{esc(_initials(article.get("source", "")))}</span></div>'
    )
    return f"""
<article class="story lead" data-text="{_story_text(article)}">
  <a class="story-link" href="{url}" target="_blank" rel="noopener">{image}</a>
  <div class="lead-body">
    {_kicker(article, section_titles)}
    <h2><a class="story-link" href="{url}" target="_blank" rel="noopener">{esc(article.get("title"))}</a></h2>
    <p class="dek">{esc(article.get("summary"))}</p>
    {why_html}
    {_meta_row(article)}
    {_related(article)}
  </div>
</article>"""


def _card(article: dict, section_titles: dict) -> str:
    url = esc(safe_url(article.get("url")))
    why = article.get("why")
    body = f'<p class="why small"><span>Why it matters</span>{esc(why)}</p>' if why else f'<p class="dek">{esc(article.get("summary"))}</p>'
    return f"""
<article class="story card" data-text="{_story_text(article)}">
  <a class="story-link" href="{url}" target="_blank" rel="noopener">{_image(article, "card-media")}</a>
  {_kicker(article, section_titles)}
  <h3><a class="story-link" href="{url}" target="_blank" rel="noopener">{esc(article.get("title"))}</a></h3>
  {body}
  {_meta_row(article)}
</article>"""


def _row(article: dict, number: int | None = None, thumb: bool = True) -> str:
    url = esc(safe_url(article.get("url")))
    num = f'<span class="num">{number:02d}</span>' if number is not None else ""
    image = _image(article, "row-media") if thumb else ""
    summary = article.get("summary") or ""
    return f"""
<article class="story row" data-text="{_story_text(article)}">
  {num}
  <div class="row-body">
    <h4><a class="story-link" href="{url}" target="_blank" rel="noopener">{esc(article.get("title"))}</a></h4>
    {f'<p class="dek clamp2">{esc(summary)}</p>' if summary else ''}
    {_meta_row(article)}
  </div>
  {f'<a class="story-link" href="{url}" target="_blank" rel="noopener" tabindex="-1">{image}</a>' if image else ''}
</article>"""


def _brief(data: dict) -> str:
    brief = data.get("brief") or {}
    bullets = brief.get("bullets") or []
    if not bullets:
        return ""
    items = []
    for bullet in bullets:
        url = safe_url(bullet.get("url"))
        source = esc(bullet.get("source"))
        link = f' <a href="{esc(url)}" target="_blank" rel="noopener" class="brief-src">{source} ↗</a>' if url else ""
        items.append(f"<li><p>{esc(bullet.get('text'))}{link}</p></li>")
    provider = brief.get("provider")
    stories = brief.get("story_count", 0)
    sources = brief.get("source_count", 0)
    if provider in ("github-models", "ollama"):
        badge = '<span class="ai-badge" title="Written by AI from the stories below">✦ AI summary</span>'
        note = f"Summarised by AI from {stories} stories across {sources} outlets. Facts come from the linked reporting; tap through before you quote."
    else:
        badge = '<span class="ai-badge plain">Top headlines</span>'
        note = f"The day's most-reported stories, ranked across {sources} outlets."
    lede = f'<p class="brief-lede">{esc(brief.get("lede"))}</p>' if brief.get("lede") else ""
    return f"""
<aside class="brief" id="brief" aria-labelledby="brief-title">
  <div class="brief-head"><h2 id="brief-title">The Brief</h2>{badge}</div>
  {lede}
  <ol class="brief-list">{''.join(items)}</ol>
  <p class="brief-note">{esc(note)}</p>
</aside>"""


def _quote_card(quote: dict) -> str:
    direction = quote.get("dir", "flat")
    return f"""
<div class="qcard {esc(direction)}">
  <div class="qtop"><span class="qname">{esc(quote.get("name"))}</span><span class="qpct">{_arrow(direction)} {esc(_pct(quote))}</span></div>
  <div class="qprice">{esc(quote.get("price"))}</div>
  {_sparkline(quote.get("spark"), direction)}
</div>"""


def _watch_table(title: str, quotes: list) -> str:
    if not quotes:
        return ""
    max_abs = max((abs(float(str(q.get("pct", "0")).replace(",", "") or 0)) for q in quotes), default=1.0) or 1.0
    rows = []
    for quote in sorted(quotes, key=lambda q: -float(str(q.get("pct", "0")).replace(",", "") or 0)):
        direction = quote.get("dir", "flat")
        try:
            magnitude = abs(float(str(quote.get("pct", "0")).replace(",", ""))) / max_abs * 100
        except ValueError:
            magnitude = 0
        rows.append(f"""
<tr class="{esc(direction)}">
  <td><b>{esc(quote.get("symbol", "").replace(".JK", ""))}</b><span>{esc(quote.get("name"))}</span></td>
  <td class="num">{esc(quote.get("price"))}</td>
  <td class="bar"><i style="width:{magnitude:.0f}%"></i></td>
  <td class="num chg">{esc(_pct(quote))}</td>
</tr>""")
    return f'<div class="watch"><h3>{esc(title)}</h3><table>{"".join(rows)}</table></div>'


def _markets(data: dict, opts: dict) -> str:
    markets = data.get("markets") or {}
    cards = (markets.get("indices") or []) + (markets.get("commodities") or [])
    tables = "".join(
        _watch_table(opts["watchlist_titles"].get(key, key), markets.get(key) or [])
        for key in ("watchlist_us", "watchlist_id")
    )
    if not cards and not tables:
        return ""
    notes = markets.get("summary_notes") or {}
    note_html = "".join(f"<p>{esc(n)}</p>" for n in notes.values() if n)
    private = "".join(
        f'<p class="private"><b>{esc(p.get("name"))}</b> {esc(p.get("note"))}</p>'
        for p in markets.get("private_watch") or []
    )
    return f"""
<section class="block markets" id="markets" aria-labelledby="markets-title">
  <header class="block-head"><h2 id="markets-title">{esc(opts["markets_title"])}</h2><p>Last close · 5-day trend</p></header>
  <div class="qgrid">{''.join(_quote_card(q) for q in cards)}</div>
  {f'<div class="mnotes">{note_html}</div>' if note_html else ''}
  {f'<div class="watchgrid">{tables}</div>' if tables else ''}
  {private}
</section>"""


def _section(section: dict, section_titles: dict) -> str:
    articles = section.get("articles") or []
    if not articles:
        return ""
    featured = next((a for a in articles if safe_url(a.get("image"))), articles[0])
    rest = [a for a in articles if a is not featured]
    return f"""
<section class="block section" id="s-{esc(section.get("id"))}" aria-labelledby="t-{esc(section.get("id"))}">
  <header class="block-head"><h2 id="t-{esc(section.get("id"))}">{esc(section.get("title"))}</h2><p>{esc(section.get("subtitle"))}</p></header>
  <div class="sgrid">
    {_card(featured, section_titles)}
    <div class="slist">{''.join(_row(a) for a in rest)}</div>
  </div>
</section>"""


def _subscribe(opts: dict) -> str:
    group = str(opts.get("subscribe_group") or "").strip()
    rss = esc(opts.get("rss_url"))
    if group:
        join = f"{group}+subscribe@googlegroups.com"
        mailto = f"mailto:{join}?subject=Subscribe%20me%20to%20AI%20Daily&body=Just%20press%20Send."
        form = f"""
  <div class="subform">
    <a class="subbtn" href="{esc(mailto)}">Subscribe free by email</a>
    <a class="subalt" href="https://groups.google.com/g/{esc(group)}" target="_blank" rel="noopener">or join with Google</a>
  </div>"""
        steps = f"Press Send in the email that opens, then confirm Google's reply. No email app? Send any email to {esc(join)}."
    else:
        form = f'<p class="soon">Email delivery opens shortly. Until then, follow along via <a href="{rss}">RSS</a>.</p>'
        steps = ""
    return f"""
<section class="block subscribe" id="subscribe" aria-labelledby="sub-title">
  <div>
    <h2 id="sub-title">Get {esc(opts["brand"])} in your inbox</h2>
    <p>{esc(opts.get("subscribe_note") or "One calm email every morning: the AI brief, the stories that matter and why. Free, no spam, unsubscribe anytime.")}</p>
  </div>
  {form}
  <p class="fine">{esc(steps)} <a href="{rss}">RSS feed</a>{f' · <a href="{esc(opts["site_url"])}">More from {esc(opts["site_name"])}</a>' if opts.get("site_url") else ''}</p>
</section>"""


def _archive(opts: dict) -> str:
    entries = opts.get("archive") or []
    if not entries:
        return ""
    items = "".join(
        f'<li><a href="{esc(e.get("url"))}"><time>{esc(e.get("label"))}</time><span>{esc(e.get("headline"))}</span></a></li>'
        for e in entries[:14]
    )
    return f"""
<section class="block archive" id="archive" aria-labelledby="arch-title">
  <header class="block-head"><h2 id="arch-title">Past editions</h2><p>Every edition stays online</p></header>
  <ol class="arch">{items}</ol>
</section>"""


# --------------------------------------------------------------------------- #
# Page
# --------------------------------------------------------------------------- #

def render(data: dict, options: dict | None = None) -> str:
    opts = dict(DEFAULT_OPTIONS)
    opts.update(options or {})
    sections = [s for s in data.get("sections") or [] if s.get("articles")]
    section_titles = {s.get("id"): s.get("title", "") for s in sections}
    front = list(data.get("front_page") or [])
    stats = data.get("stats") or {}

    lead_html = _lead(front[0], section_titles) if front else ""
    cards_html = "".join(_card(a, section_titles) for a in front[1:4])
    list_html = "".join(_row(a, number=i, thumb=False) for i, a in enumerate(front[4:], start=5))
    brief_html = _brief(data)
    markets_html = _markets(data, opts)
    sections_html = "".join(_section(s, section_titles) for s in sections)
    subscribe_html = _subscribe(opts) if opts["public"] else ""
    archive_html = _archive(opts) if opts["public"] else ""

    tabs = ['<a href="#top">Top</a>']
    if brief_html:
        tabs.append('<a href="#brief">Brief</a>')
    if markets_html:
        tabs.append(f'<a href="#markets">{esc(opts["markets_title"])}</a>')
    tabs += [f'<a href="#s-{esc(s["id"])}">{esc(s["title"])}</a>' for s in sections]
    if archive_html:
        tabs.append('<a href="#archive">Archive</a>')
    if subscribe_html:
        tabs.append('<a href="#subscribe" class="tab-cta">Subscribe</a>')

    sources = sorted({a.get("source") for s in sections for a in s.get("articles") or [] if a.get("source")})
    title = f'{opts["brand"]} · {data.get("date_display", "")}'
    description = (data.get("brief") or {}).get("lede") or opts["tagline"]
    refresh = int(opts.get("auto_refresh_minutes") or 0)

    head_extra = []
    if opts.get("page_url"):
        head_extra.append(f'<link rel="canonical" href="{esc(opts["page_url"])}">')
        head_extra.append(f'<meta property="og:url" content="{esc(opts["page_url"])}">')
    if opts.get("rss_url"):
        head_extra.append(f'<link rel="alternate" type="application/rss+xml" title="{esc(opts["brand"])}" href="{esc(opts["rss_url"])}">')
    if opts.get("og_image"):
        head_extra.append(f'<meta property="og:image" content="{esc(opts["og_image"])}"><meta name="twitter:card" content="summary_large_image">')

    config_js = json.dumps({"refresh": refresh})
    brand_mark = esc(_initials(opts["brand"]))
    home_link = (
        f'<a class="byline" href="{esc(opts["site_url"])}">by {esc(opts["site_name"])}</a>'
        if opts.get("site_url") else ""
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e0f11" media="(prefers-color-scheme: dark)">
{''.join(head_extra)}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='{opts["accent"].replace("#", "%23")}'/%3E%3Ctext x='32' y='43' font-family='Georgia,serif' font-size='30' font-weight='700' fill='white' text-anchor='middle'%3E{brand_mark}%3C/text%3E%3C/svg%3E">
<script>(function(){{try{{var t=localStorage.getItem("mp-theme");if(!t){{t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}}document.documentElement.setAttribute("data-theme",t);}}catch(e){{}}}})();</script>
<style>{_css(opts)}</style>
</head>
<body>
<a class="skip" href="#top">Skip to stories</a>
<header class="bar">
  <div class="bar-in">
    <a class="brand" href="#top"><span class="mark" aria-hidden="true">{brand_mark}</span><span class="wordmark">{esc(opts["brand"])}</span></a>
    <div class="dateline"><b>{esc(data.get("date_display"))}</b><span>{esc(data.get("edition", "").title())} · Updated {esc(data.get("time_display") or data.get("generated_at", "")[-5:])}</span></div>
    <label class="search"><span class="vh">Search stories</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="q" type="search" placeholder="Search today's stories" autocomplete="off"><kbd>/</kbd>
    </label>
    <button class="icon" id="theme" type="button" aria-label="Toggle dark mode">
      <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
      <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    </button>
  </div>
  <nav class="tabs" aria-label="Sections"><div class="tabs-in">{''.join(tabs)}</div></nav>
</header>

<main class="wrap" id="top">
  <div class="hello">
    <p class="tagline">{esc(opts["tagline"])} {home_link}</p>
    <p class="stats"><b>{stats.get("articles", 0)}</b> stories · <b>{stats.get("sources", 0)}</b> outlets · <b>{stats.get("scanned", stats.get("articles", 0))}</b> headlines scanned{f' · <b>{stats.get("multi_source")}</b> multi-source' if stats.get("multi_source") else ''}</p>
  </div>
  <p class="noresults" id="noresults" hidden>No stories match your search.</p>

  <section class="front" aria-label="Top stories">
    <div class="front-grid">
      {lead_html}
      {brief_html}
    </div>
    {f'<div class="cards3">{cards_html}</div>' if cards_html else ''}
    {f'<div class="more-top"><h3 class="eyebrow">Also on the front page</h3>{list_html}</div>' if list_html else ''}
  </section>

  {subscribe_html if opts["public"] else ''}
  {markets_html}
  {sections_html}
  {archive_html}
</main>

<footer class="foot">
  <div class="foot-in">
    <p><b>{esc(opts["brand"])}</b> · {esc(data.get("date_display"))} · generated {esc(data.get("generated_at"))}</p>
    <p class="srcs">Sources: {esc(", ".join(sources))}. Headlines and summaries belong to their publishers; every story links to the original.</p>
  </div>
</footer>

<script>window.MP={config_js};{_js()}</script>
</body>
</html>"""


def _css(opts: dict) -> str:
    return """
:root{--bg:#f7f6f2;--surface:#fff;--ink:#14161a;--ink2:#474c55;--ink3:#80858e;--line:#e7e4dd;--line2:#d9d5cc;
--accent:ACCENT;--up:#0b7a46;--down:#c32a1f;--flat:#7b818a;--chip:#f0eee8;--r:16px;
--serif:"Charter","Bitstream Charter","Sitka Text","Iowan Old Style",Cambria,Georgia,serif;
--sans:system-ui,-apple-system,"Segoe UI Variable Text","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;
--mono:ui-monospace,"Cascadia Mono","SF Mono",Consolas,monospace;color-scheme:light}
[data-theme=dark]{--bg:#0e0f11;--surface:#16181b;--ink:#ecebe7;--ink2:#b9b7b1;--ink3:#878580;--line:#24272b;--line2:#30343a;
--accent:ACCENT_DARK;--up:#3ccf8e;--down:#ff6b5e;--chip:#1d2024;color-scheme:dark}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:120px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:inherit;text-decoration:none}img{display:block;max-width:100%}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.skip{position:absolute;left:-999px}.skip:focus{left:12px;top:12px;z-index:99;background:var(--surface);padding:8px 12px;border-radius:8px}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
/* bar */
.bar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line)}
.bar-in{max-width:1240px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:18px}
.brand{display:flex;align-items:center;gap:10px;flex-shrink:0}
.mark{width:34px;height:34px;border-radius:10px;background:var(--accent);color:#fff;display:grid;place-items:center;font:700 15px var(--serif);letter-spacing:.02em}
.wordmark{font:700 22px/1 var(--serif);letter-spacing:-.015em}
.dateline{display:flex;flex-direction:column;line-height:1.2;font-size:12.5px;color:var(--ink3);padding-left:16px;border-left:1px solid var(--line2)}
.dateline b{color:var(--ink2);font-weight:600}
.search{margin-left:auto;display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:7px 12px;min-width:260px;transition:border-color .15s}
.search:focus-within{border-color:var(--accent)}
.search svg{width:16px;height:16px;fill:none;stroke:var(--ink3);stroke-width:2}
.search input{border:0;background:none;color:var(--ink);font:inherit;font-size:14px;outline:none;width:100%}
.search kbd{font:11px var(--mono);color:var(--ink3);border:1px solid var(--line2);border-radius:5px;padding:1px 6px}
.icon{width:38px;height:38px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink2);display:grid;place-items:center;cursor:pointer}
.icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8}
.sun{display:none}[data-theme=dark] .sun{display:block}[data-theme=dark] .moon{display:none}
.tabs{border-top:1px solid var(--line)}
.tabs-in{max-width:1240px;margin:0 auto;padding:0 24px;display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
.tabs-in::-webkit-scrollbar{display:none}
.tabs a{flex-shrink:0;font-size:13.5px;font-weight:550;color:var(--ink3);padding:10px 12px;border-bottom:2px solid transparent;transition:color .15s}
.tabs a:hover{color:var(--ink)}.tabs a.on{color:var(--ink);border-bottom-color:var(--accent)}
.tabs a.tab-cta{color:var(--accent)}
/* layout */
.wrap{max-width:1240px;margin:0 auto;padding:22px 24px 40px}
.hello{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.tagline{margin:0;font:italic 17px var(--serif);color:var(--ink2)}
.byline{font:600 13px var(--sans);font-style:normal;color:var(--accent);margin-left:6px}
.stats{margin:0;font-size:12.5px;color:var(--ink3)}.stats b{color:var(--ink2);font-weight:600}
.noresults{padding:40px;text-align:center;color:var(--ink3);background:var(--surface);border:1px dashed var(--line2);border-radius:var(--r)}
.front-grid{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(300px,1fr);gap:22px;align-items:start}
/* story bits */
.kicker{margin:0 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;color:var(--ink3)}
.meta .src{font-weight:650;color:var(--ink2)}.meta .dot{opacity:.6}
.cov{display:inline-flex;align-items:center;gap:5px;font-weight:650;color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);padding:2px 8px;border-radius:999px;font-size:11.5px}
.cov::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.dek{margin:0 0 12px;color:var(--ink2)}
.clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.why{margin:0 0 14px;padding:12px 14px;border-radius:12px;background:var(--chip);color:var(--ink);font-size:15px}
.why span{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:3px}
.why.small{font-size:14px;padding:10px 12px}
.story h2 a,.story h3 a,.story h4 a{background:linear-gradient(currentColor,currentColor) 0 100%/0 1px no-repeat;transition:background-size .25s}
.story h2 a:hover,.story h3 a:hover,.story h4 a:hover{background-size:100% 1px}
.story.is-read h2,.story.is-read h3,.story.is-read h4{color:var(--ink3)}
.story.is-read .meta::after{content:"Read";margin-left:4px;font-size:11px;padding:1px 7px;border:1px solid var(--line2);border-radius:999px}
.related{margin-top:12px;font-size:13.5px}
.related summary{cursor:pointer;color:var(--ink2);font-weight:600;list-style:none}
.related summary::-webkit-details-marker{display:none}
.related summary::before{content:"+ ";color:var(--accent)}.related[open] summary::before{content:"– "}
.related ul{margin:8px 0 0;padding:0;list-style:none;border-left:2px solid var(--line2)}
.related li a{display:block;padding:5px 12px;color:var(--ink2)}.related li a:hover{color:var(--ink)}
.related b{color:var(--ink);font-weight:650;margin-right:4px}
/* lead */
.lead{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.lead-media{aspect-ratio:16/8.4;background:var(--chip);overflow:hidden}
.lead-media img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
.lead:hover .lead-media img{transform:scale(1.02)}
.placeholder{display:grid;place-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,var(--chip)),var(--chip))}
.placeholder span{font:700 56px var(--serif);color:color-mix(in srgb,var(--accent) 55%,transparent)}
.noimg{display:none}
.lead-body{padding:22px 26px 24px}
.lead h2{margin:0 0 10px;font:700 clamp(26px,3vw,36px)/1.14 var(--serif);letter-spacing:-.018em}
.lead .dek{font-size:17px}
/* brief */
.brief{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:22px 22px 18px;position:sticky;top:122px}
.brief-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.brief h2{margin:0;font:700 24px var(--serif);letter-spacing:-.01em}
.ai-badge{font-size:11.5px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 11%,transparent);padding:4px 10px;border-radius:999px;white-space:nowrap}
.ai-badge.plain{color:var(--ink2);background:var(--chip)}
.brief-lede{margin:0 0 14px;font:500 16.5px/1.45 var(--serif);color:var(--ink)}
.brief-list{margin:0;padding:0;list-style:none;counter-reset:b}
.brief-list li{counter-increment:b;display:grid;grid-template-columns:28px 1fr;gap:6px;padding:11px 0;border-top:1px solid var(--line)}
.brief-list li::before{content:counter(b);font:700 15px var(--serif);color:var(--accent)}
.brief-list p{margin:0;font-size:14.5px;line-height:1.5;color:var(--ink2)}
.brief-src{font-size:12px;font-weight:650;color:var(--ink3);white-space:nowrap}.brief-src:hover{color:var(--accent)}
.brief-note{margin:10px 0 0;font-size:11.5px;color:var(--ink3);line-height:1.45}
/* cards */
.cards3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:22px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:0 0 18px;overflow:hidden;display:flex;flex-direction:column}
.card>.kicker,.card>h3,.card>.dek,.card>.why,.card>.meta{margin-left:18px;margin-right:18px}
.card>.kicker{margin-top:16px}
.card-media{aspect-ratio:16/9;background:var(--chip);overflow:hidden}
.card-media img{width:100%;height:100%;object-fit:cover}
.card h3{margin:0 18px 8px;font:700 19px/1.25 var(--serif);letter-spacing:-.01em}
.card>.kicker:first-child{margin-top:18px}
.card .dek{font-size:14.5px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card .meta{margin-top:auto}
.more-top{margin-top:26px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:6px 22px}
.eyebrow{margin:14px 0 2px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
/* rows */
.row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:start;padding:14px 0;border-top:1px solid var(--line)}
.more-top .row:first-of-type{border-top:0}
.row .num{font:700 15px var(--serif);color:var(--accent);padding-top:2px}
.row h4{margin:0 0 4px;font:650 16.5px/1.3 var(--serif)}
.row .dek{font-size:14px;margin-bottom:6px}
.row-media{width:112px;aspect-ratio:4/3;border-radius:10px;overflow:hidden;background:var(--chip)}
.row-media img{width:100%;height:100%;object-fit:cover}
/* blocks */
.block{margin-top:44px}
.block-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding-bottom:12px;margin-bottom:18px;border-bottom:2px solid var(--ink)}
.block-head h2{margin:0;font:700 26px var(--serif);letter-spacing:-.015em}
.block-head p{margin:0;font-size:13.5px;color:var(--ink3)}
.sgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);gap:26px;align-items:start}
.slist .row:first-child{border-top:0;padding-top:0}
/* markets */
.qgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.qcard{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px 10px}
.qtop{display:flex;justify-content:space-between;gap:8px;font-size:12.5px}
.qname{font-weight:650;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qpct{font:600 12px var(--mono);white-space:nowrap}
.qprice{font:650 21px var(--mono);letter-spacing:-.02em;margin:4px 0 2px}
.spark{width:100%;height:28px;display:block}
.up .qpct,.up .spark,tr.up .chg{color:var(--up)}.down .qpct,.down .spark,tr.down .chg{color:var(--down)}.flat .qpct,.flat .spark{color:var(--flat)}
.mnotes{margin:14px 0 0;font-size:14px;color:var(--ink2)}.mnotes p{margin:4px 0}
.watchgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px;margin-top:18px}
.watch{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px 18px}
.watch h3{margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.watch table{width:100%;border-collapse:collapse;font-size:14px}
.watch td{padding:7px 0;border-top:1px solid var(--line);vertical-align:middle}
.watch tr:first-child td{border-top:0}
.watch td b{font:650 13px var(--mono);margin-right:8px}.watch td span{color:var(--ink3);font-size:12.5px}
.watch .num{text-align:right;font:13px var(--mono);white-space:nowrap;padding-left:10px}
.watch .chg{font-weight:650;width:72px}
.watch .bar{width:22%;padding:0 4px 0 14px}
.watch .bar i{display:block;height:5px;border-radius:3px;background:currentColor;opacity:.75;min-width:2px}
tr.up .bar{color:var(--up)}tr.down .bar{color:var(--down)}tr.flat .bar{color:var(--flat)}
.private{font-size:13px;color:var(--ink3);margin:12px 0 0}
/* subscribe */
.subscribe{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:10px 28px;align-items:center;padding:26px 28px;border-radius:var(--r);background:var(--ink);color:var(--bg)}
.subscribe h2{margin:0 0 6px;font:700 24px var(--serif)}.subscribe p{margin:0;opacity:.82;font-size:15px}
.subform{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.subbtn{padding:12px 18px;border-radius:12px;background:var(--accent);color:#fff;font:650 15px var(--sans);white-space:nowrap}
.subbtn:hover{filter:brightness(1.08)}
.subalt{font-size:14px;text-decoration:underline;opacity:.85}
.subform input{flex:1;min-width:0;padding:12px 14px;border-radius:12px;border:1px solid transparent;font:inherit;background:var(--bg);color:var(--ink)}
.subform button{padding:12px 18px;border:0;border-radius:12px;background:var(--accent);color:#fff;font:650 15px var(--sans);cursor:pointer;white-space:nowrap}
.subscribe .fine{grid-column:1/-1;font-size:12.5px;opacity:.7}.subscribe .fine a,.subscribe .soon a{text-decoration:underline}
/* archive */
.arch{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.arch a{display:flex;flex-direction:column;gap:2px;padding:12px 14px;background:var(--surface);border:1px solid var(--line);border-radius:12px}
.arch time{font-size:12px;font-weight:700;color:var(--accent)}.arch span{font:600 14.5px/1.35 var(--serif)}
/* footer */
.foot{border-top:1px solid var(--line);margin-top:40px}
.foot-in{max-width:1240px;margin:0 auto;padding:22px 24px 40px;font-size:12.5px;color:var(--ink3)}
.foot p{margin:4px 0}.foot b{color:var(--ink2)}
/* search state */
.story.hit-hide{display:none}.block.hit-hide{display:none}
/* responsive */
@media (max-width:1020px){.front-grid{grid-template-columns:1fr}.brief{position:static}.cards3{grid-template-columns:1fr 1fr}.cards3 .card:nth-child(3){display:none}.sgrid{grid-template-columns:1fr}.dateline{display:none}.subscribe{grid-template-columns:1fr}}
@media (max-width:640px){.bar-in{padding:10px 16px;gap:10px}.search{min-width:0;flex:1}.search kbd{display:none}.wordmark{font-size:18px}.wrap{padding:16px 16px 32px}.tabs-in{padding:0 12px}
.cards3{grid-template-columns:1fr}.cards3 .card:nth-child(3){display:flex}.lead-body{padding:18px}.row-media{width:84px}.hello{display:block}.stats{margin-top:4px}.subform{flex-direction:column}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
@media print{.bar,.subscribe,.related,.foot{display:none}body{background:#fff}.lead,.card,.brief,.more-top,.watch,.qcard{border-color:#ccc}}
""".replace("ACCENT_DARK", opts.get("accent_dark", opts["accent"])).replace("ACCENT", opts["accent"])


def _js() -> str:
    return r"""
(function(){
var d=document,root=d.documentElement;
var tb=d.getElementById("theme");
if(tb){tb.addEventListener("click",function(){var n=root.getAttribute("data-theme")==="dark"?"light":"dark";root.setAttribute("data-theme",n);try{localStorage.setItem("mp-theme",n);}catch(e){}});}
// read tracking
var KEY="mp-read",read={};
try{(JSON.parse(localStorage.getItem(KEY)||"[]")).forEach(function(u){read[u]=1;});}catch(e){}
function mark(){d.querySelectorAll(".story").forEach(function(s){var a=s.querySelector("a.story-link");if(a&&read[a.href]){s.classList.add("is-read");}});}
mark();
d.addEventListener("click",function(ev){var a=ev.target.closest&&ev.target.closest("a.story-link");if(!a)return;read[a.href]=1;var list=Object.keys(read).slice(-600);try{localStorage.setItem(KEY,JSON.stringify(list));}catch(e){}setTimeout(mark,300);});
// search
var q=d.getElementById("q"),none=d.getElementById("noresults");
function filter(){var term=(q.value||"").trim().toLowerCase(),shown=0;
d.querySelectorAll(".story").forEach(function(s){var ok=!term||(s.getAttribute("data-text")||"").indexOf(term)>-1;s.classList.toggle("hit-hide",!ok);if(ok)shown++;});
d.querySelectorAll(".block.section,.more-top").forEach(function(b){b.classList.toggle("hit-hide",!!term&&!b.querySelector(".story:not(.hit-hide)"));});
d.querySelectorAll(".brief,.markets,.subscribe,.archive").forEach(function(b){b.classList.toggle("hit-hide",!!term);});
if(none)none.hidden=!(term&&shown===0);}
if(q){q.addEventListener("input",filter);d.addEventListener("keydown",function(e){if(e.key==="/"&&d.activeElement!==q){e.preventDefault();q.focus();}else if(e.key==="Escape"&&d.activeElement===q){q.value="";filter();q.blur();}});}
// scroll spy
var tabs=[].slice.call(d.querySelectorAll(".tabs a[href^='#']"));
if("IntersectionObserver" in window){var byId={};tabs.forEach(function(t){byId[t.getAttribute("href").slice(1)]=t;});
var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting&&byId[en.target.id]){tabs.forEach(function(t){t.classList.remove("on");});byId[en.target.id].classList.add("on");byId[en.target.id].scrollIntoView({block:"nearest",inline:"center"});}});},{rootMargin:"-130px 0px -60% 0px"});
Object.keys(byId).forEach(function(id){var el=d.getElementById(id);if(el)io.observe(el);});}
// gentle auto refresh that keeps your place
var mins=(window.MP&&window.MP.refresh)||0;
if(mins>0&&location.protocol==="file:"){try{var y=sessionStorage.getItem("mp_scroll");if(y!==null){window.scrollTo(0,parseInt(y,10)||0);}
addEventListener("scroll",function(){sessionStorage.setItem("mp_scroll",String(scrollY));},{passive:true});}catch(e){}
setTimeout(function(){if(!q||!q.value){location.reload();}},mins*60000);}
})();
"""
