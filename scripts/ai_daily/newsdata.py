"""newsdata.py — Morning Paper data engine.

Public API:
    collect(config: dict) -> dict

Gathers market quotes (Yahoo Finance chart endpoint) and news articles (RSS/Atom)
and returns a dict conforming to CONTRACT.md. Never raises: any feed/symbol
failure is recorded in the top-level ``_errors`` list and the run continues.

Dependencies: only ``requests`` and ``bs4`` plus the Python standard library.
"""

from __future__ import annotations

import html
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote as urlquote
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import requests
from bs4 import BeautifulSoup

try:  # requests bundles urllib3; import the warning class defensively
    from urllib3.exceptions import InsecureRequestWarning

    requests.packages.urllib3.disable_warnings(InsecureRequestWarning)  # type: ignore[attr-defined]
except Exception:  # pragma: no cover - extremely defensive
    try:
        import urllib3

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# Configuration-derived constants
# --------------------------------------------------------------------------- #

# Friendly source names keyed by domain suffix. Longest keys are matched first
# so "cnbcindonesia.com" wins over "cnbc.com".
SOURCE_MAP = {
    "cnbcindonesia.com": "CNBC Indonesia",
    "search.cnbc.com": "CNBC",
    "cnbc.com": "CNBC",
    "theverge.com": "The Verge",
    "arstechnica.com": "Ars Technica",
    "wired.com": "Wired",
    "techcrunch.com": "TechCrunch",
    "spectrum.ieee.org": "IEEE Spectrum",
    "therobotreport.com": "The Robot Report",
    "nasaspaceflight.com": "NASASpaceflight",
    "space.com": "Space.com",
    "spaceflightnow.com": "Spaceflight Now",
    "nasa.gov": "NASA",
    "technologyreview.com": "MIT Technology Review",
    "the-decoder.com": "The Decoder",
    "marktechpost.com": "MarkTechPost",
    "blogs.nvidia.com": "NVIDIA Blog",
    "blog.google": "Google Blog",
    "tomshardware.com": "Tom's Hardware",
    "teslarati.com": "Teslarati",
    "engadget.com": "Engadget",
    "antaranews.com": "Antara News",
    "dowjones.io": "MarketWatch",
    "marketwatch.com": "MarketWatch",
}

_ACRONYMS = {
    "ai": "AI",
    "llm": "LLM",
    "gpu": "GPU",
    "ihsg": "IHSG",
    "idx": "IDX",
    "us": "US",
    "uk": "UK",
    "eu": "EU",
    "ev": "EV",
    "tsmc": "TSMC",
    "nasa": "NASA",
    "amd": "AMD",
    "ibm": "IBM",
    "gpt": "GPT",
    "ipo": "IPO",
    "gdp": "GDP",
    "sec": "SEC",
    "api": "API",
    "ceo": "CEO",
    "bi": "BI",
}

_BRAND_CASE = {
    "spacex": "SpaceX",
    "openai": "OpenAI",
    "chatgpt": "ChatGPT",
    "youtube": "YouTube",
    "linkedin": "LinkedIn",
    "tiktok": "TikTok",
    "iphone": "iPhone",
    "ipad": "iPad",
    "ios": "iOS",
    "macos": "macOS",
    "boston dynamics": "Boston Dynamics",
}

_HTML_TAG_RE = re.compile(r"<[^>]+>")

# Feed boilerplate that should never reach a reader.
_BOILERPLATE_RES = [
    re.compile(r"\bThe post .{0,200}? appeared first on .{0,80}?\.?$", re.IGNORECASE),
    re.compile(r"\b(Continue reading|Read more|Read the full story|Read full article)\b.*$", re.IGNORECASE),
    re.compile(r"\[\s*(\.\.\.|…|&#8230;)\s*\]"),
]

_STOPWORDS = set("""
a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those
into over after before about than then so not no new says say said will can could would should may might up out how why
what who when where which while amid via vs your you we our their his her they them he she i my me just more most
first one two three get gets got make makes made now today report reports year years week day amp
""".split())


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

def _localname(tag: str) -> str:
    """Strip an XML namespace from a tag name."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _strip_html(raw: str) -> str:
    """Convert an HTML/plain fragment to clean single-line text."""
    if not raw:
        return ""
    text = raw
    # CDATA payloads may carry escaped entities that ET does not decode.
    if "&" in text:
        text = html.unescape(text)
    # Fast path: if it looks like it has tags, run it through BeautifulSoup.
    if "<" in text and ">" in text:
        soup = BeautifulSoup(text, "html.parser")
        text = soup.get_text(separator=" ")
    text = re.sub(r"\s+", " ", text).strip()
    for pattern in _BOILERPLATE_RES:
        text = pattern.sub("", text).strip()
    return text


def _title_tokens(title: str) -> set:
    """Significant lowercase tokens of a headline, used for story clustering."""
    words = re.findall(r"[a-z0-9][a-z0-9'\-]*", (title or "").lower())
    tokens = set()
    for word in words:
        word = word.strip("'-")
        if len(word) < 3 or word in _STOPWORDS:
            continue
        if word.endswith("'s"):
            word = word[:-2]
        if len(word) > 4 and word.endswith("s") and not word.endswith("ss"):
            word = word[:-1]
        tokens.add(word)
    return tokens


def _local_now(settings: dict) -> datetime:
    """Current time in the paper's own timezone (CI runners are on UTC)."""
    tz_name = str(settings.get("timezone") or "").strip()
    if tz_name:
        try:
            from zoneinfo import ZoneInfo

            return datetime.now(ZoneInfo(tz_name))
        except Exception:
            pass
    offset = settings.get("utc_offset_hours")
    if offset is not None:
        return datetime.now(timezone(timedelta(hours=float(offset))))
    return datetime.now().astimezone()


def _truncate(text: str, limit: int = 240) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0] or text[:limit]
    return cut.rstrip(" ,.;:-") + "..."


def _parse_date(raw: str):
    """Parse RFC-822 (RSS) or ISO-8601 (Atom) dates into aware UTC datetime."""
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None
    try:
        dt = parsedate_to_datetime(raw)
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
    except Exception:
        pass
    try:
        candidate = raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(candidate)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        pass
    return None


def _source_from_url(url: str) -> str:
    try:
        host = (urlparse(url).netloc or "").lower()
    except Exception:
        host = ""
    host = host.split("@")[-1].split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    for key in sorted(SOURCE_MAP, key=len, reverse=True):
        if host == key or host.endswith("." + key):
            return SOURCE_MAP[key]
    # Fallback: derive from the registered domain.
    if host:
        parts = host.split(".")
        base = ".".join(parts[-2:]) if len(parts) >= 2 else host
        return base.split(".")[0].capitalize()
    return "Unknown"


def _norm_title(title: str) -> str:
    t = (title or "").lower()
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:60]


def _keyword_hits(text_lower: str, keywords) -> list:
    hits = []
    for kw in keywords:
        k = str(kw).strip().lower()
        if not k:
            continue
        if re.search(r"\b" + re.escape(k) + r"\b", text_lower):
            hits.append(k)
    return hits


def _title_kw(kw: str) -> str:
    low = kw.strip().lower()
    if low in _ACRONYMS:
        return _ACRONYMS[low]
    if low in _BRAND_CASE:
        return _BRAND_CASE[low]
    return " ".join(w.capitalize() for w in low.split())


def _fmt_num(value: float, integer_ok: bool = False) -> str:
    if integer_ok and abs(value - round(value)) < 0.005:
        return f"{value:,.0f}"
    return f"{value:,.2f}"


def _clean_image_url(url) -> str:
    """Normalize a candidate image URL. Returns "" when unusable."""
    if not url:
        return ""
    url = str(url).strip()
    if not url:
        return ""
    low = url.lower()
    if low.startswith("data:"):
        return ""
    if url.startswith("//"):
        url = "https://" + url[2:]
    if not re.match(r"^https?://", url, re.IGNORECASE):
        return ""
    return url


def _relative_display(dt, now) -> str:
    if dt is None:
        return ""
    secs = (now - dt).total_seconds()
    if secs < 0:
        secs = 0
    if secs < 3600:
        return f"{int(secs // 60)}m ago"
    if secs < 86400:
        return f"{int(secs // 3600)}h ago"
    if secs < 86400 * 7:
        return f"{int(secs // 86400)}d ago"
    return dt.strftime("%b %d")


# --------------------------------------------------------------------------- #
# Network layer
# --------------------------------------------------------------------------- #

def _build_session(user_agent: str) -> requests.Session:
    session = requests.Session()
    # Corporate proxy uses an internal CA -> disable verification to avoid TLS
    # failures. Env proxies (HTTP_PROXY/HTTPS_PROXY/NO_PROXY) are honored by
    # requests automatically; we deliberately do not touch them.
    session.verify = False
    session.headers.update({
        "User-Agent": user_agent,
        "Accept": "*/*",
    })
    return session


def _fetch_quote(session, item: dict, timeout: int, errors: list) -> dict | None:
    symbol = str(item.get("symbol", "")).strip()
    name = item.get("name", symbol)
    if not symbol:
        return None
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urlquote(symbol, safe='')}?interval=1d&range=5d"
    )
    try:
        resp = session.get(url, timeout=timeout)
        if resp.status_code != 200:
            errors.append(f"quote {symbol}: HTTP {resp.status_code}")
            return None
        payload = resp.json()
        result = payload["chart"]["result"][0]
        meta = result.get("meta", {})
        price = meta.get("regularMarketPrice")
        if price is None:
            errors.append(f"quote {symbol}: no regularMarketPrice")
            return None
        prev = meta.get("chartPreviousClose")
        if prev is None:
            prev = meta.get("previousClose")
        if prev is None:
            prev = price
        price = float(price)
        prev = float(prev)
        closes = []
        try:
            raw_closes = result["indicators"]["quote"][0].get("close") or []
            closes = [round(float(c), 4) for c in raw_closes if c is not None]
        except Exception:
            closes = []
    except Exception as exc:  # noqa: BLE001 - never propagate
        errors.append(f"quote {symbol}: {exc}")
        return None

    change = price - prev
    pct = (change / prev * 100.0) if prev else 0.0
    is_id = symbol.endswith(".JK") or symbol.startswith("^JK")
    if change > 0.0001:
        direction = "up"
    elif change < -0.0001:
        direction = "down"
    else:
        direction = "flat"

    quote = {
        "name": name,
        "symbol": symbol,
        "price": _fmt_num(price, is_id),
        "currency": meta.get("currency", "USD"),
        "change": _fmt_num(change, is_id),
        "pct": f"{pct:,.2f}",
        "dir": direction,
        "spark": closes[-7:],
    }
    quote["_raw"] = {"price": price, "change": change, "pct": pct}
    return quote


def _fetch_feed(session, url: str, timeout: int, errors: list) -> list:
    """Fetch and parse a feed, returning a list of raw entry dicts."""
    try:
        resp = session.get(url, timeout=timeout)
        if resp.status_code != 200:
            errors.append(f"feed {url}: HTTP {resp.status_code}")
            return []
        content = resp.content
    except Exception as exc:  # noqa: BLE001
        errors.append(f"feed {url}: {exc}")
        return []

    try:
        root = ET.fromstring(content)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"feed {url}: parse error: {exc}")
        return []

    entries = []
    for el in root.iter():
        if _localname(el.tag).lower() in ("item", "entry"):
            parsed = _parse_entry(el)
            if parsed.get("title"):
                entries.append(parsed)
    if not entries:
        errors.append(f"feed {url}: no items found")
    return entries


def _parse_entry(el) -> dict:
    data = {"title": "", "link": "", "date_raw": "", "summary_raw": "", "image": ""}
    media_content = ""
    media_thumbnail = ""
    enclosure_img = ""
    for child in el:
        ln = _localname(child.tag).lower()
        text = (child.text or "").strip()
        url = (child.get("url") or "").strip()
        if ln == "title" and not data["title"]:
            data["title"] = text
        elif ln == "link" and not data["link"]:
            href = child.get("href")
            data["link"] = (href or text).strip()
        elif ln == "thumbnail":
            # media:thumbnail (namespaced local name "thumbnail")
            if url and not media_thumbnail:
                media_thumbnail = url
        elif ln == "content":
            # media:content carries a url attribute; Atom <content> carries text.
            if url and not media_content:
                media_content = url
            elif text and not data["summary_raw"]:
                data["summary_raw"] = text
        elif ln == "enclosure":
            etype = (child.get("type") or "").lower()
            if url and etype.startswith("image/") and not enclosure_img:
                enclosure_img = url
        elif ln in ("pubdate", "published", "updated", "date") and not data["date_raw"]:
            data["date_raw"] = text
        elif ln in ("description", "summary") and not data["summary_raw"]:
            data["summary_raw"] = text

    # Priority: media:content -> media:thumbnail -> enclosure(image/*) -> <img> in desc.
    for candidate in (media_content, media_thumbnail, enclosure_img):
        cleaned = _clean_image_url(candidate)
        if cleaned:
            data["image"] = cleaned
            break
    if not data["image"] and data["summary_raw"]:
        match = re.search(
            r'<img[^>]+src=["\']([^"\']+)["\']', data["summary_raw"], re.IGNORECASE
        )
        if match:
            data["image"] = _clean_image_url(match.group(1))
    return data


# --------------------------------------------------------------------------- #
# Article construction / scoring
# --------------------------------------------------------------------------- #

def _build_article(entry: dict, source: str, section_id: str, section_keywords: list,
                   priority_keywords: list, source_weights: dict, settings: dict,
                   now: datetime) -> dict | None:
    title = _strip_html(entry.get("title", ""))
    if not title:
        return None
    link = entry.get("link", "").strip()
    summary = _truncate(_strip_html(entry.get("summary_raw", "")))
    dt = _parse_date(entry.get("date_raw", ""))

    max_age = settings.get("max_age_hours", 72)
    text_lower = (title + " " + summary).lower()

    sec_hits = _keyword_hits(text_lower, section_keywords)
    pri_hits = _keyword_hits(text_lower, priority_keywords)

    # Rule 4: drop anything older than max_age when the date is parseable; drop
    # undated items only when they carry no keyword signal at all.
    if dt is not None:
        age_hours = (now - dt).total_seconds() / 3600.0
        if age_hours > max_age:
            return None
        recency_bonus = max(0.0, (max_age - max(0.0, age_hours))) * 0.4
    else:
        if not sec_hits and not pri_hits:
            return None
        recency_bonus = 1.0

    keyword_bonus = min(len(sec_hits), 4) * 1.5
    priority_bonus = min(len(pri_hits), 4) * 2.5
    source_w = float(source_weights.get(source, 1.0))
    score = (5.0 + recency_bonus + keyword_bonus + priority_bonus) * source_w

    # Tags: merged matched keywords (priority first), Title Cased, up to 3.
    tag_sources = []
    for k in pri_hits + sec_hits:
        if k not in tag_sources:
            tag_sources.append(k)
    tags = [_title_kw(k) for k in tag_sources[:3]]

    article = {
        "title": title,
        "url": link,
        "source": source,
        "published_iso": dt.isoformat() if dt else "",
        "published_display": _relative_display(dt, now),
        "summary": summary,
        "image": entry.get("image", ""),
        "score": round(score, 1),
        "is_top": False,
        "section": section_id,
        "tags": tags,
        "coverage": 1,
        "related": [],
    }
    return article


# --------------------------------------------------------------------------- #
# Market notes
# --------------------------------------------------------------------------- #

def _move_verb(pct: float) -> str:
    if pct > 0.005:
        return "rose"
    if pct < -0.005:
        return "fell"
    return "was flat"


def _index_note(quotes: list, order: list, label_map: dict) -> str:
    by_symbol = {q["symbol"]: q for q in quotes}
    parts = []
    for i, sym in enumerate(order):
        q = by_symbol.get(sym)
        if not q:
            continue
        raw = q.get("_raw", {"pct": 0.0})
        pct = raw["pct"]
        label = label_map.get(sym, q["name"])
        if i == 0:
            parts.append(f"{label} {_move_verb(pct)} {abs(pct):.2f}% to {q['price']}")
        else:
            parts.append(f"{label} {pct:+.2f}%")
    if not parts:
        return ""
    return "; ".join(parts) + "."


def _single_note(quote, label: str) -> str:
    if not quote:
        return ""
    pct = quote.get("_raw", {}).get("pct", 0.0)
    return f"{label} {_move_verb(pct)} {abs(pct):.2f}% to {quote['price']}."


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def collect(config: dict) -> dict:
    errors: list = []
    settings = config.get("settings", {}) or {}
    timeout = int(settings.get("request_timeout", 20))
    user_agent = settings.get("user_agent", "MorningPaper/1.0")
    max_per_source = int(settings.get("max_per_source_per_section", 2))
    max_per_section = int(settings.get("max_articles_per_section", 6))
    max_front_page = int(settings.get("max_front_page", 8))

    source_weights = config.get("source_weights", {}) or {}
    require_any = [str(k).lower() for k in settings.get("require_any", [])]
    priority_keywords = [str(k).lower() for k in config.get("priority_keywords", [])]

    now = datetime.now(timezone.utc)

    try:
        now_local = _local_now(settings)
    except Exception:
        now_local = now

    generated_at = now_local.strftime("%Y-%m-%d %H:%M")
    weekday = now_local.strftime("%A")
    date_display = f"{now_local.strftime('%A, %B')} {now_local.day}, {now_local.year}"

    session = _build_session(user_agent)

    # ---------------- Markets ---------------- #
    markets_cfg = config.get("markets", {}) or {}

    def _collect_group(items) -> list:
        out = []
        for item in items or []:
            q = _fetch_quote(session, item, timeout, errors)
            if q is not None:
                out.append(q)
        return out

    indices = _collect_group(markets_cfg.get("indices"))
    commodities = _collect_group(markets_cfg.get("commodities"))
    watchlist_us = _collect_group(markets_cfg.get("watchlist_us"))
    watchlist_id = _collect_group(markets_cfg.get("watchlist_id"))

    id_label = {"^JKSE": "IHSG", "^GSPC": "S&P 500", "^IXIC": "Nasdaq", "^DJI": "Dow Jones"}
    us_note = _index_note(indices, ["^GSPC", "^IXIC", "^DJI"], id_label)
    id_note = _single_note(next((q for q in indices if q["symbol"] == "^JKSE"), None), "IHSG")

    def _clean(quotes):
        for q in quotes:
            q.pop("_raw", None)
        return quotes

    markets = {
        "indices": _clean(indices),
        "commodities": _clean(commodities),
        "watchlist_us": _clean(watchlist_us),
        "watchlist_id": _clean(watchlist_id),
        "private_watch": markets_cfg.get("private_watch", []),
        "summary_notes": {"us": us_note, "id": id_note},
    }

    # ---------------- News sections ---------------- #
    feed_cache: dict = {}
    section_meta = []

    for sec in config.get("sections", []) or []:
        sec_id = sec.get("id", "")
        sec_keywords = [str(k).lower() for k in sec.get("keywords", [])]
        collected = []
        for feed_url in sec.get("feeds", []) or []:
            if feed_url not in feed_cache:
                feed_cache[feed_url] = _fetch_feed(session, feed_url, timeout, errors)
            source = _source_from_url(feed_url)
            for entry in feed_cache[feed_url]:
                art = _build_article(
                    entry, source, sec_id, sec_keywords, priority_keywords,
                    source_weights, settings, now,
                )
                if art is None:
                    continue
                # Sections fed by general-purpose feeds can demand a topic match.
                if sec.get("require_keywords") and not art["tags"]:
                    continue
                # Edition-wide topic gate (AI Daily: every story must be about AI).
                if require_any and not _keyword_hits(
                    (art["title"] + " " + art["summary"]).lower(), require_any
                ):
                    continue
                collected.append(art)

        collected.sort(key=lambda a: a["score"], reverse=True)
        section_meta.append({
            "id": sec_id,
            "title": sec.get("title", ""),
            "subtitle": sec.get("subtitle", ""),
            "articles": collected,
        })

    # Story clustering: the same story reported by several outlets becomes ONE
    # entry (the best-scoring version) carrying a coverage count and links to the
    # other outlets - the way news apps show "covered by N sources". Coverage
    # also boosts the score: what many newsrooms report is usually what matters.
    coverage_boost = float(settings.get("coverage_boost", 4.0))
    similarity = float(settings.get("cluster_similarity", 0.42))

    unique_by_url: dict = {}
    for idx, sec in enumerate(section_meta):
        for art in sec["articles"]:
            key = art["url"] or art["title"]
            unique_by_url.setdefault(key, []).append((idx, art))
    representatives = [members[0][1] for members in unique_by_url.values()]
    tokens = [_title_tokens(a["title"]) for a in representatives]
    norms = [_norm_title(a["title"]) for a in representatives]

    parent = list(range(len(representatives)))

    def _find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    # Rarity-weighted overlap: sharing "Genie" or "Anthropic" says far more
    # than sharing "launch" or "model".
    import math

    doc_freq: dict = {}
    for tok_set in tokens:
        for tok in tok_set:
            doc_freq[tok] = doc_freq.get(tok, 0) + 1
    total_docs = max(len(tokens), 1)

    def _weight(tok):
        return math.log((total_docs + 1) / (doc_freq.get(tok, 0) + 0.5))

    weights = [sum(_weight(t) for t in tok_set) for tok_set in tokens]

    for i in range(len(representatives)):
        for j in range(i + 1, len(representatives)):
            same = norms[i] == norms[j]
            if not same:
                shared = tokens[i] & tokens[j]
                if len(shared) >= 2:
                    shared_weight = sum(_weight(t) for t in shared)
                    smaller = min(weights[i], weights[j]) or 1.0
                    overlap = shared_weight / smaller
                    rare_shared = sum(1 for t in shared if doc_freq.get(t, 0) <= max(3, total_docs * 0.01))
                    same = (rare_shared >= 2 and overlap >= 0.25) or (rare_shared >= 1 and (
                        overlap >= similarity or (len(shared) >= 3 and overlap >= similarity - 0.12)
                    ))
            if same:
                parent[_find(i)] = _find(j)

    clusters: dict = {}
    for i, art in enumerate(representatives):
        clusters.setdefault(_find(i), []).append(art)

    cluster_of_url = {}
    for cluster_id, members in clusters.items():
        sources = {m["source"] for m in members}
        members.sort(key=lambda a: a["score"], reverse=True)
        for art in members:
            cluster_of_url[art["url"] or art["title"]] = cluster_id
        if len(sources) <= 1:
            continue
        boost = min(len(sources) - 1, 3) * coverage_boost
        for art in members:
            related = []
            seen_sources = {art["source"]}
            for other in members:
                if other is art or other["source"] in seen_sources:
                    continue
                seen_sources.add(other["source"])
                related.append({"source": other["source"], "title": other["title"], "url": other["url"]})
            for _, copy in unique_by_url[art["url"] or art["title"]]:
                copy["coverage"] = len(sources)
                copy["related"] = related[:4]
                copy["score"] = round(copy["score"] + boost, 1)
                if not copy.get("image"):
                    copy["image"] = next((m["image"] for m in members if m.get("image")), "")

    for sec in section_meta:
        sec["articles"].sort(key=lambda a: a["score"], reverse=True)

    # A story (cluster) may live in only ONE section: the section where its
    # best version scores highest (ties -> earlier section in config).
    best_home: dict = {}
    for idx, sec in enumerate(section_meta):
        for art in sec["articles"]:
            cluster_id = cluster_of_url.get(art["url"] or art["title"])
            rank = (-art["score"], idx)
            if cluster_id not in best_home or rank < best_home[cluster_id][0]:
                best_home[cluster_id] = (rank, id(art))

    losers = set()
    for sec in section_meta:
        for art in sec["articles"]:
            cluster_id = cluster_of_url.get(art["url"] or art["title"])
            if best_home.get(cluster_id, (None, id(art)))[1] != id(art):
                losers.add(id(art))

    sections_out = []
    for sec in section_meta:
        deduped = [a for a in sec["articles"] if id(a) not in losers]

        # Enforce max_per_source_per_section on the deduped list.
        per_source = {}
        capped = []
        for art in deduped:
            src = art["source"]
            if per_source.get(src, 0) >= max_per_source:
                continue
            per_source[src] = per_source.get(src, 0) + 1
            capped.append(art)

        # Enforce max_articles_per_section.
        capped = capped[:max_per_section]

        sections_out.append({
            "id": sec["id"],
            "title": sec["title"],
            "subtitle": sec["subtitle"],
            "articles": capped,
        })

    # ---------------- Front page ---------------- #
    pool = []
    for sec in sections_out:
        pool.extend(sec["articles"])
    pool.sort(key=lambda a: a["score"], reverse=True)

    front_page = []
    source_counts = {}
    seen_titles = set()
    for art in pool:
        if len(front_page) >= max_front_page:
            break
        if source_counts.get(art["source"], 0) >= 2:
            continue
        norm = _norm_title(art["title"])
        if norm in seen_titles:
            continue
        seen_titles.add(norm)
        source_counts[art["source"]] = source_counts.get(art["source"], 0) + 1
        front_page.append(art)

    for art in front_page:
        art["is_top"] = True

    # ---------------- Stats ---------------- #
    total_articles = sum(len(s["articles"]) for s in sections_out)
    all_sources = {a["source"] for s in sections_out for a in s["articles"]}
    stats = {
        "articles": total_articles,
        "sources": len(all_sources),
        "sections": sum(1 for s in sections_out if s["articles"]),
        "scanned": len(representatives),
        "multi_source": sum(1 for members in clusters.values() if len({m["source"] for m in members}) > 1),
    }

    return {
        "generated_at": generated_at,
        "date_display": date_display,
        "edition": settings.get("edition_name", "MORNING EDITION"),
        "date_iso": now_local.strftime("%Y-%m-%d"),
        "time_display": now_local.strftime("%H:%M"),
        "weekday": weekday,
        "stats": stats,
        "markets": markets,
        "front_page": front_page,
        "sections": sections_out,
        "_errors": errors,
    }


if __name__ == "__main__":  # pragma: no cover
    import json as _json

    with open("config.json", encoding="utf-8") as fh:
        data = collect(_json.load(fh))
    print(_json.dumps(data, ensure_ascii=False, indent=2))
