"""Flag public GitHub repos that have no portfolio card.

Project cards come from scripts/apps.json in juw12/projects, so a new repo only
shows up on the site once someone adds it there. This script (run by the hourly
sync workflow) lists the owner's public repos, compares them with the catalog
and keeps ONE GitHub issue in this repo up to date with whatever is missing:

- repos missing      -> open the issue, or edit it when the list changed
- nothing missing    -> close the issue
- list unchanged     -> do nothing (no hourly notification spam)

A repo counts as covered when apps.json links to github.com/<owner>/<repo> or
has an app whose id equals the repo name. To silence a repo for good, add its
name to repo-ignore.json in this repo.

Usage:
  python scripts/check_missing_repos.py --apps ../projects/scripts/apps.json \
      --portfolio-dir . --owner juw12 [--dry-run]
"""
import argparse
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

LABEL = "missing-cards"
TITLE = "Public repos without a portfolio card"
API = "https://api.github.com"


def api(method, path, token, payload=None):
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "portfolio-missing-repos",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8") or "null")


def public_repos(owner, token):
    repos = []
    page = 1
    while True:
        batch = api("GET", f"/users/{owner}/repos?type=owner&per_page=100&page={page}", token)
        repos.extend(batch)
        if len(batch) < 100:
            return repos
        page += 1


def load_catalog(path):
    catalog = json.loads(pathlib.Path(path).read_text(encoding="utf-8-sig"))
    if isinstance(catalog, dict):
        catalog = catalog.get("apps", list(catalog.values()))
    return catalog


def is_covered(repo_name, owner, catalog_text, catalog_ids):
    name = repo_name.lower()
    if name in catalog_ids:
        return True
    pattern = rf"github\.com/{re.escape(owner.lower())}/{re.escape(name)}(?=[/\"#?]|$)"
    return re.search(pattern, catalog_text) is not None


def find_missing(owner, token, catalog, ignored):
    catalog_text = json.dumps(catalog).lower()
    catalog_ids = {str(app.get("id", "")).lower() for app in catalog if isinstance(app, dict)}
    missing = []
    for repo in public_repos(owner, token):
        if repo.get("fork") or repo.get("archived") or repo.get("private"):
            continue
        if repo["name"].lower() in ignored:
            continue
        if not is_covered(repo["name"], owner, catalog_text, catalog_ids):
            missing.append(repo)
    return sorted(missing, key=lambda repo: repo["name"].lower())


def issue_body(owner, missing):
    lines = [
        f"These public repos on github.com/{owner} have no card on the portfolio yet.",
        "",
    ]
    for repo in missing:
        description = (repo.get("description") or "no description").strip()
        lines.append(f"- [ ] [{repo['name']}]({repo['html_url']}) - {description}")
    lines += [
        "",
        "**To add a card:** add an entry to `scripts/apps.json` in "
        f"[{owner}/projects](https://github.com/{owner}/projects) (the hourly sync builds the card).",
        "**To skip a repo for good:** add its name to `repo-ignore.json` in this repo.",
        "",
        "_This issue updates itself every hour and closes when the list is empty._",
    ]
    return "\n".join(lines)


def open_issue(repository, token):
    issues = api("GET", f"/repos/{repository}/issues?state=open&labels={LABEL}&per_page=10", token)
    return issues[0] if issues else None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apps", required=True, help="path to apps.json")
    parser.add_argument("--portfolio-dir", default=".")
    parser.add_argument("--owner", default="juw12")
    parser.add_argument("--dry-run", action="store_true", help="print the result, change nothing")
    args = parser.parse_args()

    token = os.environ.get("GH_TOKEN", "")
    repository = os.environ.get("GITHUB_REPOSITORY", f"{args.owner}/portfolio")
    ignore_path = pathlib.Path(args.portfolio_dir) / "repo-ignore.json"
    ignored = set()
    if ignore_path.exists():
        ignored = {name.lower() for name in json.loads(ignore_path.read_text(encoding="utf-8-sig")).get("ignore", [])}

    missing = find_missing(args.owner, token, load_catalog(args.apps), ignored)
    print(f"Missing cards: {len(missing)}" + (" -> " + ", ".join(r["name"] for r in missing) if missing else ""))

    if args.dry_run or not token:
        if missing:
            print("\n" + issue_body(args.owner, missing))
        return

    existing = open_issue(repository, token)
    if missing:
        body = issue_body(args.owner, missing)
        if existing is None:
            created = api("POST", f"/repos/{repository}/issues", token, {"title": TITLE, "body": body, "labels": [LABEL]})
            print(f"Opened issue #{created['number']}")
        elif (existing.get("body") or "").strip() != body.strip():
            api("PATCH", f"/repos/{repository}/issues/{existing['number']}", token, {"body": body})
            print(f"Updated issue #{existing['number']}")
        else:
            print(f"Issue #{existing['number']} already up to date")
    elif existing is not None:
        api("POST", f"/repos/{repository}/issues/{existing['number']}/comments", token, {"body": "Every public repo has a card or is ignored now. Closing."})
        api("PATCH", f"/repos/{repository}/issues/{existing['number']}", token, {"state": "closed"})
        print(f"Closed issue #{existing['number']}")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print(f"GitHub API error {error.code}: {error.read().decode('utf-8', 'replace')[:400]}")
        sys.exit(1)
