"""Build /feed.xml (RSS 2.0) from the projects catalog.

Every project in apps.json becomes one feed item. The catalog has no dates, so the
first time a project id is seen its timestamp is recorded in feed-state.json and kept
forever after. Newsletter tools with RSS-to-email (Buttondown, Kit, Mailchimp, ...)
can watch this feed and email subscribers whenever a new item appears.

Usage:
    python scripts/build_feed.py --apps ../projects/scripts/apps.json --portfolio-dir .
"""
import argparse
import datetime as dt
import html
import json
import pathlib
import re
from email.utils import format_datetime

SITE_URL = "https://juwenlie.pages.dev"
PROJECTS_URL = "https://juw12.github.io/projects"
FEED_TITLE = "Juwen Lie · build log"
FEED_DESCRIPTION = "New engineering tools, CAD models and side projects from Juwen Lie."
# Projects already live before the feed existed are backdated so that an
# RSS-to-email tool connected later does not blast the whole back catalog.
SEED_DATE = dt.datetime(2026, 10, 1, tzinfo=dt.timezone.utc)
MAX_ITEMS = 30
# Catalog entries without links of their own.
LINK_OVERRIDES = {
    "3d-models-library": "https://github.com/juw12/projects/tree/main/outputs/3d-models",
}

LOG_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Build log · Juwen Lie</title>
  <meta name="description" content="Everything Juwen Lie ships: engineering tools, CAD models and side projects, newest first.">
  <meta property="og:title" content="Build log · Juwen Lie">
  <meta property="og:description" content="@@COUNT@@ projects shipped so far. Latest: @@LATEST_NAME@@.">
  <meta property="og:image" content="https://juwenlie.pages.dev/assets/og-hi.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="https://juwenlie.pages.dev/log/">
  <link rel="alternate" type="application/rss+xml" title="Juwen Lie · build log" href="https://juwenlie.pages.dev/feed.xml">
  <link rel="icon" type="image/svg+xml" href="../favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="./log.css">
  <script>
    // Same theme rule as /hi/: ?theme= > saved choice > visitor's local time.
    (function () {
      var saved = null;
      try {
        saved = localStorage.getItem("jl-theme");
      } catch (error) {
        saved = null;
      }
      var forced = (location.search.match(/[?&]theme=(light|dark)/) || [])[1];
      var hour = new Date().getHours();
      var theme = forced || saved || (hour >= 6 && hour < 18 ? "light" : "dark");
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.classList.add("js");
    })();
  </script>
</head>
<body>
  <header class="bar">
    <a class="mark" href="../hi/" aria-label="Juwen Lie: links">JL</a>
    <nav class="bar-links" aria-label="Site">
      <a href="../">Portfolio</a>
      <a class="hide-sm" href="https://juwenlie.substack.com/archive">Substack</a>
      <a class="hide-sm" href="../feed.xml">RSS</a>
      <button class="icon-btn" id="theme-toggle" type="button" aria-label="Toggle drafting / blueprint theme">
        <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>
        <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button>
    </nav>
  </header>

  <main class="page">
    <section class="sheet hero" aria-labelledby="log-title">
      <span class="tick tl"></span><span class="tick tr"></span><span class="tick bl"></span><span class="tick br"></span>
      <div class="hero-body">
        <p class="kicker"><span class="pulse" aria-hidden="true"></span>Last shipped @@LATEST_DATE@@ · @@LATEST_NAME@@</p>
        <h1 id="log-title">Build log<span class="dot">.</span></h1>
        <p class="dim">@@COUNT@@ builds · newest first</p>
        <p class="lede">Engineering tools, CAD models and side projects I&rsquo;ve shipped. <strong>Get one short email when the next one lands.</strong></p>
        <form class="signup" action="https://juwenlie.substack.com/subscribe" method="get" target="_blank">
          <label class="visually-hidden" for="log-email">Email address</label>
          <input id="log-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
          <button type="submit">Subscribe</button>
        </form>
        <p class="fine">No spam · unsubscribe in one click · <a href="https://juwenlie.substack.com/archive">past issues</a> · <a href="../feed.xml">RSS</a></p>
      </div>
      <dl class="titleblock">
        <div><dt>Dwg no.</dt><dd>JL-002</dd></div>
        <div><dt>Builds</dt><dd class="big">@@COUNT@@</dd></div>
        <div><dt>Rev</dt><dd>@@REV@@</dd></div>
        <div><dt>Cadence</dt><dd>When it ships</dd></div>
      </dl>
    </section>

    <h2 class="label">Latest build</h2>
@@FEATURED@@

    <h2 class="label">All builds <span class="count">@@RANGE@@</span></h2>
    <ol class="rail">
@@ITEMS@@
    </ol>

    <section class="sheet closing reveal">
      <span class="tick tl"></span><span class="tick tr"></span><span class="tick bl"></span><span class="tick br"></span>
      <div>
        <h2>Next build drops in your inbox.</h2>
        <p>One email per ship. Nothing else.</p>
      </div>
      <a class="button" href="#log-email">Get the build log &uarr;</a>
    </section>

    <footer class="foot">
      <span>&copy; 2026 Juwen Lie</span>
      <a href="../">Portfolio</a>
      <a href="../hi/">Links</a>
      <a href="https://juwenlie.substack.com/">Substack</a>
      <a href="../feed.xml">RSS</a>
      <span>Updated automatically</span>
    </footer>
  </main>

  <script>
    (function () {
      var root = document.documentElement;
      var toggle = document.getElementById("theme-toggle");
      toggle.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try {
          localStorage.setItem("jl-theme", next);
        } catch (error) {}
      });
      var closingButton = document.querySelector(".closing .button");
      closingButton.addEventListener("click", function (event) {
        event.preventDefault();
        var field = document.getElementById("log-email");
        field.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(function () {
          field.focus({ preventScroll: true });
        }, 450);
      });
      var items = document.querySelectorAll(".reveal");
      if (!("IntersectionObserver" in window)) {
        items.forEach(function (item) {
          item.classList.add("in");
        });
        return;
      }
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px" });
      items.forEach(function (item) {
        observer.observe(item);
      });
    })();
  </script>
</body>
</html>
"""


def initials(name):
    words = re.findall(r"[A-Za-z0-9]+", name)
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    if words:
        return words[0][:2].upper()
    return "JL"


def media_html(app, eager=False):
    if app.get("image"):
        loading = "eager" if eager else "lazy"
        return (
            f'<div class="media"><img src="../assets/projects/{html.escape(app["image"])}" '
            f'alt="" loading="{loading}"></div>'
        )
    return f'<div class="media placeholder" aria-hidden="true"><span>{html.escape(initials(app.get("name", app["id"])))}</span><em>Render pending</em></div>'


def load_apps(apps_path):
    data = json.loads(pathlib.Path(apps_path).read_text(encoding="utf-8-sig"))
    apps = data.get("apps", data) if isinstance(data, dict) else data
    return [app for app in apps if isinstance(app, dict) and app.get("id")]


def plain_text(value):
    text = html.unescape(value or "")
    return re.sub(r"<[^>]+>", "", text).strip()


def project_url(app):
    if app["id"] in LINK_OVERRIDES:
        return LINK_OVERRIDES[app["id"]]
    links = app.get("links") or {}
    for key in ("web", "app", "repo", "release", "download"):
        target = links.get(key)
        if target:
            return target if target.startswith("http") else f"{PROJECTS_URL}/{target}"
    return f"{SITE_URL}/#projects"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apps", required=True)
    parser.add_argument("--portfolio-dir", default=".")
    parser.add_argument("--seed", action="store_true", help="record all current ids with SEED_DATE")
    args = parser.parse_args()

    portfolio = pathlib.Path(args.portfolio_dir)
    state_path = portfolio / "feed-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8-sig")) if state_path.exists() else {}
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)

    apps = load_apps(args.apps)
    new_ids = []
    for app in apps:
        if app["id"] not in state:
            stamp = SEED_DATE if args.seed else now
            state[app["id"]] = stamp.isoformat()
            if not args.seed:
                new_ids.append(app["id"])

    dated = sorted(
        apps,
        key=lambda app: (state[app["id"]], -int(app.get("order", 0) or 0)),
        reverse=True,
    )[:MAX_ITEMS]

    items = []
    for app in dated:
        published = dt.datetime.fromisoformat(state[app["id"]])
        summary = plain_text(app.get("summary") or app.get("description") or app.get("desc"))
        image = app.get("image")
        image_tag = ""
        enclosure = ""
        if image:
            image_url = f"{SITE_URL}/assets/projects/{image}"
            image_tag = f'<p><img src="{html.escape(image_url)}" alt="{html.escape(app.get("image_alt", ""))}" width="600"></p>'
            extension = image.rsplit(".", 1)[-1].lower()
            mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "svg": "image/svg+xml", "webp": "image/webp"}.get(extension, "image/jpeg")
            enclosure = f'      <enclosure url="{html.escape(image_url)}" type="{mime}" length="0"/>\n'
        body = f"{image_tag}<p>{html.escape(summary)}</p>"
        tags = "".join(f"<category>{html.escape(tag)}</category>" for tag in app.get("tags", []))
        link = project_url(app)
        items.append(
            "    <item>\n"
            f"      <title>{html.escape(app.get('name', app['id']))}</title>\n"
            f"      <link>{html.escape(link)}</link>\n"
            f"      <guid isPermaLink=\"false\">juwenlie-project-{html.escape(app['id'])}</guid>\n"
            f"      <pubDate>{format_datetime(published)}</pubDate>\n"
            f"      <description><![CDATA[{body}]]></description>\n"
            f"      <jl:summary>{html.escape(summary)}</jl:summary>\n"
            + enclosure
            +             f"      {tags}\n"
            "    </item>"
        )

    last_build = max((dt.datetime.fromisoformat(stamp) for stamp in state.values()), default=now)
    feed = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:jl="https://juwenlie.pages.dev/ns/feed">\n'
        "  <channel>\n"
        f"    <title>{html.escape(FEED_TITLE)}</title>\n"
        f"    <link>{SITE_URL}/hi/</link>\n"
        f"    <description>{html.escape(FEED_DESCRIPTION)}</description>\n"
        "    <language>en</language>\n"
        f"    <lastBuildDate>{format_datetime(last_build)}</lastBuildDate>\n"
        f'    <atom:link href="{SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>\n'
        + "\n".join(items)
        + "\n  </channel>\n</rss>\n"
    )

    (portfolio / "feed.xml").write_text(feed, encoding="utf-8")

    # Human-readable version of the same list.
    total = len(apps)
    cards = []
    featured_html = ""
    for index, app in enumerate(dated):
        published = dt.datetime.fromisoformat(state[app["id"]])
        summary = html.escape(plain_text(app.get("summary") or app.get("description") or app.get("desc")))
        name = html.escape(app.get("name", app["id"]))
        url = html.escape(project_url(app))
        number = f"#{total - index:02d}"
        date_text = published.strftime("%d %b %Y")
        if index == 0:
            featured_html = (
                f'    <a class="sheet latest reveal" href="{url}" target="_blank" rel="noopener">\n'
                '      <span class="tick tl"></span><span class="tick tr"></span><span class="tick bl"></span><span class="tick br"></span>\n'
                f"      {media_html(app, eager=True)}\n"
                f'      <div class="latest-body"><span class="stamp">NEW · {number}</span>'
                f'<span class="date">{date_text}</span><h2>{name}</h2><p>{summary}</p>'
                '<span class="open">Open project <span>&rarr;</span></span></div>\n'
                "    </a>"
            )
            continue
        cards.append(
            f'      <li class="entry reveal"><span class="num">{number}</span>'
            f'<a href="{url}" target="_blank" rel="noopener">'
            f'<div class="entry-body"><span class="date">{date_text}</span><h3>{name}</h3><p>{summary}</p>'
            '<span class="open">Open <span>&rarr;</span></span></div>'
            f"{media_html(app)}</a></li>"
        )
    latest = dated[0] if dated else {"id": "", "name": "—"}
    latest_date = dt.datetime.fromisoformat(state[latest["id"]]) if dated else now
    oldest_number = total - len(dated) + 1
    page_html = (
        LOG_PAGE.replace("@@ITEMS@@", "\n".join(cards))
        .replace("@@FEATURED@@", featured_html)
        .replace("@@COUNT@@", str(total))
        .replace("@@LATEST_NAME@@", html.escape(latest.get("name", latest["id"])))
        .replace("@@LATEST_DATE@@", latest_date.strftime("%d %b %Y"))
        .replace("@@REV@@", latest_date.strftime("%y.%m.%d"))
        .replace("@@RANGE@@", f"#{total - 1:02d} &rarr; #{oldest_number:02d}")
    )
    log_dir = portfolio / "log"
    log_dir.mkdir(exist_ok=True)
    (log_dir / "index.html").write_text(page_html, encoding="utf-8")
    state_path.write_text(json.dumps(dict(sorted(state.items())), indent=2) + "\n", encoding="utf-8")
    # Hand-off for scripts/send_build_log.py (not committed; regenerated each run).
    new_items = [
        {
            "id": app["id"],
            "name": app.get("name", app["id"]),
            "summary": plain_text(app.get("summary") or app.get("description") or app.get("desc")),
            "url": project_url(app),
            "image": f"{SITE_URL}/assets/projects/{app['image']}" if app.get("image") else "",
        }
        for app in apps
        if app["id"] in new_ids
    ]
    (portfolio / "new-items.json").write_text(json.dumps(new_items, indent=2), encoding="utf-8")
    print(f"feed.xml: {len(items)} items, {len(state)} tracked ids, {len(new_items)} new this run")


if __name__ == "__main__":
    main()
