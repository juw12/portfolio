"""Email new build-log items to subscribers through Kit (free plan, API v4).

Runs in the hourly sync workflow right after build_feed.py. Reads new-items.json
(projects seen for the first time in this run), skips anything already announced
(newsletter-sent.json), and creates one broadcast that Kit sends immediately.

Without the KIT_API_KEY secret this script exits quietly, so the workflow keeps
working before the newsletter account exists.
"""
import datetime as dt
import html
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

API_URL = "https://api.kit.com/v4/broadcasts"
SITE_URL = "https://juwenlie.pages.dev"


def main():
    portfolio = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    api_key = os.environ.get("KIT_API_KEY", "").strip()
    new_items_path = portfolio / "new-items.json"
    sent_path = portfolio / "newsletter-sent.json"

    new_items = json.loads(new_items_path.read_text(encoding="utf-8")) if new_items_path.exists() else []
    sent = json.loads(sent_path.read_text(encoding="utf-8")) if sent_path.exists() else {}
    pending = [item for item in new_items if item["id"] not in sent]

    if not pending:
        print("Build log: nothing new to send.")
        return
    if not api_key:
        print(f"Build log: {len(pending)} new item(s) but KIT_API_KEY is not set; skipping email.")
        return

    names = [item["name"] for item in pending]
    subject = f"New from Juwen: {names[0]}" if len(names) == 1 else f"New from Juwen: {', '.join(names[:-1])} and {names[-1]}"
    blocks = []
    for item in pending:
        image = f'<p><img src="{html.escape(item["image"])}" alt="" style="max-width:100%;border:1px solid #ddd"></p>' if item["image"] else ""
        blocks.append(
            f"<h2>{html.escape(item['name'])}</h2>{image}"
            f"<p>{html.escape(item['summary'])}</p>"
            f'<p><a href="{html.escape(item["url"])}">Open {html.escape(item["name"])} &rarr;</a></p>'
        )
    content = (
        "<p>Hi! I just shipped something new:</p>"
        + "".join(blocks)
        + f'<p>Everything else lives at <a href="{SITE_URL}/">{SITE_URL.replace("https://", "")}</a>.</p>'
        + "<p>Juwen</p>"
    )
    payload = {
        "subject": subject,
        "content": content,
        "description": "Automatic build-log email for new projects",
        "public": True,
        "send_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Kit-Api-Key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as error:
        print(f"Kit API error {error.code}: {error.read().decode('utf-8', 'replace')[:500]}")
        sys.exit(1)

    broadcast_id = (body.get("broadcast") or {}).get("id")
    stamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    for item in pending:
        sent[item["id"]] = {"sent_at": stamp, "broadcast_id": broadcast_id}
    sent_path.write_text(json.dumps(dict(sorted(sent.items())), indent=2) + "\n", encoding="utf-8")
    print(f"Build log: broadcast {broadcast_id} scheduled for {len(pending)} item(s): {', '.join(names)}")


if __name__ == "__main__":
    main()
