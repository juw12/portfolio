import re
import subprocess
import sys
from pathlib import Path

app = Path(__file__).resolve().parent
chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
bundle = (app / "CozyIsland.html").as_uri()
profile = app.parent / ".test_profile_daynight"
views = dict(arg.split("=", 1) for arg in sys.argv[1:])
for name, query in views.items():
    out = app / "test_shots" / f"{name}.png"
    if out.exists():
        out.unlink()
    command = [
        chrome, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        f"--user-data-dir={profile}", "--window-size=1280,720", "--hide-scrollbars",
        "--enable-logging=stderr", "--v=0", "--allow-file-access-from-files",
        "--timeout=12000", f"--screenshot={out}", bundle + "?" + query.replace(",", "&"),
    ]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90)
    errors = [line for line in result.stderr.splitlines() if "CONSOLE" in line and ("rror" in line or "Uncaught" in line)]
    print(name, "ok" if out.exists() else "NO SHOT", errors[:3], flush=True)
