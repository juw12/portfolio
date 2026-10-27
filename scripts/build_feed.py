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


def load_apps(apps_path):
    data = json.loads(pathlib.Path(apps_path).read_text(encoding="utf-8"))
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
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)

    apps = load_apps(args.apps)
    for app in apps:
        if app["id"] not in state:
            stamp = SEED_DATE if args.seed else now
            state[app["id"]] = stamp.isoformat()

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
        if image:
            image_url = f"{SITE_URL}/assets/projects/{image}"
            image_tag = f'<p><img src="{html.escape(image_url)}" alt="{html.escape(app.get("image_alt", ""))}" width="600"></p>'
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
            f"      {tags}\n"
            "    </item>"
        )

    last_build = max((dt.datetime.fromisoformat(stamp) for stamp in state.values()), default=now)
    feed = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
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
    state_path.write_text(json.dumps(dict(sorted(state.items())), indent=2) + "\n", encoding="utf-8")
    print(f"feed.xml: {len(items)} items, {len(state)} tracked ids")


if __name__ == "__main__":
    main()
