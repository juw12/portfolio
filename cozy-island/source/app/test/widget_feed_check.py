"""iPhone widget feed check for Cozy Island (the published single-file build), in headless Chrome.

The island may only fetch the shared relay script and talk to the relay once a widget code is paired,
the snapshot must hold exactly the agreed fields, the focus timer has to reach the widget as it
starts and pauses, and the game must keep working when the relay script cannot be reached.
The relay (ntfy.sh) and the relay script are intercepted, so nothing leaves this computer.

The relay script is shared with PocketDex and lives in that repo. Pass a local copy with --sync;
without it the published one is downloaded.

Usage: python test/widget_feed_check.py [--sync path/to/pocketdex/widget/sync.js] [--page path/to/index.html]
"""
import argparse
import functools
import http.server
import json
import sys
import threading
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent
PUBLISHED_PAGE = APP.parent.parent / "index.html"   # cozy-island/index.html, what GitHub Pages serves
SYNC_URL = "https://juw12.github.io/pocketdex/widget/sync.js"
CODE = "jw-0123456789abcdef0123456789abcdef"
FIELDS = {"name", "season", "rain", "fish", "harvest", "sessions", "mindfulMin", "garden", "focus"}
QUERY = "autostart&weather=clear&time=day&season=spring"
MINUTE_MS = 60000
failures = []


def check(condition, label, detail=""):
    print(("ok   " if condition else "FAIL ") + label + (f"  [{detail}]" if detail and not condition else ""), flush=True)
    if not condition:
        failures.append(label)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    handler = functools.partial(QuietHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def new_context(browser, sync_source, relay_log, script_log, saved=None):
    """A fresh browser profile. `sync_source` None means the relay script cannot be reached;
    `saved` is put in localStorage once, before the island first loads."""
    context = browser.new_context(viewport={"width": 640, "height": 360}, locale="en-US", service_workers="block")
    if saved:
        lines = [f"localStorage.setItem({json.dumps(key)}, {json.dumps(value)});" for key, value in saved.items()]
        context.add_init_script(
            "if (!sessionStorage.getItem('seeded')) {" + "".join(lines) + "} sessionStorage.setItem('seeded', '1');"
        )

    def relay(route):
        request = route.request
        relay_log.append({"method": request.method, "url": request.url, "body": request.post_data, "at": time.time() * 1000})
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body="{}")

    def relay_script(route):
        script_log.append(route.request.url)
        if sync_source is None:
            route.abort()
        else:
            route.fulfill(status=200, content_type="text/javascript", body=sync_source)

    context.route("https://ntfy.sh/**", relay)
    context.route(SYNC_URL, relay_script)
    return context


def posts(relay_log):
    return [entry for entry in relay_log if entry["method"] == "POST"]


def wait_for_posts(page, relay_log, count, seconds):
    deadline = time.time() + seconds
    while time.time() < deadline and len(posts(relay_log)) < count:
        page.wait_for_timeout(250)
    return posts(relay_log)


def open_island(page, url, errors):
    page.on("pageerror", lambda error: errors.append(str(error)))
    load_island(page, url)


def load_island(page, url):
    # software rendering is slow: do not wait for the "load" event, wait for the game itself
    page.goto(url, wait_until="commit", timeout=90000)
    page.wait_for_function("window.Cozy && window.Cozy.debug", timeout=90000)


def focus_of(entry):
    return json.loads(entry["body"])["d"].get("focus") or {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sync", type=Path, help="local copy of pocketdex/widget/sync.js")
    parser.add_argument("--page", type=Path, default=PUBLISHED_PAGE, help="the built island page to test")
    args = parser.parse_args()
    if args.sync:
        sync_source = args.sync.read_text(encoding="utf-8")
    else:
        sync_source = urllib.request.urlopen(SYNC_URL, timeout=30).read().decode("utf-8")

    page_path = args.page.resolve()
    server = serve(page_path.parent)
    base = f"http://127.0.0.1:{server.server_address[1]}/{page_path.name}"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            channel="chrome",
            args=["--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )

        # 1. not paired: the island stays to itself
        relay_log, script_log, errors = [], [], []
        context = new_context(browser, sync_source, relay_log, script_log)
        page = context.new_page()
        open_island(page, f"{base}?{QUERY}", errors)
        page.keyboard.press("KeyF")
        page.wait_for_timeout(6000)
        check(page.evaluate("typeof Cozy.widget === 'object' && typeof Cozy.widget.snapshot === 'function'"), "not paired: the widget module exists")
        check(not script_log, "not paired: the relay script is never fetched", script_log)
        check(not relay_log, "not paired: nothing is sent to the relay", relay_log)
        check(page.evaluate("window.Juw12Widget === undefined"), "not paired: no relay object on the page")
        check(page.evaluate("Cozy.widget.focus && Cozy.widget.focus.phase") == "focus", "not paired: the focus timer still runs")
        check(not errors, "not paired: no script errors", errors)
        context.close()

        # 2. paired by the setup page link, with a saved island
        seeded_at = int(time.time() * 1000)
        saved = {
            "cozy.name": json.dumps("Juwen"),
            "cozy.p.fish": json.dumps(7),
            "cozy.p.harvest": json.dumps(4),
            "cozy.p.focus_sessions": json.dumps(2),
            "cozy.p.mindful_seconds": json.dumps(185),
            # tomato (25 min): 10 min grown, watered for long enough to finish -> blooms 15 min after lastTick
            "cozy.garden.0": json.dumps({"seedId": "tomato", "grownMs": 10 * MINUTE_MS, "lastTick": seeded_at, "waterEnds": seeded_at + 20 * MINUTE_MS}),
            # sunflower (50 min): the water ran out a minute ago -> thirsty
            "cozy.garden.2": json.dumps({"seedId": "sunflower", "grownMs": 5 * MINUTE_MS, "lastTick": seeded_at - MINUTE_MS, "waterEnds": seeded_at - MINUTE_MS}),
        }
        relay_log, script_log, errors = [], [], []
        context = new_context(browser, sync_source, relay_log, script_log, saved)
        page = context.new_page()
        open_island(page, f"{base}?{QUERY}&widget={CODE}", errors)
        sent = wait_for_posts(page, relay_log, 1, 20)
        check(len(script_log) == 1, "paired: the relay script is fetched once", script_log)
        check(page.evaluate("localStorage.getItem('juw12.widget.code')") == CODE, "paired: the code from the link is stored")
        check("widget=" not in page.url and "autostart" in page.url, "paired: the code is taken out of the address bar", page.url)
        check(len(sent) == 1, "paired: one snapshot is sent", len(sent))
        message = json.loads(sent[0]["body"]) if sent else {}
        snapshot = message.get("d", {})
        check(bool(sent) and sent[0]["url"] == f"https://ntfy.sh/{CODE}", "paired: it goes to this code's topic", sent[0]["url"] if sent else "")
        check(message.get("v") == 1 and message.get("app") == "cozy", "paired: the message is marked as Cozy Island", message)
        check(set(snapshot) == FIELDS, "paired: the snapshot holds exactly the agreed fields", sorted(snapshot))
        check(bool(sent) and len(sent[0]["body"].encode("utf-8")) < 3500, "paired: the message fits the relay size limit")
        check(snapshot.get("name") == "Juwen", "snapshot: nickname", snapshot.get("name"))
        check(snapshot.get("season") == "spring" and snapshot.get("rain") is False, "snapshot: season and weather", snapshot)
        check((snapshot.get("fish"), snapshot.get("harvest"), snapshot.get("sessions")) == (7, 4, 2), "snapshot: fish, harvest and focus sessions", snapshot)
        check(snapshot.get("mindfulMin") == 3, "snapshot: 185 mindful seconds are 3 whole minutes", snapshot.get("mindfulMin"))
        check(snapshot.get("focus") is None, "snapshot: no focus timer yet", snapshot.get("focus"))
        garden = snapshot.get("garden") or []
        check([bed.get("s") for bed in garden] == ["tomato", "sunflower"], "garden: both planted beds, in order", garden)
        tomato = garden[0] if garden else {}
        sunflower = garden[1] if len(garden) > 1 else {}
        check("t" not in tomato and abs(tomato.get("b", 0) - (seeded_at + 15 * MINUTE_MS)) < 5000, "garden: the watered tomato has a bloom time", tomato)
        check("b" not in sunflower and abs(sunflower.get("t", 0) - (seeded_at - MINUTE_MS)) < 5000, "garden: the dry sunflower is thirsty", sunflower)

        # 3. the focus timer reaches the widget when it starts and when it pauses
        page.keyboard.press("KeyF")
        pressed_at = time.time() * 1000
        sent = wait_for_posts(page, relay_log, 2, 60)
        check(len(sent) == 2, "focus: starting the timer sends a snapshot", len(sent))
        focus = focus_of(sent[1]) if len(sent) > 1 else {}
        started_by = sent[1]["at"] if len(sent) > 1 else pressed_at
        check(focus.get("phase") == "focus" and focus.get("paused") is False, "focus: it is running", focus)
        # the game clock never runs ahead of the wall clock, so the end time lies between
        # "25 minutes after the key press" and "25 minutes after the snapshot left"
        check(
            pressed_at + 25 * MINUTE_MS - 1000 <= focus.get("endsAt", 0) <= started_by + 25 * MINUTE_MS + 1000,
            "focus: it ends 25 minutes after it started",
            {"focus": focus, "pressed": pressed_at, "sent": started_by},
        )
        check(len(sent) > 1 and sent[1]["at"] - sent[0]["at"] < 2 * MINUTE_MS, "focus: it does not wait for the 5 minute gap")

        # the game timer falls behind the wall clock (slow device, long frame): the widget is told the new end
        page.evaluate("const realNow = Date.now.bind(Date); Date.now = () => realNow() + 120000;")
        sent = wait_for_posts(page, relay_log, 3, 40)
        check(len(sent) == 3, "drift: a timer two minutes behind the clock is sent again", len(sent))
        drifted = focus_of(sent[2]) if len(sent) > 2 else {}
        check(drifted.get("phase") == "focus" and drifted.get("paused") is False, "drift: it is still running", drifted)
        check(
            drifted.get("endsAt", 0) >= focus.get("endsAt", 0) + 119000,
            "drift: the end time moved by the two minutes",
            {"before": focus.get("endsAt"), "after": drifted.get("endsAt")},
        )
        page.wait_for_timeout(4000)
        check(len(posts(relay_log)) == 3, "drift: it is corrected once, not on every frame", len(posts(relay_log)))

        page.keyboard.press("KeyF")
        paused_at = time.time() * 1000
        sent = wait_for_posts(page, relay_log, 4, 40)
        check(len(sent) == 4, "focus: pausing sends a snapshot", len(sent))
        paused = focus_of(sent[3]) if len(sent) > 3 else {}
        check(paused.get("paused") is True and "endsAt" not in paused, "focus: it is paused", paused)
        # at most the wall time since the key press has been used up, and at least a moment of it
        check(
            25 * MINUTE_MS - (paused_at - pressed_at) - 1000 <= paused.get("remainMs", 0) < 25 * MINUTE_MS,
            "focus: the time left is kept",
            {"paused": paused, "wallMs": paused_at - pressed_at},
        )

        for entry in posts(relay_log):
            seconds = round((entry["at"] - pressed_at) / 1000, 1)
            print(f"     snapshot {seconds:+.1f} s from the first key press: focus {focus_of(entry) or None}", flush=True)

        # 4. paired from before: the relay script loads again without the link
        scripts_before = len(script_log)
        load_island(page, f"{base}?{QUERY}")
        page.wait_for_function("window.Juw12Widget", timeout=30000)
        check(len(script_log) == scripts_before + 1, "reopened: the relay script is fetched again", script_log)
        check(page.evaluate("window.Juw12Widget.code()") == CODE, "reopened: still paired with the same code")
        check(not errors, "paired: no script errors", errors)
        context.close()

        # 5. paired, but the relay script cannot be reached: the island still runs
        relay_log, script_log, errors = [], [], []
        context = new_context(browser, None, relay_log, script_log, {"juw12.widget.code": CODE})
        page = context.new_page()
        open_island(page, f"{base}?{QUERY}", errors)
        page.keyboard.press("KeyF")
        page.wait_for_timeout(5000)
        check(len(script_log) >= 1, "relay script down: it was tried", script_log)
        check(not posts(relay_log), "relay script down: nothing is sent")
        check(page.evaluate("Cozy.widget.focus && Cozy.widget.focus.phase") == "focus", "relay script down: the focus timer still runs")
        check(page.evaluate("document.querySelector('canvas') !== null"), "relay script down: the island is drawn")
        check(not errors, "relay script down: no script errors", errors)
        context.close()
        browser.close()
    server.shutdown()

    print(f"\n{'FAILED' if failures else 'PASSED'}: {len(failures)} failing check(s)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
