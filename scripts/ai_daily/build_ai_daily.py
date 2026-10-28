#!/usr/bin/env python3
"""AI Daily - the public edition of the Morning Paper, published at /news/.

Usage (from the repository root):
    python scripts/ai_daily/build_ai_daily.py build [--data cached.json]
    python scripts/ai_daily/build_ai_daily.py send  [--force]

build  collects the AI feeds, writes the AI brief (GitHub Models in Actions),
       and writes news/index.html, news/YYYY-MM-DD.html, news/archive.json,
       news/feed.xml and the email body news/email/YYYY-MM-DD.html.
send   emails today's edition to every subscriber, one personal copy each
       (own unsubscribe link, welcome banner on a reader's first issue).
       Subscribers live in the Gmail inbox itself: the site's forms send each
       signup/unsubscribe through FormSubmit to that inbox, and replies or
       Gmail's unsubscribe button land there too. Nothing personal is stored
       in this public repo or printed to the Actions log. Once per day
       (state in news/sent.json). Needs the GMAIL_APP_PASSWORD secret
       (optional GMAIL_ADDRESS, default juwpegatron@gmail.com).

The inbox address is read from assets/subscribe.js (single source of truth
shared with the subscribe forms on the site).
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


DEFAULT_SENDER = "juwpegatron@gmail.com"


def signup_inbox(root: Path) -> str:
    try:
        source = (root / "assets" / "subscribe.js").read_text(encoding="utf-8")
    except OSError:
        return ""
    match = re.search(r'inbox\s*:\s*"([^"]*)"', source)
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

    inbox = signup_inbox(root)
    base_options = {
        "brand": BRAND,
        "tagline": "The AI news that matters, explained in five minutes.",
        "accent": ACCENT,
        "accent_dark": ACCENT_DARK,
        "public": True,
        "auto_refresh_minutes": 0,
        "markets_title": "AI market pulse",
        "watchlist_titles": {"watchlist_us": "AI stocks Â· last close (not investment advice)"},
        "site_url": f"{SITE_URL}/",
        "site_name": "Juwen Lie",
        "rss_url": f"{NEWS_URL}feed.xml",
        "subscribe_form": bool(inbox),
        "scripts": ["../assets/subscribe.js"],
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
        "personalize": True,
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
    log(f"built {edition_file}: {meta['stories']} stories, brief={meta['brief_provider']}, signups={'open' if inbox else 'closed'}")
    return 0


def subject_line(data: dict) -> str:
    lead = (data.get("front_page") or [{}])[0].get("title", "Today in AI")
    day = data.get("date_display", "").split(",")[1].strip() if "," in data.get("date_display", "") else ""
    subject = f"{BRAND} Â· {day}: {lead}" if day else f"{BRAND}: {lead}"
    return subject if len(subject) <= 110 else subject[:107].rsplit(" ", 1)[0] + "â€¦"


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
            f"<item><title>{escape(BRAND)} Â· {escape(entry.get('label', ''))}: {escape(entry.get('headline', ''))}</title>"
            f"<link>{link}</link><guid isPermaLink=\"true\">{link}</guid>"
            f"<pubDate>{format_datetime(published)}</pubDate><description>{description}</description></item>"
        )
    feed = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
        f"<title>{BRAND} Â· Juwen Lie</title><link>{NEWS_URL}</link>"
        f'<atom:link href="{NEWS_URL}feed.xml" rel="self" type="application/rss+xml"/>'
        "<description>The AI news that matters, explained in five minutes. Every morning.</description>"
        f"<language>en</language>{''.join(items)}</channel></rss>\n"
    )
    (news_dir / "feed.xml").write_text(feed, encoding="utf-8")


MAX_SENDS_PER_DAY = 450  # free Gmail allows ~500 recipients/day
WELCOMED_LABEL = "AI Daily/welcomed"
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
WELCOME_BANNER = (
    '<tr><td style="padding:18px 28px 0;"><div style="background:#eef1ff;border-radius:12px;padding:14px 16px;'
    "font:14px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#15171a;\">"
    "<b>Welcome to AI Daily!</b> One email every morning at 6:00 WIB: the AI brief, the stories that matter "
    "and why. Reply anytime, I read everything. Juwen</div></td></tr>"
)


def _decode_header(value):
    from email.header import decode_header, make_header

    try:
        return str(make_header(decode_header(value or "")))
    except Exception:
        return value or ""


def _all_mail_folder(imap):
    status, folders = imap.list()
    for raw in folders or []:
        line = raw.decode("utf-8", "ignore")
        if "\\All" in line:
            return line.rsplit(' "/" ', 1)[-1].strip()
    return "INBOX"


def _message_text(message):
    parts = []
    for part in message.walk():
        if part.get_content_maintype() == "text":
            try:
                parts.append(part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "ignore"))
            except Exception:
                continue
    return re.sub(r"<[^>]+>", " ", " ".join(parts))


def collect_subscribers(imap, own_address):
    """Replay subscribe/unsubscribe events from the inbox, oldest first."""
    import email
    from email.utils import parseaddr, parsedate_to_datetime

    imap.select(_all_mail_folder(imap), readonly=False)
    queries = [
        'X-GM-RAW "from:formsubmit.co subject:(AI Daily)"',
        'X-GM-RAW "subject:unsubscribe -from:formsubmit.co"',
    ]
    events = []
    seen_ids = set()
    for query in queries:
        status, data = imap.uid("SEARCH", None, query)
        for uid in (data[0].split() if data and data[0] else []):
            if uid in seen_ids:
                continue
            seen_ids.add(uid)
            status, fetched = imap.uid("FETCH", uid, "(BODY.PEEK[] X-GM-LABELS)")
            raw = next((item[1] for item in fetched if isinstance(item, tuple)), None)
            if not raw:
                continue
            labels = " ".join(item[0].decode("utf-8", "ignore") for item in fetched if isinstance(item, tuple))
            message = email.message_from_bytes(raw)
            subject = _decode_header(message.get("Subject")).lower()
            sender = parseaddr(message.get("From", ""))[1].lower()
            try:
                when = parsedate_to_datetime(message.get("Date")).timestamp()
            except Exception:
                when = 0.0
            if "formsubmit" in sender:
                addresses = [
                    a.lower() for a in EMAIL_RE.findall(_message_text(message))
                    if "formsubmit" not in a.lower() and a.lower() != own_address.lower()
                ]
                if not addresses:
                    continue
                action = "unsubscribe" if "unsubscribe" in subject else "subscribe"
                events.append((when, action, addresses[0], uid, WELCOMED_LABEL in labels))
            elif "unsubscribe" in subject and sender and sender != own_address.lower():
                events.append((when, "unsubscribe", sender, uid, False))

    events.sort(key=lambda event: event[0])
    subscribers = {}
    for when, action, address, uid, welcomed in events:
        if action == "subscribe":
            previous = subscribers.get(address)
            subscribers[address] = {
                "uid": uid,
                "welcomed": welcomed or bool(previous and previous["welcomed"]),
            }
        else:
            subscribers.pop(address, None)
    return subscribers


def send(args) -> int:
    import imaplib
    import smtplib
    import time
    from email.message import EmailMessage
    from email.utils import make_msgid
    from urllib.parse import quote

    root = repo_root()
    news_dir = root / "news"
    password = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
    sender = os.environ.get("GMAIL_ADDRESS", "").strip() or DEFAULT_SENDER
    inbox = signup_inbox(root)
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

    if not inbox:
        log("send: skipped - signups are closed (set inbox in assets/subscribe.js)")
        return 0
    if not password:
        log("send: skipped - add the GMAIL_APP_PASSWORD repository secret")
        return 0
    if date_iso in sent and not args.force and not args.test_to:
        log(f"send: {date_iso} already sent")
        return 0
    meta = json.loads((news_dir / "email" / f"{date_iso}.json").read_text(encoding="utf-8"))
    if int(meta.get("stories", 0)) < MIN_STORIES_TO_SEND:
        log(f"send: only {meta.get('stories')} stories - feeds look broken, not emailing a thin edition")
        return 1
    template = (news_dir / "email" / f"{date_iso}.html").read_text(encoding="utf-8")

    try:
        imap = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        imap.login(sender, password)
        subscribers = collect_subscribers(imap, sender)
    except Exception as exc:  # noqa: BLE001
        log(f"send: could not read signups from Gmail: {type(exc).__name__}")
        return 1

    recipients = sorted(subscribers)
    if args.test_to:
        recipients = [args.test_to.lower()]
        subscribers.setdefault(recipients[0], {"uid": None, "welcomed": False})
    if len(recipients) > MAX_SENDS_PER_DAY:
        log(f"send: {len(recipients)} subscribers exceeds the Gmail daily cap; sending to the first {MAX_SENDS_PER_DAY}")
        recipients = recipients[:MAX_SENDS_PER_DAY]
    log(f"send: {len(subscribers)} active subscriber(s); sending {len(recipients)}")
    if not recipients:
        imap.logout()
        return 0

    delivered = 0
    welcomed_uids = []
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        smtp.login(sender, password)
        for address in recipients:
            info = subscribers[address]
            unsubscribe_url = f"{NEWS_URL}unsubscribe.html?e={quote(address)}"
            welcome = WELCOME_BANNER if not info["welcomed"] else ""
            html_body = template.replace("%%WELCOME%%", welcome).replace("%%UNSUBSCRIBE_URL%%", unsubscribe_url)
            message = EmailMessage()
            message["Subject"] = meta["subject"]
            message["From"] = f"{BRAND} <{sender}>"
            message["To"] = address
            message["Message-ID"] = make_msgid(domain="juwenlie.pages.dev")
            message["List-Unsubscribe"] = f"<mailto:{sender}?subject=unsubscribe>, <{unsubscribe_url}>"
            message.set_content(
                f"{meta['subject']}\n\nRead today's edition: {NEWS_URL}{date_iso}.html\n\n"
                f"Unsubscribe: {unsubscribe_url}\n"
            )
            message.add_alternative(html_body, subtype="html")
            try:
                smtp.send_message(message)
                delivered += 1
                if welcome and info.get("uid"):
                    welcomed_uids.append(info["uid"])
            except Exception as exc:  # noqa: BLE001
                log(f"send: one delivery failed ({type(exc).__name__})")
            time.sleep(0.4)

    for uid in welcomed_uids:
        try:
            imap.uid("STORE", uid, "+X-GM-LABELS", f'("{WELCOMED_LABEL}")')
        except Exception:
            pass
    imap.logout()

    if not args.test_to:
        sent[date_iso] = f"{delivered} delivered"
        sent_path.write_text(json.dumps(sent, indent=1), encoding="utf-8")
    log(f"send: {date_iso} delivered to {delivered} of {len(recipients)}")
    return 0 if delivered or not recipients else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Build and send AI Daily")
    sub = parser.add_subparsers(dest="command", required=True)
    build_parser = sub.add_parser("build")
    build_parser.add_argument("--data", help="use a cached newsdata JSON instead of fetching")
    send_parser = sub.add_parser("send")
    send_parser.add_argument("--force", action="store_true", help="send even if today's edition was already sent")
    send_parser.add_argument("--test-to", help="send only to this address (does not mark the day as sent)")
    args = parser.parse_args()
    return build(args) if args.command == "build" else send(args)


if __name__ == "__main__":
    raise SystemExit(main())
