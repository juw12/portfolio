"""Safety tools: chat word filter, personal mutes, player reports and bans.

Everything here is saved to a small JSON file next to the world (moderation.json), separate from
world.json so moderators can read or edit it by hand. The admin side (reports list, bans, build
removal) is reached through /api/admin with the token from --admin-token / TOWNSQUARE_ADMIN_TOKEN.
"""

import hmac
import json
import os
import re
import threading
import time
import unicodedata
from pathlib import Path

# A starting list of common English swear words and slurs. Add more (other languages, local slang)
# one per line in blocked_words.txt next to the world file; lines starting with # are ignored.
DEFAULT_BLOCKED_WORDS = (
    "fuck", "fck", "shit", "bitch", "cunt", "pussy", "asshole", "arsehole",
    "bastard", "whore", "slut", "wanker", "twat", "bollocks", "motherfucker", "dickhead",
    "fag", "faggot", "nigger", "nigga", "retard", "tranny", "kike", "rape",
    "rapist", "nazi", "porn", "nude", "nudes", "kys",
)
# Endings that still count as the blocked word ("fucking", "shits", "bitchy").
SUFFIXES = r"(?:s|es|ed|er|ers|ing|in|y|ty)?"
LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})
TOKEN = re.compile(r"[\w@$!]+", re.UNICODE)

# Names get a stricter check: these never appear inside a harmless name, so "FuckFace" or
# "xXshitlordXx" are refused even though they are one word.
NAME_SUBSTRINGS = (
    "fuck", "shit", "bitch", "nigger", "nigga", "faggot", "whore", "slut",
    "rapist", "asshole", "porn", "retard", "wanker",
)
MAX_REPORTS_KEPT = 500
REPORTS_PER_HOUR = 5
REPORT_REASON_CHARS = 200
MAX_MUTES = 200


def word_pattern(word):
    """'ass' -> a+s+s+ so stretched spellings ("asssss") match but "as" and "class" don't."""
    letters = "".join(f"{re.escape(letter)}+" for letter in word)
    return re.compile(f"{letters}{SUFFIXES}")


def normalise(token):
    """Lower-case, strip accents, undo leetspeak (sh1t, @ss) and drop everything but letters."""
    folded = unicodedata.normalize("NFKD", token.lower())
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return re.sub(r"[^a-z]", "", folded.translate(LEET))


class WordFilter:
    def __init__(self, words=DEFAULT_BLOCKED_WORDS, extra_file=None):
        self._words = {normalise(word) for word in words if normalise(word)}
        if extra_file and Path(extra_file).exists():
            for line in Path(extra_file).read_text(encoding="utf-8").splitlines():
                word = normalise(line.strip())
                if word and not line.lstrip().startswith("#"):
                    self._words.add(word)
        self._patterns = [word_pattern(word) for word in sorted(self._words)]

    def _blocked(self, token):
        word = normalise(token)
        return bool(word) and any(pattern.fullmatch(word) for pattern in self._patterns)

    def clean(self, text):
        """The text with every blocked word replaced by asterisks of the same length."""
        return TOKEN.sub(lambda match: "*" * len(match.group(0)) if self._blocked(match.group(0)) else match.group(0), text)

    def is_clean(self, text):
        return not any(self._blocked(match.group(0)) for match in TOKEN.finditer(text))

    def is_clean_name(self, name):
        """Stricter check for player and account names (split camelCase and _ - . too)."""
        parts = re.split(r"[_\-\s.]+|(?<=[a-z])(?=[A-Z])", name)
        if not all(self.is_clean(part) for part in parts if part):
            return False
        squashed = normalise(name)
        return not any(word in squashed for word in NAME_SUBSTRINGS)


def token_matches(given, configured):
    """Constant-time admin token check; an empty configured token disables admin access."""
    if not configured or not isinstance(given, str) or not given:
        return False
    return hmac.compare_digest(given.encode("utf-8"), configured.encode("utf-8"))


class Moderation:
    """Bans, reports and personal mutes, optionally saved to a JSON file."""

    def __init__(self, path=None):
        self._path = Path(path) if path else None
        self._lock = threading.Lock()
        self.bans = {}       # owner tag -> {"name", "reason", "until" (0 = forever), "at"}
        self.ip_bans = {}    # ip -> same shape
        self.reports = []    # newest last
        self.muted = {}      # owner tag -> {muted owner tag: their name}
        self._next_report_id = 1
        self._report_times = {}  # reporter tag -> [timestamps] (not saved)
        if self._path and self._path.exists():
            self._load()

    # ------------------------------------------------------------ persistence
    def _load(self):
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            print(f"WARNING: could not read {self._path} ({error}); starting with no bans or reports")
            return
        self.bans = {str(k)[:12]: v for k, v in (data.get("bans") or {}).items() if isinstance(v, dict)}
        self.ip_bans = {str(k)[:64]: v for k, v in (data.get("ipBans") or {}).items() if isinstance(v, dict)}
        self.reports = [r for r in (data.get("reports") or []) if isinstance(r, dict)][-MAX_REPORTS_KEPT:]
        self.muted = {
            str(owner)[:12]: {str(tag)[:12]: str(name)[:16] for tag, name in tags.items()}
            for owner, tags in (data.get("muted") or {}).items()
            if isinstance(tags, dict)
        }
        self._next_report_id = max([int(r.get("id", 0)) for r in self.reports] + [0]) + 1

    def save(self):
        if not self._path:
            return
        with self._lock:
            payload = {
                "bans": self.bans,
                "ipBans": self.ip_bans,
                "reports": self.reports,
                "muted": self.muted,
            }
            try:
                self._path.parent.mkdir(parents=True, exist_ok=True)
                temp_file = self._path.with_suffix(".json.tmp")
                temp_file.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
                os.replace(temp_file, self._path)
            except OSError as error:
                print(f"WARNING: could not save {self._path}: {error}")

    # ------------------------------------------------------------ bans
    @staticmethod
    def _active(ban, now):
        return ban is not None and (ban.get("until", 0) == 0 or ban["until"] > now)

    def ban_for(self, owner, ip, now):
        """The ban that applies to this owner tag or IP address right now, or None."""
        for ban in (self.bans.get(owner), self.ip_bans.get(ip) if ip else None):
            if self._active(ban, now):
                return ban
        return None

    def ban(self, owner, name, reason, hours, now, ip=None):
        until = 0 if not hours else now + float(hours) * 3600
        entry = {"name": name, "reason": reason[:REPORT_REASON_CHARS], "until": until, "at": now}
        self.bans[owner] = entry
        if ip:
            self.ip_bans[ip] = {**entry, "owner": owner}
        self.save()
        return entry

    def unban(self, owner):
        removed = self.bans.pop(owner, None) is not None
        for ip in [ip for ip, ban in self.ip_bans.items() if ban.get("owner") == owner]:
            del self.ip_bans[ip]
            removed = True
        if removed:
            self.save()
        return removed

    def active_bans(self, now):
        return [{"owner": owner, **ban} for owner, ban in self.bans.items() if self._active(ban, now)]

    # ------------------------------------------------------------ reports
    def can_report(self, reporter, now):
        recent = [t for t in self._report_times.get(reporter, []) if now - t < 3600]
        self._report_times[reporter] = recent
        return len(recent) < REPORTS_PER_HOUR

    def add_report(self, report, now):
        self._report_times.setdefault(report["reporter"], []).append(now)
        entry = {"id": self._next_report_id, "at": now, "resolved": False, **report}
        self._next_report_id += 1
        self.reports.append(entry)
        del self.reports[:-MAX_REPORTS_KEPT]
        self.save()
        return entry

    def resolve_report(self, report_id):
        for report in self.reports:
            if report.get("id") == report_id:
                report["resolved"] = True
                self.save()
                return True
        return False

    # ------------------------------------------------------------ mutes
    def muted_by(self, owner):
        return self.muted.get(owner, {})

    def mute(self, owner, target, name):
        entries = self.muted.setdefault(owner, {})
        if target not in entries and len(entries) >= MAX_MUTES:
            return False
        entries[target] = name
        self.save()
        return True

    def unmute(self, owner, target):
        entries = self.muted.get(owner, {})
        if entries.pop(target, None) is None:
            return False
        if not entries:
            self.muted.pop(owner, None)
        self.save()
        return True


def now_s():
    return time.time()
