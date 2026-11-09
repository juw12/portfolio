"""Run a JS probe inside the built game (headless Chrome) and print the JSON it returns.

Usage (file mode):   python probe.py "rainbow=1&weather=clear&autostart" probe.js [delay_ms] [profile_name]
The probe file must contain one JS expression that evaluates to an async function returning a JSON-able value.
Server mode: set PROBE_URL=http://127.0.0.1:PORT/ - the page is then loaded from a village server that serves
the probe build (see test/ui_server.py).
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROBE_HTML = APP / "test" / "probe_build.html"


def make_probe_build(probe_js: str, delay_ms: int) -> None:
    html = (APP / "CozyIsland.html").read_text(encoding="utf-8")
    hook = (
        "<script>\n"
        "window.__toasts = [];\n"
        "const __toast = Cozy.ui.toast.bind(Cozy.ui);\n"
        "Cozy.ui.toast = (text, seconds) => { window.__toasts.push(String(text)); return __toast(text, seconds); };\n"
        "window.addEventListener('load', () => setTimeout(async () => {\n"
        "  const out = document.createElement('pre');\n  out.id = 'probe-out';\n"
        f"  try {{\n    const probe = ({probe_js});\n    out.textContent = JSON.stringify(await probe());\n"
        "  } catch (error) {\n    out.textContent = JSON.stringify({ probeError: String(error && error.stack || error) });\n  }\n"
        f"  document.body.appendChild(out);\n}}, {delay_ms}));\n</script>\n</body>"
    )
    PROBE_HTML.write_text(html.replace("</body>", hook, 1), encoding="utf-8")


def run(query: str, probe_file: str, delay_ms: int = 6000, profile: str = "probe") -> dict:
    make_probe_build(Path(probe_file).read_text(encoding="utf-8"), delay_ms)
    base = os.environ.get("PROBE_URL") or PROBE_HTML.as_uri()
    command = [
        CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        f"--user-data-dir={APP.parent / ('.test_profile_' + profile)}", "--window-size=1280,720",
        "--allow-file-access-from-files", "--enable-logging=stderr", "--v=0",
        f"--virtual-time-budget={delay_ms + int(os.environ.get('PROBE_EXTRA_MS', '8000'))}", "--dump-dom", base + "?" + query,
    ]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240)
    match = re.search(r'<pre id="probe-out">(.*?)</pre>', result.stdout, re.S)
    errors = [line for line in result.stderr.splitlines() if "CONSOLE" in line and ("rror" in line or "Uncaught" in line)]
    if not match:
        return {"probeError": "no output", "consoleErrors": errors[:5]}
    text = match.group(1).replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&amp;", "&")
    data = json.loads(text)
    if errors:
        data = {"result": data, "consoleErrors": errors[:5]}
    return data


if __name__ == "__main__":
    query_arg = sys.argv[1]
    probe_arg = sys.argv[2]
    delay_arg = int(sys.argv[3]) if len(sys.argv) > 3 else 6000
    profile_arg = sys.argv[4] if len(sys.argv) > 4 else "probe"
    print(json.dumps(run(query_arg, probe_arg, delay_arg, profile_arg), indent=1))
