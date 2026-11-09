import shutil
import subprocess
from pathlib import Path

app = Path(__file__).resolve().parent
chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
shots = app / "test_shots"
profile = app.parent / ".test_profile_online"
shutil.rmtree(profile, ignore_errors=True)  # fresh browser = brand-new player

jobs = [
    ("online_village", "http://127.0.0.1:8811/?autostart&activity=6"),
    ("tea", (app / "CozyIsland.html").as_uri() + "?autostart&activity=3"),
]
for name, url in jobs:
    out = shots / f"{name}.png"
    command = [
        chrome, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        f"--user-data-dir={profile}", "--window-size=1280,720", "--hide-scrollbars",
        "--enable-logging=stderr", "--v=0",
        "--timeout=25000" if url.startswith("http") else "--virtual-time-budget=12000",
        f"--screenshot={out}", url,
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=150)
    errors = [line for line in result.stderr.splitlines() if "CONSOLE" in line and "rror" in line]
    print(name, "ok" if out.exists() else "NO SHOT", "errors:", errors[:5], flush=True)
