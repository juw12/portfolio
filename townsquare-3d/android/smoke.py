#!/usr/bin/env python3
"""Install the Townsquare3D APK on a running Android emulator, open it and check it stays up.

    python3 android/smoke.py android/dist/Townsquare3D-android.apk

The app is a release build, so the page inside cannot be read from outside. This checks what can be:
the package installs, the window is the app's, the process is still there after 25 s, the shell's own log
says the live page finished loading, and nothing crashed.
A screenshot (android-emulator.png) is saved next to the APK to look at. Needs adb on PATH.
"""

import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def adb(*args, check=True):
    try:
        result = subprocess.run(["adb", *args], capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        # A busy emulator can take minutes over the whole log. Where the answer is only read (check=False)
        # an empty one is enough: the checks above decide, not the dump.
        if check:
            raise
        return ""
    if check and result.returncode != 0:
        raise SystemExit("adb %s failed: %s" % (" ".join(args), result.stderr.strip()))
    return result.stdout


def main():
    apk = os.path.abspath(sys.argv[1])
    out = os.path.dirname(apk)
    with open(os.path.join(HERE, "app.json"), encoding="utf-8") as handle:
        app = json.load(handle)
    package, site, shell_tag = app["id"], app["url"], app["name"] + "Shell"
    failures = []

    def check(condition, label):
        print(("  ok   " if condition else "  FAIL ") + label, flush=True)
        if not condition:
            failures.append(label)

    adb("wait-for-device")
    # A freshly started emulator answers adb before it can look up a name: wait until it can, so a slow
    # emulator is not mistaken for an app that cannot reach its site.
    host = site.split("/")[2]
    for _ in range(30):
        # An emulator answers no ping from outside; "PING name (address)" is enough: the name was looked up.
        if adb("shell", "ping", "-c", "1", "-W", "2", host, check=False).startswith("PING "):
            break
        time.sleep(3)
    adb("install", "-r", apk)
    adb("logcat", "-c", check=False)
    adb("shell", "am", "start", "-W", "-n", package + "/.MainActivity")

    first = ""
    for _ in range(30):
        first = adb("shell", "pidof", package, check=False).strip()
        if first:
            break
        time.sleep(1)
    check(bool(first), "the app started (pid %s)" % (first or "-"))
    time.sleep(25)
    later = adb("shell", "pidof", package, check=False).strip()
    check(bool(later) and later == first, "the same process is still there after 25 s (pid %s)" % (later or "-"))
    focus = adb("shell", "dumpsys", "window", check=False)
    focused = [line.strip() for line in focus.splitlines() if "mCurrentFocus" in line or "mFocusedApp" in line]
    check(any(package in line for line in focused), "its window is in front (%s)" % (focused[0] if focused else "no focus line"))
    # The shell says in the log which page finished loading, and when one did not load.
    said = [line for line in adb("logcat", "-d", "-v", "brief", "-s", shell_tag, check=False).splitlines() if shell_tag in line]
    finished = [line.split("page finished: ", 1)[1].strip() for line in said if "page finished: " in line]
    refused = [line.split("did not load: ", 1)[1].strip() for line in said if "did not load: " in line]
    check(any(page.startswith(site) for page in finished), "the live page finished loading (%s)" % (finished[-1] if finished else "nothing finished"))
    check(not refused, "no page failed to load (%s)" % (refused[-1] if refused else "none"))
    with open(os.path.join(out, "android-emulator.png"), "wb") as handle:
        handle.write(subprocess.run(["adb", "exec-out", "screencap", "-p"], capture_output=True, timeout=60).stdout)
    crashes = [line for line in adb("logcat", "-d", "-b", "crash", check=False).splitlines() if package in line]
    check(not crashes, "no crash in logcat")

    log = adb("logcat", "-d", "-v", "brief", check=False)
    with open(os.path.join(out, "android-logcat.txt"), "w", encoding="utf-8") as handle:
        handle.write(log)
    if failures:
        # What the phone said about the app, so a failed run can be understood from its log.
        words = (package, "AndroidRuntime", "FATAL", "Killing", "has died", "WebViewFactory", "chromium", "ActivityTaskManager: Displayed")
        told = [line for line in log.splitlines() if any(word in line for word in words)]
        print("\nfrom logcat (%d lines about the app, the last 50):" % len(told))
        for line in told[-50:]:
            print("   " + line[:220])
        print("\n%d check(s) failed" % len(failures))
        sys.exit(1)
    print("\nTownsquare3D for Android installs, opens and stays up")


def killed_with_play_services(folder):
    """True when Android ended the app because Google Play services restarted under it.

    A freshly started emulator updates Play services in its first minutes. The WebView holds Play
    services' font provider, so Android ends every app that does when Play services goes down. That
    says nothing about the app, and the next start stays up.
    """
    try:
        with open(os.path.join(folder, "android-logcat.txt"), encoding="utf-8") as handle:
            log = handle.read()
    except OSError:
        return False
    with open(os.path.join(HERE, "app.json"), encoding="utf-8") as handle:
        package = json.load(handle)["id"]
    return any("Killing" in line and package in line and "com.google.android.gms" in line for line in log.splitlines())


if __name__ == "__main__":
    for attempt in (1, 2, 3):
        try:
            main()
            break
        except SystemExit as stopped:
            folder = os.path.dirname(os.path.abspath(sys.argv[1]))
            if not stopped.code or attempt == 3 or not killed_with_play_services(folder):
                raise
            print("\nAndroid ended the app because Google Play services restarted on this new emulator. "
                  "Trying again (%d of 3).\n" % (attempt + 1), flush=True)
            time.sleep(20)
