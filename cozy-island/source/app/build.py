"""Inline three.js + the game scripts into one double-clickable file: CozyIsland.html."""
import re
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
SOURCE_HTML = APP_DIR / "index.html"
OUTPUT_HTML = APP_DIR / "CozyIsland.html"


def inline_scripts(html: str) -> str:
    def replace(match: re.Match) -> str:
        script_path = APP_DIR / match.group(1)
        code = script_path.read_text(encoding="utf-8")
        code = code.replace("</script", "<\\/script")  # never close the tag early
        return f"<script>/* {match.group(1)} */\n{code}\n</script>"

    return re.sub(r'<script src="([^"]+)"></script>', replace, html)


def main() -> None:
    html = SOURCE_HTML.read_text(encoding="utf-8")
    bundled = inline_scripts(html)
    OUTPUT_HTML.write_text(bundled, encoding="utf-8")
    print(f"wrote {OUTPUT_HTML} ({OUTPUT_HTML.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
