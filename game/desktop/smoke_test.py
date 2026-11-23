#!/usr/bin/env python3
"""Open the built CozyIsland desktop app and check its window really shows CozyIsland.

    python desktop/smoke_test.py --built              the app in desktop/dist/ (after build.py)
    python desktop/smoke_test.py PATH/TO/CozyIsland.exe     an installed copy
    add --local-site to serve this checkout instead of the live site

The app runs with GAME_WINDOW_TEST set, so it writes a report once the page has loaded and closes
itself. Passes when the page is CozyIsland, the app started (what the app draws into #app when it starts) and the page can store data.
"""

import argparse
import functools
import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
import time

DESKTOP = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(DESKTOP, os.pardir, os.pardir, "cozy-island"))  # the folder GitHub Pages serves
LIVE_URL = "https://juw12.github.io/portfolio/cozy-island/"


def built_app():
    if sys.platform == "win32":
        return os.path.join(DESKTOP, "dist", "CozyIsland", "CozyIsland.exe")
    return os.path.join(DESKTOP, "dist", "CozyIsland.app", "Contents", "MacOS", "CozyIsland")


def serve_site():
    """Serve this checkout (the site is the repository itself) on a free loopback port."""
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=REPO)
    handler.log_message = lambda *args: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return "http://127.0.0.1:%d/" % server.server_address[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("app", nargs="?", help="the CozyIsland program to open")
    parser.add_argument("--built", action="store_true", help="open the app in desktop/dist/")
    parser.add_argument("--local-site", action="store_true", help="serve this checkout instead of the live site")
    args = parser.parse_args()
    app = built_app() if args.built or not args.app else args.app
    if not os.path.isfile(app):
        raise SystemExit("Not found: %s" % app)

    url = serve_site() if args.local_site else LIVE_URL
    folder = tempfile.mkdtemp(prefix="game-smoke-")
    report = os.path.join(folder, "report.json")
    env = dict(os.environ, GAME_WINDOW_TEST=report, GAME_DESKTOP_URL=url)
    print("Opening %s on %s" % (app, url), flush=True)
    started = time.time()
    process = subprocess.Popen([app], env=env)
    try:
        process.wait(timeout=180)
    except subprocess.TimeoutExpired:
        process.kill()
        raise SystemExit("The app did not close itself within 180 s")
    if not os.path.isfile(report):
        raise SystemExit("The app exited (code %s) without a report" % process.returncode)
    with open(report, encoding="utf-8") as handle:
        result = json.load(handle)
    print(json.dumps(result, indent=2))

    with open(os.path.join(DESKTOP, "shell.json"), encoding="utf-8") as handle:
        version = json.load(handle)["version"]
    problems = []
    if result.get("method") != "window":
        problems.append("no native window (%s)" % (result.get("error") or result.get("method")))
    if "Cozy Island" not in str(result.get("title") or ""):
        problems.append("page title is %r" % result.get("title"))
    if not str(result.get("url") or "").startswith(url):
        problems.append("the window is on %r" % result.get("url"))
    if not result.get("app"):
        problems.append("CozyIsland did not start in the page (missing: what the app draws into #app when it starts)")
    if not result.get("storage"):
        problems.append("the page cannot store data")
    if result.get("version") != version:
        problems.append("the app says version %r, desktop/shell.json says %r" % (result.get("version"), version))
    if problems:
        raise SystemExit("FAILED: " + "; ".join(problems))
    print("OK: CozyIsland %s opened in its own window (%s) in %.0f s" % (version, result.get("toolkit"), time.time() - started))


if __name__ == "__main__":
    main()
