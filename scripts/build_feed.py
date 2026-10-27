"""Build /feed.xml (RSS 2.0) from the projects catalog.

Every project in apps.json becomes one feed item. The catalog has no dates, so the
first time a project id is seen its timestamp is recorded in feed-state.json and kept
forever after. Newsletter tools with RSS-to-email (Buttondown, Kit, Mailchimp, ...)
can watch this feed and email subscribers whenever a new item appears.

Usage:
    python scripts/build_feed.py --apps ../projects/scripts/apps.json --portfolio-dir .
"""
import argparse
import datetime as dt
import html
import json
import pathlib
import re
from email.utils import format_datetime

SITE_URL = "https://juwenlie.pages.dev"
PROJECTS_URL = "https://juw12.github.io/projects"
FEED_TITLE = "Juwen Lie · build log"
FEED_DESCRIPTION = "New engineering tools, CAD models and side projects from Juwen Lie."
# Projects already live before the feed existed are backdated so that an
# RSS-to-email tool connected later does not blast the whole back catalog.
SEED_DATE = dt.datetime(2026, 10, 1, tzinfo=dt.timezone.utc)
MAX_ITEMS = 30
# Catalog entries without links of their own.
LINK_OVERRIDES = {
    "3d-models-library": "https://github.com/juw12/projects/tree/main/outputs/3d-models",
}

LOG_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Build log · Juwen Lie</title>
  <meta name="description" content="Everything Juwen Lie ships: engineering tools, CAD models and side projects, newest first.">
  <link rel="canonical" href="https://juwenlie.pages.dev/log/">
  <link rel="alternate" type="application/rss+xml" title="Juwen Lie · build log" href="https://juwenlie.pages.dev/feed.xml">
  <link rel="icon" type="image/svg+xml" href="../favicon.svg">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
  <style>
    :root {{ --ink:#16181d; --muted:rgba(22,24,29,.68); --faint:rgba(22,24,29,.42); --line:rgba(22,24,29,.14); --bg:#f4f1e8; --red:#ff5a1f; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:"Space Grotesk",system-ui,sans-serif; line-height:1.55;
           background:linear-gradient(rgba(40,70,120,.07) 1px,transparent 1px) 0 0/24px 24px,
                      linear-gradient(90deg,rgba(40,70,120,.07) 1px,transparent 1px) 0 0/24px 24px, var(--bg); }}
    main {{ max-width:720px; margin:0 auto; padding:36px 20px 60px; }}
    .top {{ display:flex; justify-content:space-between; align-items:center; font-family:"JetBrains Mono",monospace; font-size:12px; }}
    .top a {{ color:var(--ink); text-decoration:none; }}
    .mark {{ display:inline-grid; place-items:center; width:34px; height:34px; border:1.5px solid var(--ink); }}
    h1 {{ font-size:44px; letter-spacing:-.03em; line-height:1; margin:30px 0 8px; }}
    .sub {{ color:var(--muted); margin:0 0 22px; }}
    .cta {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:26px; }}
    .cta a {{ padding:9px 14px; border:1px solid var(--ink); color:var(--ink); text-decoration:none; font-weight:600; font-size:14px; background:rgba(255,255,255,.6); }}
    .cta a.primary {{ background:var(--red); border-color:var(--red); color:#fff; }}
    .item {{ display:grid; grid-template-columns:150px 1fr; gap:16px; padding:16px; margin-bottom:10px;
            border:1px solid var(--line); background:rgba(255,255,255,.72); text-decoration:none; color:inherit; transition:border-color .2s; }}
    .item:hover {{ border-color:var(--ink); }}
    .item img {{ width:150px; height:94px; object-fit:cover; border:1px solid var(--line); background:#fff; }}
    .date {{ font-family:"JetBrains Mono",monospace; font-size:11.5px; color:var(--red); text-transform:uppercase; letter-spacing:.06em; }}
    .item h2 {{ margin:2px 0 4px; font-size:18px; }}
    .item p {{ margin:0; font-size:14px; color:var(--muted); }}
    .foot {{ margin-top:26px; font-family:"JetBrains Mono",monospace; font-size:11.5px; color:var(--faint); }}
    .foot a {{ color:inherit; }}
    @media (max-width:560px) {{ .item {{ grid-template-columns:1fr; }} .item img {{ width:100%; height:auto; aspect-ratio:16/10; }} }}
  </style>
</head>
<body>
  <main>
    <div class="top"><a class="mark" href="../hi/" aria-label="Back to Juwen Lie">JL</a><a href="../">Portfolio →</a></div>
    <h1>Build log</h1>
    <p class="sub">Everything I ship (engineering tools, CAD models and side projects), newest first.</p>
    <div class="cta">
      <a class="primary" href="../hi/#log-title">Get new ones by email</a>
      <a href="../feed.xml">Follow in a feed reader (RSS)</a>
    </div>
{items}
    <p class="foot">Updated automatically · <a href="../hi/">juwenlie.pages.dev/hi</a></p>
  </main>
</body>
</html>
"""


def load_apps(apps_path):
    data = json.loads(pathlib.Path(apps_path).read_text(encoding="utf-8-sig"))
    apps = data.get("apps", data) if isinstance(data, dict) else data
    return [app for app in apps if isinstance(app, dict) and app.get("id")]


def plain_text(value):
    text = html.unescape(value or "")
    return re.sub(r"<[^>]+>", "", text).strip()


def project_url(app):
    if app["id"] in LINK_OVERRIDES:
        return LINK_OVERRIDES[app["id"]]
    links = app.get("links") or {}
    for key in ("web", "app", "repo", "release", "download"):
        target = links.get(key)
        if target:
            return target if target.startswith("http") else f"{PROJECTS_URL}/{target}"
    return f"{SITE_URL}/#projects"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apps", required=True)
    parser.add_argument("--portfolio-dir", default=".")
    parser.add_argument("--seed", action="store_true", help="record all current ids with SEED_DATE")
    args = parser.parse_args()

    portfolio = pathlib.Path(args.portfolio_dir)
    state_path = portfolio / "feed-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8-sig")) if state_path.exists() else {}
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)

    apps = load_apps(args.apps)
    new_ids = []
    for app in apps:
        if app["id"] not in state:
            stamp = SEED_DATE if args.seed else now
            state[app["id"]] = stamp.isoformat()
            if not args.seed:
                new_ids.append(app["id"])

    dated = sorted(
        apps,
        key=lambda app: (state[app["id"]], -int(app.get("order", 0) or 0)),
        reverse=True,
    )[:MAX_ITEMS]

    items = []
    for app in dated:
        published = dt.datetime.fromisoformat(state[app["id"]])
        summary = plain_text(app.get("summary") or app.get("description") or app.get("desc"))
        image = app.get("image")
        image_tag = ""
        enclosure = ""
        if image:
            image_url = f"{SITE_URL}/assets/projects/{image}"
            image_tag = f'<p><img src="{html.escape(image_url)}" alt="{html.escape(app.get("image_alt", ""))}" width="600"></p>'
            extension = image.rsplit(".", 1)[-1].lower()
            mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "svg": "image/svg+xml", "webp": "image/webp"}.get(extension, "image/jpeg")
            enclosure = f'      <enclosure url="{html.escape(image_url)}" type="{mime}" length="0"/>\n'
        body = f"{image_tag}<p>{html.escape(summary)}</p>"
        tags = "".join(f"<category>{html.escape(tag)}</category>" for tag in app.get("tags", []))
        link = project_url(app)
        items.append(
            "    <item>\n"
            f"      <title>{html.escape(app.get('name', app['id']))}</title>\n"
            f"      <link>{html.escape(link)}</link>\n"
            f"      <guid isPermaLink=\"false\">juwenlie-project-{html.escape(app['id'])}</guid>\n"
            f"      <pubDate>{format_datetime(published)}</pubDate>\n"
            f"      <description><![CDATA[{body}]]></description>\n"
            f"      <jl:summary>{html.escape(summary)}</jl:summary>\n"
            + enclosure
            +             f"      {tags}\n"
            "    </item>"
        )

    last_build = max((dt.datetime.fromisoformat(stamp) for stamp in state.values()), default=now)
    feed = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:jl="https://juwenlie.pages.dev/ns/feed">\n'
        "  <channel>\n"
        f"    <title>{html.escape(FEED_TITLE)}</title>\n"
        f"    <link>{SITE_URL}/hi/</link>\n"
        f"    <description>{html.escape(FEED_DESCRIPTION)}</description>\n"
        "    <language>en</language>\n"
        f"    <lastBuildDate>{format_datetime(last_build)}</lastBuildDate>\n"
        f'    <atom:link href="{SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>\n'
        + "\n".join(items)
        + "\n  </channel>\n</rss>\n"
    )

    (portfolio / "feed.xml").write_text(feed, encoding="utf-8")

    # Human-readable version of the same list.
    cards = []
    for app in dated:
        published = dt.datetime.fromisoformat(state[app["id"]])
        summary = plain_text(app.get("summary") or app.get("description") or app.get("desc"))
        image_html = ""
        if app.get("image"):
            image_html = f'<img src="../assets/projects/{html.escape(app["image"])}" alt="" loading="lazy">'
        cards.append(
            f'    <a class="item" href="{html.escape(project_url(app))}" target="_blank" rel="noopener">'
            f"{image_html}<div><span class=\"date\">{published.strftime('%d %b %Y')}</span>"
            f"<h2>{html.escape(app.get('name', app['id']))}</h2><p>{html.escape(summary)}</p></div></a>"
        )
    log_dir = portfolio / "log"
    log_dir.mkdir(exist_ok=True)
    (log_dir / "index.html").write_text(LOG_PAGE.format(items="\n".join(cards)), encoding="utf-8")
    state_path.write_text(json.dumps(dict(sorted(state.items())), indent=2) + "\n", encoding="utf-8")
    # Hand-off for scripts/send_build_log.py (not committed; regenerated each run).
    new_items = [
        {
            "id": app["id"],
            "name": app.get("name", app["id"]),
            "summary": plain_text(app.get("summary") or app.get("description") or app.get("desc")),
            "url": project_url(app),
            "image": f"{SITE_URL}/assets/projects/{app['image']}" if app.get("image") else "",
        }
        for app in apps
        if app["id"] in new_ids
    ]
    (portfolio / "new-items.json").write_text(json.dumps(new_items, indent=2), encoding="utf-8")
    print(f"feed.xml: {len(items)} items, {len(state)} tracked ids, {len(new_items)} new this run")


if __name__ == "__main__":
    main()
