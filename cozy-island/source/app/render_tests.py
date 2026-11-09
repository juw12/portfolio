import subprocess
import sys
from pathlib import Path

app = Path(__file__).resolve().parent
chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
bundle_url = (app / "CozyIsland.html").as_uri()
profile = app.parent / ".test_profile"
shots = app / "test_shots"
views = {
    "explore": "?autostart",
    "fishing": "?autostart&activity=1",
    "garden": "?autostart&activity=2",
    "tea": "?autostart&activity=3",
    "birds": "?autostart&activity=4",
    "viewpoint": "?autostart&activity=5",
    "village": "?autostart&activity=6",
}
selected = sys.argv[1:] or list(views)
for name in selected:
    out = shots / f"{name}.png"
    command = [
        chrome, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        f"--user-data-dir={profile}", "--window-size=1280,720", "--hide-scrollbars",
        "--enable-logging=stderr", "--v=0",
        "--timeout=12000", f"--screenshot={out}", bundle_url + views[name],
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=90)
        errors = [line for line in result.stderr.splitlines()
                  if "CONSOLE" in line and "rror" in line]
        print(name, "ok" if out.exists() else "NO SHOT", "errors:", errors[:3], flush=True)
    except subprocess.TimeoutExpired:
        print(name, "TIMEOUT", flush=True)
