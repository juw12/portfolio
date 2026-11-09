"""Season + fish-journal renders (headless Chrome). Usage: python render_seasons.py [name ...]"""
import subprocess
import sys
from pathlib import Path

app = Path(__file__).resolve().parent
chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
bundle = (app / "CozyIsland.html").as_uri()
profile = app.parent / ".test_profile_seasons"
shots = app / "test_shots"
views = {
    "season_spring": bundle + "?autostart&season=spring",
    "season_summer": bundle + "?autostart&season=summer",
    "season_autumn": bundle + "?autostart&season=autumn",
    "season_winter": bundle + "?autostart&season=winter",
    "winter_fishing": bundle + "?autostart&activity=1&season=winter",
    "winter_garden": bundle + "?autostart&activity=2&season=winter",
}
selected = sys.argv[1:] or list(views)
for name in selected:
    out = shots / f"{name}.png"
    if out.exists():
        out.unlink()
    command = [
        chrome, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        f"--user-data-dir={profile}", "--window-size=1280,720", "--hide-scrollbars",
        "--enable-logging=stderr", "--v=0", "--allow-file-access-from-files",
        "--timeout=12000", f"--screenshot={out}", views[name],
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90)
        errors = [line for line in result.stderr.splitlines()
                  if "CONSOLE" in line and ("rror" in line or "Uncaught" in line)]
        print(name, "ok" if out.exists() else "NO SHOT", "errors:", errors[:3], flush=True)
    except subprocess.TimeoutExpired:
        print(name, "TIMEOUT", flush=True)
