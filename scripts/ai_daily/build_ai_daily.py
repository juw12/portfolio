#!/usr/bin/env python3
"""AI Daily - the public edition of the Morning Paper, published at /news/.

Usage (from the repository root):
    python scripts/ai_daily/build_ai_daily.py build [--data cached.json]
    python scripts/ai_daily/build_ai_daily.py send  [--force]

build  collects the AI feeds, writes the AI brief (GitHub Models in Actions),
       and writes news/index.html, news/YYYY-MM-DD.html, news/archive.json,
       news/feed.xml and the email body news/email/YYYY-MM-DD.html.
send   emails today's edition to every Buttondown subscriber, once per day
       (state in news/sent.json). Needs the BUTTONDOWN_API_KEY secret;
       without it the step is skipped, so the web edition still publishes.

The Buttondown username is read from assets/subscribe.js (single source of
truth shared with the subscribe forms on the site).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from email.utils import format_datetime
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import briefing  # noqa: E402
import newsdata  # noqa: E402
import render  # noqa: E402
import render_email  # noqa: E402

SITE_URL = "https://juwenlie.pages.dev"
NEWS_URL = f"{SITE_URL}/news/"
BRAND = "AI Daily"
ACCENT = "#3346c4"
ACCENT_DARK = "#8fa0ff"
MIN_STORIES_TO_SEND = 8


def log(message: str) -> None:
    print(f"[ai-daily] {message}", flush=True)


def repo_root() -> Path:
    return HERE.parent.parent


def buttondown_username(root: Path) -> str:
    try:
        source = (root / "assets" / "subscribe.js").read_text(encoding="utf-8")
    except OSError:
        return ""
    match = re.search(r'buttondown\s*:\s*"([^"]*)"', source)
    return match.group(1).strip() if match else ""


def load_archive(news_dir: Path) -> list:
    try:
        return json.loads((news_dir / "archive.json").read_text(encoding="utf-8"))
    except Exception:
        return []


def build(args) -> int:
    root = repo_root()
    news_dir = root / "news"
    (news_dir / "email").mkdir(parents=True, exist_ok=True)
    config = json.loads((HERE / "config_ai_daily.json").read_text(encoding="utf-8"))

    if args.data:
        data = json.loads(Path(args.data).read_text(encoding="utf-8"))
    else:
        data = newsdata.collect(config)
        for error in (data.get("_errors") or [])[:20]:
            log(f"warn: {error}")
        briefing.add_brief(data, config, log=log)

    date_iso = data.get("date_iso") or dt.date.today().isoformat()
    edition_file = f"{date_iso}.html"
    lead = (data.get("front_page") or [{}])[0]
    headline = lead.get("title", "")
    lede = (data.get("brief") or {}).get("lede", "")

    archive = [entry for entry in load_archive(news_dir) if entry.get("date") != date_iso]
    archive.insert(0, {
        "date": date_iso,
        "label": data.get("date_display", date_iso),
        "headline": headline,
        "lede": lede,
        "url": f"./{edition_file}",
        "stories": (data.get("stats") or {}).get("articles", 0),
    })
    archive = archive[:400]

    username = buttondown_username(root)
    subscribe_action = f"https://buttondown.com/api/emails/embed-subscribe/{username}" if username else ""
    base_options = {
        "brand": BRAND,
        "tagline": "The AI news that matters, explained in five minutes.",
        "accent": ACCENT,
        "accent_dark": ACCENT_DARK,
        "public": True,
        "auto_refresh_minutes": 0,
        "markets_title": "AI market pulse",
        "watchlist_titles": {"watchlist_us": "AI stocks · last close (not investment advice)"},
        "site_url": f"{SITE_URL}/",
        "site_name": "Juwen Lie",
        "rss_url": f"{NEWS_URL}feed.xml",
        "subscribe_action": subscribe_action,
        "og_image": f"{SITE_URL}/assets/og-hi.png",
    }
    past = [entry for entry in archive if entry["date"] != date_iso]

    edition_html = render.render(data, {**base_options, "page_url": f"{NEWS_URL}{edition_file}", "archive": past})
    latest_html = render.render(data, {**base_options, "page_url": NEWS_URL, "archive": past})
    (news_dir / edition_file).write_text(edition_html, encoding="utf-8")
    (news_dir / "index.html").write_text(latest_html, encoding="utf-8")
    (news_dir / "archive.json").write_text(json.dumps(archive, ensure_ascii=False, indent=1), encoding="utf-8")

    email_html = render_email.render_email(data, {
        "brand": BRAND,
        "accent": ACCENT,
        "public": True,
        "page_url": f"{NEWS_URL}{edition_file}",
        "site_url": f"{SITE_URL}/news/",
        "site_name": "juwenlie.pages.dev",
        "markets_title": "AI market pulse",
        "fragment": True,
    })
    (news_dir / "email" / edition_file).write_text(email_html, encoding="utf-8")
    meta = {
        "date": date_iso,
        "subject": subject_line(data),
        "stories": (data.get("stats") or {}).get("articles", 0),
        "brief_provider": (data.get("brief") or {}).get("provider", ""),
    }
    (news_dir / "email" / f"{date_iso}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    write_feed(news_dir, archive)
    log(f"built {edition_file}: {meta['stories']} stories, brief={meta['brief_provider']}, subscribe={'on' if username else 'off'}")
    return 0


def subject_line(data: dict) -> str:
    lead = (data.get("front_page") or [{}])[0].get("title", "Today in AI")
    day = data.get("date_display", "").split(",")[1].strip() if "," in data.get("date_display", "") else ""
    subject = f"{BRAND} · {day}: {lead}" if day else f"{BRAND}: {lead}"
    return subject if len(subject) <= 110 else subject[:107].rsplit(" ", 1)[0] + "…"


def write_feed(news_dir: Path, archive: list) -> None:
    items = []
    for entry in archive[:30]:
        try:
            published = dt.datetime.fromisoformat(entry["date"]).replace(hour=6, tzinfo=dt.timezone(dt.timedelta(hours=7)))
        except ValueError:
            continue
        link = f"{NEWS_URL}{entry['date']}.html"
        description = escape(entry.get("lede") or entry.get("headline") or "")
        items.append(
            f"<item><title>{escape(BRAND)} · {escape(entry.get('label', ''))}: {escape(entry.get('headline', ''))}</title>"
            f"<link>{link}</link><guid isPermaLink=\"true\">{link}</guid>"
            f"<pubDate>{format_datetime(published)}</pubDate><description>{description}</description></item>"
        )
    feed = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
        f"<title>{BRAND} · Juwen Lie</title><link>{NEWS_URL}</link>"
        f'<atom:link href="{NEWS_URL}feed.xml" rel="self" type="application/rss+xml"/>'
        "<description>The AI news that matters, explained in five minutes. Every morning.</description>"
        f"<language>en</language>{''.join(items)}</channel></rss>\n"
    )
    (news_dir / "feed.xml").write_text(feed, encoding="utf-8")


def send(args) -> int:
    import requests

    root = repo_root()
    news_dir = root / "news"
    api_key = os.environ.get("BUTTONDOWN_API_KEY", "").strip()
    archive = load_archive(news_dir)
    if not archive:
        log("send: no edition built yet")
        return 1
    date_iso = archive[0]["date"]
    sent_path = news_dir / "sent.json"
    try:
        sent = json.loads(sent_path.read_text(encoding="utf-8"))
    except Exception:
        sent = {}

    if not api_key:
        log("send: skipped - add the BUTTONDOWN_API_KEY repository secret to email subscribers")
        return 0
    if date_iso in sent and not args.force:
        log(f"send: {date_iso} already sent ({sent[date_iso]})")
        return 0
    meta = json.loads((news_dir / "email" / f"{date_iso}.json").read_text(encoding="utf-8"))
    if int(meta.get("stories", 0)) < MIN_STORIES_TO_SEND:
        log(f"send: only {meta.get('stories')} stories - feeds look broken, not emailing a thin edition")
        return 1
    body = (news_dir / "email" / f"{date_iso}.html").read_text(encoding="utf-8")

    response = requests.post(
        "https://api.buttondown.com/v1/emails",
        headers={
            "Authorization": f"Token {api_key}",
            "Content-Type": "application/json",
            "X-Buttondown-Live-Dangerously": "true",
        },
        json={
            "subject": meta["subject"],
            "body": "<!-- buttondown-editor-mode: plaintext -->\n" + body,
            "status": "about_to_send",
        },
        timeout=60,
    )
    if response.status_code not in (200, 201):
        log(f"send: Buttondown HTTP {response.status_code}: {response.text[:400]}")
        return 1
    email_id = response.json().get("id", "sent")
    sent[date_iso] = email_id
    sent_path.write_text(json.dumps(sent, indent=1), encoding="utf-8")
    log(f"send: {date_iso} queued for every subscriber (Buttondown id {email_id})")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build and send AI Daily")
    sub = parser.add_subparsers(dest="command", required=True)
    build_parser = sub.add_parser("build")
    build_parser.add_argument("--data", help="use a cached newsdata JSON instead of fetching")
    send_parser = sub.add_parser("send")
    send_parser.add_argument("--force", action="store_true", help="send even if today's edition was already sent")
    args = parser.parse_args()
    return build(args) if args.command == "build" else send(args)


if __name__ == "__main__":
    raise SystemExit(main())
