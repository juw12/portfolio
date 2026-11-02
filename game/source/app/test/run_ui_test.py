"""Two-player UI test through the real game panels: presents + Mochi visits.

Starts a throwaway village server (port 8823, temp data, 45 s cat visits), drives two headless
browser profiles (Ana owns plot 0, Ben visits), checks the results and cleans up afterwards.
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

TEST_DIR = Path(__file__).resolve().parent
APP = TEST_DIR.parent
ROOT = APP.parent
PYTHON = sys.executable
PORT = 8823
DATA = TEST_DIR / "ui_test_village.json"
CAT_VISIT_S = 150   # roomy: headless sessions can be slow on a busy machine
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

sys.path.insert(0, str(APP))
import probe  # noqa: E402

checks = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""), flush=True)


def session(profile, script, query="autostart&activity=6&weather=clear&time=day"):
    os.environ["PROBE_URL"] = f"http://127.0.0.1:{PORT}/"
    os.environ["PROBE_EXTRA_MS"] = "25000"
    started = time.time()
    result = probe.run(query, str(TEST_DIR / script), 3000, profile)
    print(f"--- {profile} {script} ({time.time() - started:.0f} s): {json.dumps(result)[:900]}", flush=True)
    return result


def screenshot(profile, out_name, query):
    probe.make_probe_build("async () => ({})", 60000)   # harmless build: no scripted actions
    out = APP / "test_shots" / out_name
    subprocess.run([
        CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        f"--user-data-dir={ROOT / ('.test_profile_' + profile)}", "--window-size=1280,720", "--hide-scrollbars",
        "--timeout=12000", f"--screenshot={out}", f"http://127.0.0.1:{PORT}/?{query}",
    ], capture_output=True, timeout=90)
    return out.exists()


def main():
    for profile in ("ana", "ben"):
        shutil.rmtree(ROOT / f".test_profile_{profile}", ignore_errors=True)
    DATA.unlink(missing_ok=True)
    env = dict(os.environ, COZY_CAT_VISIT_S=str(CAT_VISIT_S))
    probe.make_probe_build("async () => ({})", 1000)
    server = subprocess.Popen([PYTHON, str(TEST_DIR / "ui_server.py"), str(PORT), str(DATA)], env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/ping", timeout=1)
                break
            except OSError:
                time.sleep(0.2)

        ana = session("ana", "ui_ana_claim.js")
        check("Ana claims homestead 0", ana.get("ok") and ana.get("owner") == "Ana", ana)

        ben = session("ben", "ui_ben_send.js")
        sent_at = time.time()
        check("gift form lists Ben's pantry", any(l.startswith("Campfire Grilled Fish") for l in ben.get("optionLabels", [])))
        check("Wrap & send button works (toast)", ben.get("wrapped"))
        check("dish leaves Ben's pantry", ben.get("dishBefore") == 1 and ben.get("dishAfter") == 0, ben)
        check("gifts_sent counted", ben.get("giftsSent") == 1)
        check("Send Mochi button shown at friend's homestead", ben.get("hadSendButton"))
        check("Mochi marked away", ben.get("left") and (ben.get("away") or {}).get("host") == "Ana", ben.get("away"))
        check("dock is empty while Mochi visits", ben.get("dockCatVisible") is False)
        check("panel shows where Mochi is", "Mochi is napping here" in ben.get("panelAfter", ""), ben.get("panelAfter"))
        check("second visit refused while away", "already out visiting" in (ben.get("secondSendError") or ""))
        check("Mochi leaving toast", any("trots over to Ana" in t for t in ben.get("toasts", [])))

        ana2 = session("ana", "ui_ana_open.js")
        check("visiting cat shown at Ana's homestead", (ana2.get("visitorShown") or [False])[0], ana2.get("visitorShown"))
        check("Ana told about the visiting cat", any("napping by your mailbox" in t for t in ana2.get("toasts", [])))
        check("present waits in Ana's mailbox with note",
              ana2.get("gifts") == [{"from": "Ben", "item": "grilled_fish", "note": "for your focus sessions"}], ana2.get("gifts"))
        check("mailbox panel lists the present", ana2.get("mailHasPresent"))
        check("Open button unwraps into Ana's pantry", ana2.get("opened") and ana2.get("dishAfter") == 1)
        check("gifts_received counted, inbox empty", ana2.get("giftsReceived") == 1 and ana2.get("giftsLeft") == 0)
        check("petting the visitor reaches the server", ana2.get("pets", 0) >= 2 and ana2.get("petBy") == ["Ana"], ana2)

        shot_ok = screenshot("ana", "mochi_visit.png", "autostart&activity=6&weather=clear&time=day&season=spring")
        check("screenshot of the visiting cat", shot_ok)

        wait = sent_at + CAT_VISIT_S + 2 - time.time()
        if wait > 0:
            print(f"... waiting {wait:.0f} s for Mochi's nap to end", flush=True)
            time.sleep(wait)
        ben2 = session("ben", "ui_ben_home.js")
        check("Mochi comes home", ben2.get("home") and ben2.get("dockCatVisible") is True, ben2)
        check("visit counted in journal", ben2.get("catVisits") == 1)
        # Ben kept 2 Bluegill after wrapping the dish; Mochi brings exactly one souvenir (may arrive before the probe)
        pantry_after = json.loads(ben2.get("pantryAfter") or "{}")
        total_items = sum(sum(kind.values()) for kind in pantry_after.values())
        check("souvenir added to Ben's pantry", total_items == 3, pantry_after.get("fish", {}).get("Bluegill"))
        home_toast = next((t for t in ben2.get("toasts", []) if "is home from Ana" in t), "")
        check("home toast mentions Ana's chin scratches", "chin scratch" in home_toast and "Ana" in home_toast, home_toast)
    finally:
        server.terminate()
        server.wait(timeout=10)
        DATA.unlink(missing_ok=True)
        DATA.with_suffix(".tmp").unlink(missing_ok=True)
    passed = sum(ok for _, ok in checks)
    print(f"\n{passed}/{len(checks)} UI checks passed")


if __name__ == "__main__":
    main()
