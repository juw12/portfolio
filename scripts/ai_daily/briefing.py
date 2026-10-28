"""briefing.py - the AI layer of the paper: "The Brief" + "Why it matters".

Public API:
    add_brief(data: dict, config: dict, log=print) -> None   (mutates ``data``)

Adds to ``data``:
    data["brief"] = {
        "lede": "One sentence on the day's biggest theme",
        "bullets": [{"text": "...", "url": "...", "source": "...", "title": "..."}],  # up to 5
        "provider": "ollama" | "extractive",
        "model": "qwen3:8b" | "",
        "story_count": 10,
    }
and an optional ``"why"`` string on the lead front-page articles.

Providers, tried in order when ``briefing.provider`` is "auto":
    1. Ollama      - an open model (default Qwen3 8B) on a local Ollama server
                     (OLLAMA_URL, default http://localhost:11434): on your PC for
                     the Morning Paper, inside the free GitHub Actions runner for
                     AI Daily. No API key, no account, no quota.
    2. Extractive  - no AI: the top headlines with their first sentence.
(GitHub Models was used here until GitHub retired it on 2026-07-30.)

The model only sees headlines + feed summaries and is instructed to use those
facts alone. Every output is validated; anything malformed falls back per item.
Never raises.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")

SYSTEM_PROMPT = (
    "You are the editor of a calm, precise morning news briefing read by engineers. "
    "Use ONLY the facts in the provided stories. Never invent numbers, names, dates or claims, "
    "never speculate, no hype words (\"game-changer\", \"revolutionary\"), no emojis. "
    "Write plain, specific English. Answer with a single JSON object and nothing else."
)

USER_TEMPLATE = """Today's top stories (id, section, source, coverage = number of outlets reporting it, headline, summary):

{stories}

Return JSON with exactly these keys:
{{
  "lede": "ONE sentence, max 30 words, naming the day's biggest theme or story",
  "bullets": [{{"id": <story id>, "text": "max 28 words: what happened, concretely"}}],
  "why": [{{"id": <story id>, "text": "max 24 words: why it matters / who it affects"}}]
}}
Rules: "bullets" = exactly 5 DIFFERENT stories, most important first (favour high coverage).
"why" = one entry for each of these ids: {why_ids}.
"""


def _clean(text, limit):
    text = re.sub(r"\s+", " ", str(text or "")).strip().strip('"').strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-") + "…"
    return text


def _first_sentence(text, limit=160):
    text = (text or "").strip()
    match = re.match(r"(.+?[.!?])(\s|$)", text)
    sentence = match.group(1) if match else text
    return _clean(sentence, limit)


def _candidates(data, limit=14):
    """Front page first, then each section's best story not already included."""
    picked = []
    seen = set()
    for article in data.get("front_page") or []:
        key = article.get("url") or article.get("title")
        if key not in seen:
            seen.add(key)
            picked.append(article)
    for section in data.get("sections") or []:
        for article in (section.get("articles") or [])[:2]:
            key = article.get("url") or article.get("title")
            if key not in seen and len(picked) < limit:
                seen.add(key)
                picked.append(article)
    return picked[:limit]


def _parse_json(text):
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    return json.loads(text[start:end + 1])


def _ollama_session():
    session = requests.Session()
    session.trust_env = False  # never send localhost traffic through a corporate proxy
    return session


def _ollama_available(model):
    try:
        response = _ollama_session().get(f"{OLLAMA_URL}/api/tags", timeout=3)
        names = [m.get("name", "") for m in response.json().get("models", [])]
        return any(name == model or name.split(":")[0] == model.split(":")[0] for name in names)
    except Exception:
        return False


def _call_ollama(messages, model, timeout):
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "format": "json",
        "think": False,
        "keep_alive": "10m",
        "options": {"temperature": 0.2, "num_ctx": 6144, "num_predict": 900},
    }
    session = _ollama_session()
    response = session.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=timeout)
    if response.status_code == 400 and "think" in response.text:
        payload.pop("think")
        response = session.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=timeout)
    if response.status_code != 200:
        raise RuntimeError(f"Ollama HTTP {response.status_code}: {response.text[:200]}")
    return response.json()["message"]["content"]


def _extractive(stories):
    bullets = []
    for article in stories[:5]:
        sentence = _first_sentence(article.get("summary", ""), 140)
        title = article.get("title", "")
        text = title if not sentence or sentence.lower().startswith(title.lower()[:30]) else f"{title}. {sentence}"
        bullets.append({"id": stories.index(article), "text": _clean(text, 230)})
    lede = ""
    if stories:
        lede = f"Leading today: {stories[0].get('title', '')}."
    return {"lede": lede, "bullets": bullets, "why": []}


def _load_cache(path, max_age_hours, stories):
    """Reuse a recent AI brief (hourly refreshes) while its stories are still current."""
    try:
        cache = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return None
    if time.time() - float(cache.get("saved_at", 0)) > max_age_hours * 3600:
        return None
    current = {s.get("url") for s in stories}
    bullets = [b for b in cache.get("brief", {}).get("bullets", []) if b.get("url") in current]
    if len(bullets) < 3:
        return None
    brief = dict(cache["brief"])
    brief["bullets"] = bullets
    return brief, cache.get("why", {})


def _save_cache(path, brief, why_by_url):
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(
            json.dumps({"saved_at": time.time(), "brief": brief, "why": why_by_url}, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        pass


def add_brief(data: dict, config: dict, log=print) -> None:
    settings = config.get("briefing", {}) or {}
    provider = str(settings.get("provider", "auto")).lower()
    ollama_model = settings.get("ollama_model", "qwen3:8b")
    timeout = int(settings.get("timeout", 300))
    why_count = int(settings.get("why_count", 4))

    cache_path = settings.get("cache_path", "")
    reuse_hours = float(settings.get("reuse_hours", 0))
    max_stories = int(settings.get("ollama_max_stories", 10))
    summary_cap = int(settings.get("summary_cap", 170))

    stories = _candidates(data, limit=max_stories)
    if stories and cache_path and reuse_hours > 0:
        cached = _load_cache(cache_path, reuse_hours, stories)
        if cached:
            brief, why_by_url = cached
            for article in data.get("front_page") or []:
                if why_by_url.get(article.get("url")):
                    article["why"] = why_by_url[article["url"]]
            data["brief"] = brief
            log(f"brief: reused cached {brief.get('provider')} brief ({len(brief['bullets'])} bullets)")
            return
    if not stories:
        data["brief"] = {"lede": "", "bullets": [], "provider": "none", "model": "", "story_count": 0}
        return

    lines = []
    for idx, article in enumerate(stories):
        lines.append(json.dumps({
            "id": idx,
            "section": article.get("section", ""),
            "source": article.get("source", ""),
            "coverage": article.get("coverage", 1),
            "headline": article.get("title", ""),
            "summary": _clean(article.get("summary", ""), summary_cap),
        }, ensure_ascii=False))
    front_ids = list(range(min(why_count, len(data.get("front_page") or []))))
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": USER_TEMPLATE.format(stories="\n".join(lines), why_ids=front_ids)},
    ]

    attempts = []
    if provider in ("auto", "ollama"):
        if _ollama_available(ollama_model):
            attempts.append(("ollama", ollama_model, _call_ollama))
        else:
            log(f"brief: Ollama with {ollama_model} not reachable at {OLLAMA_URL}")

    result, used, used_model = None, "extractive", ""
    for name, model, call in attempts:
        try:
            result = _parse_json(call(messages, model, timeout))
            used, used_model = name, model
            break
        except Exception as exc:  # noqa: BLE001 - fall through to the next provider
            log(f"brief: {name} failed: {exc}")
    if result is None:
        result = _extractive(stories)

    bullets = []
    used_ids = set()
    for item in result.get("bullets") or []:
        try:
            idx = int(item.get("id"))
        except Exception:
            continue
        text = _clean(item.get("text", ""), 240)
        if idx in used_ids or not (0 <= idx < len(stories)) or len(text) < 12:
            continue
        used_ids.add(idx)
        article = stories[idx]
        bullets.append({
            "text": text,
            "url": article.get("url", ""),
            "source": article.get("source", ""),
            "title": article.get("title", ""),
        })
        if len(bullets) == 5:
            break
    if len(bullets) < 3:  # model output unusable -> extractive bullets
        fallback = _extractive(stories)
        bullets = [
            {"text": b["text"], "url": stories[b["id"]].get("url", ""),
             "source": stories[b["id"]].get("source", ""), "title": stories[b["id"]].get("title", "")}
            for b in fallback["bullets"]
        ]
        if used != "extractive":
            log("brief: model bullets unusable, using extractive bullets")
            used, used_model = "extractive", ""

    for item in result.get("why") or []:
        try:
            idx = int(item.get("id"))
        except Exception:
            continue
        text = _clean(item.get("text", ""), 200)
        if idx in front_ids and len(text) >= 12:
            stories[idx]["why"] = text

    lede = _clean(result.get("lede", ""), 220)
    sources = {s.get("source") for s in stories}
    data["brief"] = {
        "lede": lede,
        "bullets": bullets,
        "provider": used,
        "model": used_model,
        "story_count": len(stories),
        "source_count": len(sources),
    }
    if cache_path and used == "ollama":
        why_by_url = {s.get("url"): s["why"] for s in stories if s.get("why")}
        _save_cache(cache_path, data["brief"], why_by_url)
    log(f"brief: {used} {used_model} - {len(bullets)} bullets")
