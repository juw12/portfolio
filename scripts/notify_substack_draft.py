"""Prepare a ready-to-paste Substack post for every newly shipped project.

Substack (free, unlimited subscribers) has no publishing API, so the hourly sync
workflow does the next best thing: when build_feed.py reports new projects, this
script opens a GitHub issue in this repo containing the finished post (title,
image, text, link). GitHub emails the issue to the repo owner; copy it into
Substack -> New post -> Publish, and every subscriber gets it.
"""
import datetime as dt
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

SITE_URL = "https://juwenlie.pages.dev"


def build_post(items):
    names = [item["name"] for item in items]
    if len(names) == 1:
        title = f"New: {names[0]}"
    else:
        title = f"New: {', '.join(names[:-1])} and {names[-1]}"
    sections = []
    for item in items:
        lines = [f"## {item['name']}", ""]
        if item.get("image"):
            lines += [f"![{item['name']}]({item['image']})", ""]
        lines += [item.get("summary", ""), "", f"👉 Try it: {item['url']}", ""]
        sections.append("\n".join(lines))
    body = "Hi! I just shipped something new.\n\n" + "\n".join(sections) + f"\nEverything else I build lives at {SITE_URL}.\n\nJuwen"
    return title, body


def main():
    portfolio = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    new_items_path = portfolio / "new-items.json"
    announced_path = portfolio / "announced.json"
    new_items = json.loads(new_items_path.read_text(encoding="utf-8-sig")) if new_items_path.exists() else []
    announced = json.loads(announced_path.read_text(encoding="utf-8-sig")) if announced_path.exists() else {}
    pending = [item for item in new_items if item["id"] not in announced]
    if not pending:
        print("Build log: nothing new to announce.")
        return

    title, post = build_post(pending)
    issue_body = (
        "**A new project just went live.** Your Substack post is ready below.\n\n"
        "1. Open Substack → **New post**\n"
        "2. Copy the title and the text between the lines\n"
        "3. Press **Publish** (send to everyone). Done!\n\n"
        f"**Title:** {title}\n\n---\n\n{post}\n\n---\n"
        "_Close this issue once it's published._"
    )

    token = os.environ.get("GH_TOKEN", "")
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    if not token or not repository:
        print("Build log: no GitHub token (running locally?). Draft below:\n")
        print(issue_body)
        return

    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/issues",
        data=json.dumps({"title": f"📬 Substack draft ready: {title}", "body": issue_body, "labels": ["build-log"]}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            issue = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        print(f"GitHub API error {error.code}: {error.read().decode('utf-8', 'replace')[:400]}")
        sys.exit(1)

    stamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    for item in pending:
        announced[item["id"]] = {"announced_at": stamp, "issue": issue.get("html_url")}
    announced_path.write_text(json.dumps(dict(sorted(announced.items())), indent=2) + "\n", encoding="utf-8")
    print(f"Build log: draft issue opened: {issue.get('html_url')}")


if __name__ == "__main__":
    main()
