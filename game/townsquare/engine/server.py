"""Townsquare 3D - zero-dependency multiplayer world server.

Serves the web app from ./public and keeps the shared world:
  * players  - live positions, names, chat bubbles (in memory)
  * chat     - recent messages (in memory)
  * builds   - everything people have built (persisted to data/world.json)
  * accounts - username/password logins that keep your owner key (data/accounts.json)
  * social   - plot co-builders and friends lists (saved with the world)

Clients sync ~10x per second over POST /api/sync. Builds are delivered as a
snapshot on join and as an incremental change log afterwards.

Land: the world is divided into PLOT_SIZE x PLOT_SIZE plots. The plaza and the
paths are public (no building). Anyone can claim free plots (up to
MAX_PLOTS_PER_OWNER); the owner and the co-builders they invite can build there.

Run:   python server.py                    (http://localhost:8420)
       python server.py --port 9000 --world data/other.json
Phone: open the printed LAN URL on a phone on the same Wi-Fi network.
"""

import argparse
import hashlib
import json
import math
import os
import random
import re
import secrets
import socket
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import economy
import goals
import orders
import progress
from moderation import Moderation, WordFilter, token_matches
from accounts import AccountError, AccountStore
from townlife import TownLife, default_local_hour  # noqa: E402  (local module; townsfolk simulation)

VERSION = "1.0.0"
HOST = "0.0.0.0"
DEFAULT_PORT = 8420
APP_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = APP_DIR / "public"
DEFAULT_WORLD_FILE = APP_DIR / "data" / "world.json"
ACCOUNTS_FILE_NAME = "accounts.json"  # stored next to the world file

# Players & chat
PLAYER_TIMEOUT_S = 5.0
BUBBLE_DURATION_S = 6.0
# Lighter sync for phones ("lite" clients): people further than NEAR_RADIUS_M are only sent on
# every FAR_EVERY-th reply (10 Hz -> 2 Hz). Replies that leave them out say playersFull: false.
NEAR_RADIUS_M = 32.0
FAR_EVERY = 5
CHAT_HISTORY = 50
CHAT_ON_JOIN = 15
MAX_BODY_BYTES = 32 * 1024
WORLD_LIMIT = 500.0
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,48}$")

# Building (keep in sync with public/buildables.js and CONFIG.build in main.js)
DECOR_TYPES = {"block", "slab", "wall", "glass", "lamp", "tree", "flower", "bench"}
OBJECT_TYPES = DECOR_TYPES | set(economy.PRODUCERS)
BUILD_RADIUS = 72.0             # metres from the town centre
FOUNTAIN_CLEAR_RADIUS = 3.6     # keep the fountain free
MAX_BUILD_HEIGHT = 24.0
MAX_OBJECTS = 20000
MAX_OBJECTS_PER_OWNER = 3000
MAX_BUILD_OPS_PER_SYNC = 25
BUILD_BUCKET_CAPACITY = 30      # burst size
BUILD_REFILL_PER_S = 8.0        # sustained builds per second per person
OP_LOG_SIZE = 3000              # changes kept for incremental sync
AUTOSAVE_INTERVAL_S = 2.0

# Land (keep in sync with the defaults in public/main.js; the server also sends these as "rules")
PLOT_SIZE = 10                  # metres / grid cells per plot side
MAX_PLOTS_PER_OWNER = len(economy.PLOT_PRICES)  # 1st plot free, then rising prices
PLAZA_PROTECT_RADIUS = 16.0     # public town square around the fountain
PATH_PROTECT_HALF_WIDTH = 2     # cells with |x| or |z| <= this are the public paths
PLOT_KEY_PATTERN = re.compile(r"^(-?\d{1,3}),(-?\d{1,3})$")
RULES = {
    "plotSize": PLOT_SIZE,
    "maxPlots": MAX_PLOTS_PER_OWNER,
    "plazaRadius": PLAZA_PROTECT_RADIUS,
    "pathHalfWidth": PATH_PROTECT_HALF_WIDTH,
    "buildRadius": BUILD_RADIUS,
    "maxHeight": MAX_BUILD_HEIGHT,
    "economy": economy.public_rules(),
}
MAX_EVENTS_PER_SYNC = 8

# Town feed ("what's happening right now": every entry can be visited)
FEED_SIZE = 40
FEED_ON_JOIN = 8
BIG_SALE = 5                    # sales of at least this many units make the feed
PRODUCER_LABELS = {
    "field": "🌾 a wheat field",
    "woodlot": "🌲 a woodlot",
    "quarry": "🧱 a quarry",
    "oven": "🍞 an oven",
    "sawmill": "🏭 a sawmill",
}

# Showcase: one star per account per plot; the most-starred plots are listed in the feed panel
TOP_PLOTS = 5
LIKE_MILESTONES = (3, 10, 25, 50, 100, 250)  # star counts that make the feed
MAX_LIKES_PER_OWNER = 500

# Social
MAX_BUILDERS_PER_PLOT = 8       # co-builders an owner can invite onto one plot
MAX_FRIENDS = 50
TAG_PATTERN = re.compile(r"^[0-9a-f]{12}$")
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,16}$")

# Town layout (generated once here so the server knows which land is occupied by town houses)
TOWN_SEED = 1234
HOUSE_COUNT = 12
PATH_VISUAL_HALF_WIDTH = 1.6
WALL_COLORS = ["#f2e8cf", "#e9c46a", "#f4a261", "#a8dadc", "#ffd6e0", "#dde5b6"]
ROOF_COLORS = ["#b5543c", "#6d4c41", "#3d5a80", "#8d3b72"]


def generate_town(seed=TOWN_SEED, house_count=HOUSE_COUNT):
    """Deterministic town houses: off the paths, not overlapping, outside the plaza."""
    rng = random.Random(seed)
    houses = []
    for _ in range(800):
        if len(houses) >= house_count:
            break
        angle = rng.random() * math.tau
        distance = rng.uniform(PLAZA_PROTECT_RADIUS + 5, BUILD_RADIUS - 10)
        x = math.cos(angle) * distance
        z = math.sin(angle) * distance
        width = rng.uniform(5, 8)
        depth = rng.uniform(5, 8)
        half = max(width, depth) / 2
        path_clearance = PATH_VISUAL_HALF_WIDTH + half + 1.5
        if abs(x) < path_clearance or abs(z) < path_clearance:
            continue
        if any(abs(x - h["x"]) < (width + h["width"]) / 2 + 4 and abs(z - h["z"]) < (depth + h["depth"]) / 2 + 4 for h in houses):
            continue
        houses.append({
            "x": round(x, 2),
            "z": round(z, 2),
            "width": round(width, 2),
            "depth": round(depth, 2),
            "wallHeight": round(rng.uniform(3, 4.2), 2),
            "roofHeight": round(rng.uniform(1.6, 2.6), 2),
            "wallColor": rng.choice(WALL_COLORS),
            "roofColor": rng.choice(ROOF_COLORS),
        })
    return houses


TOWN_HOUSES = generate_town()


def clamp_number(value, low, high, default=0.0):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return max(low, min(high, number))


def owner_tag_for(owner_key, fallback):
    """Public, stable owner id derived from the client's private key."""
    source = owner_key or f"anon:{fallback}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:12]


def plot_key_for_cell(x, z):
    return f"{math.floor(x / PLOT_SIZE)},{math.floor(z / PLOT_SIZE)}"


def is_public_cell(x, z):
    return (
        math.hypot(x, z) <= PLAZA_PROTECT_RADIUS
        or abs(x) <= PATH_PROTECT_HALF_WIDTH
        or abs(z) <= PATH_PROTECT_HALF_WIDTH
    )


def is_claimable_plot(px, pz):
    centre = (PLOT_SIZE - 1) / 2
    distance = math.hypot(px * PLOT_SIZE + centre, pz * PLOT_SIZE + centre)
    if not PLAZA_PROTECT_RADIUS < distance <= BUILD_RADIUS - PLOT_SIZE / 2:
        return False
    return not plot_overlaps_house(px, pz)


def plot_overlaps_house(px, pz):
    min_x = px * PLOT_SIZE - 0.5
    min_z = pz * PLOT_SIZE - 0.5
    for house in TOWN_HOUSES:
        if (
            min_x < house["x"] + house["width"] / 2
            and min_x + PLOT_SIZE > house["x"] - house["width"] / 2
            and min_z < house["z"] + house["depth"] / 2
            and min_z + PLOT_SIZE > house["z"] - house["depth"] / 2
        ):
            return True
    return False


def parse_plot_key(raw):
    match = PLOT_KEY_PATTERN.match(str(raw))
    if not match:
        return None
    return int(match[1]), int(match[2])


class WorldState:
    """Thread-safe shared state for players, chat and built objects."""

    goals_enabled = True  # tests of exact prices switch the goal rewards off
    bumper_chance = 0.1   # chance that a harvest gives a 🍀 bumper crop (+50%)

    def __init__(
        self,
        world_file=None,
        townsfolk=True,
        accounts=None,
        town_clock=None,
        town_day=None,
        moderation=None,
        word_filter=None,
    ):
        self._lock = threading.Lock()
        self._moderation = moderation or Moderation()  # bans, reports, mutes (moderation.py)
        self._filter = word_filter or WordFilter()     # masks swear words in chat and names
        self._last_ip = {}                             # owner tag -> last IP seen (for IP bans)
        self._accounts = accounts          # AccountStore or None (guests only)
        self._players = {}
        self._town_clock = town_clock or default_local_hour  # now -> hour of day (server local time)
        self._town_life = TownLife(houses=TOWN_HOUSES, local_hour=self._town_clock) if townsfolk else None
        self._chat = []
        self._next_chat_id = 1

        self._objects = {}
        self._owner_counts = {}
        self._plots = {}
        self._plots_by_owner = {}
        self._op_log = []
        self._seq = 0
        self._epoch = secrets.token_hex(4)  # changes every server start
        self._dirty = False
        self._buckets = {}
        self._wallets = {}                 # owner tag -> {coins, goods}
        self._producer_counts = {}
        self._market = economy.Market()
        self._events = {}                  # owner tag -> recent messages for that person
        self._friends = {}                 # owner tag -> [usernames]
        self._goals = {}                   # owner tag -> index of their current goal
        self._goal_events = {}             # owner tag -> [(kind, detail, amount)] since last check
        self._goal_scanned = set()         # (owner, producer type) already checked against old builds
        self._feed = []                    # recent notable moments, newest last
        self._next_feed_id = 1
        self._likes = {}                   # plot key -> {owner tags who starred it}
        self._liked_by = {}                # owner tag -> {plot keys they starred}
        self._like_peaks = {}              # plot key -> highest star count already announced
        self._showcase_version = 1         # bumps whenever the top-plots list may change
        self._top_cache = None
        self._town_day = town_day or orders.default_town_day  # now -> 'YYYY-MM-DD'
        self._xp = {}                      # owner tag -> lifetime XP
        self._fx = {}                      # owner tag -> effects for that person's screen
        self._rng = random.Random()
        self._order_fills = {"day": "", "owners": set()}  # who filled today's order

        self._world_file = Path(world_file) if world_file else None
        if self._world_file:
            self._load()

    # ------------------------------------------------------------------ persistence
    def _load(self):
        if not self._world_file.exists():
            return
        try:
            data = json.loads(self._world_file.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            backup = self._world_file.with_suffix(f".corrupt-{int(time.time())}.json")
            print(f"WARNING: could not read {self._world_file} ({error}); moved to {backup}")
            self._world_file.replace(backup)
            return

        for raw in data.get("objects", []):
            owner = str(raw.get("owner", ""))[:12] if isinstance(raw, dict) else ""
            obj = self._clean_object(raw, owner, trusted=True)
            if obj and obj["id"] not in self._objects:
                self._objects[obj["id"]] = obj
                self._owner_counts[owner] = self._owner_counts.get(owner, 0) + 1
                if obj["type"] in economy.PRODUCERS:
                    self._producer_counts[owner] = self._producer_counts.get(owner, 0) + 1
        for raw in data.get("plots", []):
            plot = self._clean_plot(raw)
            if plot and plot["key"] not in self._plots:
                self._add_plot(plot)
        wallets = data.get("wallets") if isinstance(data.get("wallets"), dict) else {}
        for owner, raw in wallets.items():
            self._wallets[str(owner)[:12]] = economy.clean_wallet(raw)
        self._market.load(data.get("market"), time.time())
        saved_goals = data.get("goals") if isinstance(data.get("goals"), dict) else {}
        for owner, index in saved_goals.items():
            self._goals[str(owner)[:12]] = int(clamp_number(index, 0, len(goals.GOALS)))
        for raw in data.get("feed", [])[-FEED_SIZE:] if isinstance(data.get("feed"), list) else []:
            if isinstance(raw, dict) and isinstance(raw.get("text"), str):
                entry = {
                    "id": int(clamp_number(raw.get("id"), 0, 1e12)),
                    "text": raw["text"][:120],
                    "x": round(clamp_number(raw.get("x"), -WORLD_LIMIT, WORLD_LIMIT), 1),
                    "z": round(clamp_number(raw.get("z"), -WORLD_LIMIT, WORLD_LIMIT), 1),
                    "at": int(clamp_number(raw.get("at"), 0, 1e12)),
                }
                self._feed.append(entry)
                self._next_feed_id = max(self._next_feed_id, entry["id"] + 1)
        friends = data.get("friends") if isinstance(data.get("friends"), dict) else {}
        for owner, names in friends.items():
            if isinstance(names, list):
                cleaned = [str(n) for n in names if USERNAME_PATTERN.match(str(n))]
                if cleaned:
                    self._friends[str(owner)[:12]] = cleaned[:MAX_FRIENDS]
        likes = data.get("likes") if isinstance(data.get("likes"), dict) else {}
        for key, tags in likes.items():
            if key in self._plots and isinstance(tags, list):
                for tag in tags:
                    if TAG_PATTERN.match(str(tag)) and tag != self._plots[key]["owner"]:
                        self._add_like(key, str(tag))
        for key, stars in self._likes.items():
            self._plots[key]["likes"] = len(stars)
            self._like_peaks[key] = len(stars)
        saved_xp = data.get("xp") if isinstance(data.get("xp"), dict) else {}
        for owner, amount in saved_xp.items():
            self._xp[str(owner)[:12]] = int(clamp_number(amount, 0, 1e9))
        fills = data.get("orderFills") if isinstance(data.get("orderFills"), dict) else {}
        if isinstance(fills.get("day"), str) and isinstance(fills.get("owners"), list):
            self._order_fills = {"day": fills["day"][:10], "owners": {str(t)[:12] for t in fills["owners"]}}
        self._seq = int(clamp_number(data.get("seq"), 0, 1e15))
        print(f"Loaded {len(self._objects)} built objects and {len(self._plots)} plots from {self._world_file}")

    def save_if_dirty(self):
        if not self._world_file:
            return
        with self._lock:
            if not self._dirty:
                return
            payload = {
                "version": 1,
                "seq": self._seq,
                "savedAt": time.time(),
                "objects": list(self._objects.values()),
                "plots": list(self._plots.values()),
                "wallets": self._wallets,
                "market": self._market.dump(),
                "friends": self._friends,
                "goals": self._goals,
                "feed": self._feed,
                "likes": {key: sorted(tags) for key, tags in self._likes.items()},
                "xp": self._xp,
                "orderFills": {"day": self._order_fills["day"], "owners": sorted(self._order_fills["owners"])},
            }
            self._dirty = False
        try:
            self._world_file.parent.mkdir(parents=True, exist_ok=True)
            temp_file = self._world_file.with_suffix(".json.tmp")
            temp_file.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
            os.replace(temp_file, self._world_file)  # atomic: never leaves a half-written world
        except OSError as error:
            print(f"WARNING: autosave failed: {error}")
            with self._lock:
                self._dirty = True

    # ------------------------------------------------------------------ building
    def _clean_plot(self, raw):
        if not isinstance(raw, dict):
            return None
        coords = parse_plot_key(raw.get("key", ""))
        if coords is None:
            return None
        color = str(raw.get("color", ""))
        return {
            "key": f"{coords[0]},{coords[1]}",
            "owner": str(raw.get("owner", ""))[:12],
            "ownerName": str(raw.get("ownerName", "Someone"))[:16],
            "color": color if COLOR_PATTERN.match(color) else "#00a5cf",
            "claimedAt": int(clamp_number(raw.get("claimedAt"), 0, 1e12)),
            "builders": self._clean_builders(raw.get("builders")),
            "likes": 0,  # recounted from the saved stars after loading
        }

    @staticmethod
    def _clean_builders(raw):
        builders = []
        if not isinstance(raw, list):
            return builders
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            tag = str(entry.get("tag", ""))
            name = str(entry.get("name", ""))
            if TAG_PATTERN.match(tag) and USERNAME_PATTERN.match(name) and all(b["tag"] != tag for b in builders):
                builders.append({"tag": tag, "name": name})
        return builders[:MAX_BUILDERS_PER_PLOT]

    def _add_plot(self, plot):
        self._plots[plot["key"]] = plot
        self._plots_by_owner.setdefault(plot["owner"], set()).add(plot["key"])

    def _remove_plot(self, key):
        plot = self._plots.pop(key)
        owned = self._plots_by_owner.get(plot["owner"], set())
        owned.discard(key)
        if not owned:
            self._plots_by_owner.pop(plot["owner"], None)

    def _wallet(self, owner):
        wallet = self._wallets.get(owner)
        if wallet is None:
            wallet = self._wallets[owner] = economy.new_wallet()
            self._dirty = True
        return wallet

    def _event(self, owner, text):
        queue = self._events.setdefault(owner, [])
        queue.append(text)
        del queue[:-MAX_EVENTS_PER_SYNC]

    def _remove_object(self, object_id):
        obj = self._objects.pop(object_id)
        self._owner_counts[obj["owner"]] = max(0, self._owner_counts.get(obj["owner"], 1) - 1)
        if obj["type"] in economy.PRODUCERS:
            self._producer_counts[obj["owner"]] = max(0, self._producer_counts.get(obj["owner"], 1) - 1)
        if obj.get("paid"):
            wallet = self._wallet(obj["owner"])
            wallet["coins"] = min(economy.MAX_COINS, wallet["coins"] + obj["paid"])
        self._log({"op": "remove", "id": object_id})

    def _plot_owner_at(self, x, z):
        plot = self._plots.get(plot_key_for_cell(x, z))
        return plot["owner"] if plot else None

    def _can_build_at(self, owner, x, z):
        """The plot owner and the co-builders they invited may build on a plot."""
        plot = self._plots.get(plot_key_for_cell(x, z))
        if plot is None:
            return False
        return plot["owner"] == owner or any(b["tag"] == owner for b in plot["builders"])

    def _refresh_plot_labels(self, owner, name, color):
        """Keep plot signs in sync when an owner renames or recolours themselves."""
        for key in self._plots_by_owner.get(owner, ()):
            plot = self._plots[key]
            if plot["ownerName"] != name or plot["color"] != color:
                plot["ownerName"] = name
                plot["color"] = color
                self._log({"op": "plot", "plot": plot})
                if key in self._likes:
                    self._showcase_changed()

    def _clean_object(self, raw, owner, trusted=False):
        if not isinstance(raw, dict):
            return None
        object_type = raw.get("type")
        object_id = str(raw.get("id", ""))
        if object_type not in OBJECT_TYPES or not ID_PATTERN.match(object_id):
            return None
        # Reject (never silently move) anything outside the buildable area.
        x = round(clamp_number(raw.get("x"), -1e6, 1e6))
        z = round(clamp_number(raw.get("z"), -1e6, 1e6))
        distance = math.hypot(x, z)
        if distance > BUILD_RADIUS or distance < FOUNTAIN_CLEAR_RADIUS:
            return None
        y = round(clamp_number(raw.get("y"), -1e6, 1e6) * 20) / 20
        if y < 0 or y > MAX_BUILD_HEIGHT:
            return None
        rotation = int(clamp_number(raw.get("rot"), 0, 3))
        color = str(raw.get("color", ""))
        if not COLOR_PATTERN.match(color):
            color = "#d9cdb4"
        obj = {
            "id": object_id,
            "type": object_type,
            "x": x,
            "y": y,
            "z": z,
            "rot": rotation,
            "color": color,
            "owner": owner,
        }
        if trusted:
            paid = int(clamp_number(raw.get("paid"), 0, 1e6))
            if paid:
                obj["paid"] = paid
            economy.clean_producer_state(obj, raw, time.time())
        return obj

    def _take_build_token(self, owner, now):
        bucket = self._buckets.setdefault(owner, {"tokens": BUILD_BUCKET_CAPACITY, "at": now})
        bucket["tokens"] = min(BUILD_BUCKET_CAPACITY, bucket["tokens"] + (now - bucket["at"]) * BUILD_REFILL_PER_S)
        bucket["at"] = now
        if bucket["tokens"] < 1:
            return False
        bucket["tokens"] -= 1
        return True

    def _log(self, entry):
        self._seq += 1
        self._op_log.append({"seq": self._seq, **entry})
        if len(self._op_log) > OP_LOG_SIZE:
            del self._op_log[: len(self._op_log) - OP_LOG_SIZE]
        self._dirty = True

    def _apply_build_ops(self, ops, owner, player, now):
        rejected = []
        if not isinstance(ops, list):
            return rejected
        for op in ops[:MAX_BUILD_OPS_PER_SYNC]:
            if not isinstance(op, dict):
                continue
            kind = op.get("op")
            if kind == "place":
                raw = op.get("object")
                raw_id = str(raw.get("id", ""))[:48] if isinstance(raw, dict) else ""
                obj = self._clean_object(raw, owner)
                if obj is None:
                    rejected.append(raw_id)
                    continue
                if obj["id"] in self._objects:
                    continue  # re-sent after a lost response: already applied
                if is_public_cell(obj["x"], obj["z"]) or not self._can_build_at(owner, obj["x"], obj["z"]):
                    rejected.append(obj["id"])  # only on your own land or where you were invited
                    continue
                cost = economy.build_cost(obj["type"])
                wallet = self._wallet(owner)
                is_producer = obj["type"] in economy.PRODUCERS
                if wallet["coins"] < cost:
                    rejected.append(obj["id"])
                    self._event(owner, f"Not enough coins: that costs {cost}.")
                    continue
                if is_producer and self._producer_counts.get(owner, 0) >= economy.MAX_PRODUCERS_PER_OWNER:
                    rejected.append(obj["id"])
                    self._event(owner, f"You can run at most {economy.MAX_PRODUCERS_PER_OWNER} producers.")
                    continue
                if (
                    len(self._objects) >= MAX_OBJECTS
                    or self._owner_counts.get(owner, 0) >= MAX_OBJECTS_PER_OWNER
                    or not self._take_build_token(owner, now)
                ):
                    rejected.append(obj["id"])
                    continue
                wallet["coins"] -= cost
                if cost:
                    obj["paid"] = cost
                economy.init_producer(obj, now)
                if is_producer:
                    self._producer_counts[owner] = self._producer_counts.get(owner, 0) + 1
                self._objects[obj["id"]] = obj
                self._owner_counts[owner] = self._owner_counts.get(owner, 0) + 1
                self._log({"op": "add", "object": obj})
                if is_producer:
                    self._goal_event(owner, "place", obj["type"])
                    self._gain_xp(owner, progress.XP["producer"], player["name"], obj["x"], obj["z"], now)
                    self._feed_post(f"{player['name']} built {PRODUCER_LABELS[obj['type']]}", obj["x"], obj["z"], now)
            elif kind == "remove":
                object_id = str(op.get("id", ""))[:48]
                obj = self._objects.get(object_id)
                if obj is None:
                    continue
                land_owner = self._plot_owner_at(obj["x"], obj["z"])
                if obj["owner"] != owner and land_owner != owner:
                    rejected.append(object_id)
                    continue
                self._remove_object(object_id)
            elif kind == "claim":
                coords = parse_plot_key(op.get("plot", ""))
                key = f"{coords[0]},{coords[1]}" if coords else str(op.get("plot", ""))[:12]
                existing = self._plots.get(key)
                if existing and existing["owner"] == owner:
                    continue  # re-sent claim
                price = economy.plot_price(len(self._plots_by_owner.get(owner, ())))
                wallet = self._wallet(owner)
                if price is not None and wallet["coins"] < price:
                    rejected.append(f"plot:{key}")
                    self._event(owner, f"This plot costs {price} coins. Sell goods at the market to earn more.")
                    continue
                if (
                    coords is None
                    or existing is not None
                    or price is None
                    or not is_claimable_plot(*coords)
                    or not self._take_build_token(owner, now)
                ):
                    rejected.append(f"plot:{key}")
                    continue
                wallet["coins"] -= price
                if price:
                    self._event(owner, f"You bought this plot for {price} coins.")
                plot = {
                    "key": key,
                    "owner": owner,
                    "ownerName": player["name"],
                    "color": player["color"],
                    "claimedAt": int(now),
                    "builders": [],
                    "likes": 0,
                }
                self._add_plot(plot)
                self._log({"op": "plot", "plot": plot})
                self._feed_post(
                    f"🏠 {player['name']} claimed a plot",
                    coords[0] * PLOT_SIZE + PLOT_SIZE / 2,
                    coords[1] * PLOT_SIZE + PLOT_SIZE / 2,
                    now,
                )
                self._gain_xp(owner, progress.XP["claim"], player["name"], player["x"], player["z"], now)
            elif kind == "abandon":
                key = str(op.get("plot", ""))[:12]
                plot = self._plots.get(key)
                if plot is None:
                    continue
                if plot["owner"] != owner:
                    rejected.append(f"plot:{key}")
                    continue
                for object_id in [
                    oid for oid, o in self._objects.items() if plot_key_for_cell(o["x"], o["z"]) == key
                ]:
                    self._remove_object(object_id)
                self._remove_plot(key)
                self._clear_likes(key)
                self._log({"op": "unplot", "key": key})
            elif kind == "collect":
                self._collect(str(op.get("id", ""))[:48], owner, player, now)
            elif kind == "like":
                if self._take_build_token(owner, now):
                    self._toggle_like(str(op.get("plot", ""))[:12], owner, player, now)
            elif kind == "order":
                self._fill_order(owner, player, now)
            elif kind in ("sell", "buy"):
                self._trade(kind, op.get("item"), op.get("qty"), owner, player, now)
            elif kind in ("invite", "uninvite", "leave"):
                if self._take_build_token(owner, now):
                    self._change_builders(kind, str(op.get("plot", ""))[:12], op.get("name"), owner, player)
            elif kind in ("friend", "unfriend"):
                if self._take_build_token(owner, now):
                    self._change_friends(kind, op.get("name"), owner, player)
            elif kind in ("mute", "unmute"):
                self._change_mute(kind, op.get("name"), owner)
            elif kind == "report":
                self._report(op.get("name"), op.get("reason"), owner, player, now)
        return rejected

    # ------------------------------------------------------------------ safety
    def _find_person(self, raw_name, owner=None):
        """(owner tag, display name) of someone online or with an account, else (None, None)."""
        name = str(raw_name or "").strip().lstrip("@")[:16]
        if not name:
            return None, None
        for p in self._players.values():
            if p["name"].lower() == name.lower() and p["owner"] != owner:
                return p["owner"], p["name"]
        if self._accounts:
            tag, username = self._accounts.find_user(name)
            if tag:
                return tag, username
        return None, None

    def _change_mute(self, kind, raw_name, owner):
        name = str(raw_name or "").strip().lstrip("@")[:16]
        if kind == "unmute":
            muted = self._moderation.muted_by(owner)
            tag = next((t for t, n in muted.items() if n.lower() == name.lower()), None)
            display = muted.get(tag, name)
            if tag and self._moderation.unmute(owner, tag):
                self._event(owner, f"🔈 Unmuted {display}.")
            else:
                self._event(owner, f"{name or 'Nobody'} isn't muted.")
            return
        tag, display = self._find_person(name, owner)
        if tag is None:
            self._event(owner, f"Nobody called {name or '?'} is here.")
            return
        if tag == owner:
            self._event(owner, "You can't mute yourself.")
            return
        if self._moderation.mute(owner, tag, display):
            self._event(owner, f"🔇 Muted {display}: you won't see their chat. /unmute {display} to undo.")
        else:
            self._event(owner, "Your mute list is full.")

    def _report(self, raw_name, raw_reason, owner, player, now):
        tag, display = self._find_person(raw_name, owner)
        if tag is None:
            self._event(owner, f"Nobody called {str(raw_name or '?')[:16]} is here. Usage: /report name reason")
            return
        if tag == owner:
            self._event(owner, "You can't report yourself.")
            return
        if not self._moderation.can_report(owner, now):
            self._event(owner, "You've sent a lot of reports this hour. Moderators will get to them.")
            return
        reason = str(raw_reason or "").strip()[:200] or "(no reason given)"
        recent_chat = [m["text"] for m in self._chat if m.get("owner") == tag][-5:]
        self._moderation.add_report({
            "reporter": owner,
            "reporterName": player["name"],
            "target": tag,
            "targetName": display,
            "reason": reason,
            "chat": recent_chat,
            "x": round(player["x"], 1),
            "z": round(player["z"], 1),
        }, now)
        self._event(owner, f"🚩 Thanks, your report about {display} went to the moderators. /mute {display} hides them for you.")

    def health(self):
        """Small status for uptime checks and Docker's HEALTHCHECK (no private data)."""
        with self._lock:
            return {
                "ok": True,
                "version": VERSION,
                "players": len(self._players),
                "builds": len(self._objects),
                "plots": len(self._plots),
            }

    def admin(self, message, now=None):
        """Moderator actions from /api/admin (the token is checked by the HTTP handler)."""
        now = now or time.time()
        action = str(message.get("action", ""))
        with self._lock:
            if action == "overview":
                online = [
                    {"name": p["name"], "owner": p["owner"], "ip": self._last_ip.get(p["owner"], ""),
                     "x": round(p["x"], 1), "z": round(p["z"], 1),
                     "builds": self._owner_counts.get(p["owner"], 0)}
                    for p in self._players.values()
                ]
                return {
                    "online": online,
                    "reports": list(reversed(self._moderation.reports[-100:])),
                    "bans": self._moderation.active_bans(now),
                }
            if action == "ban":
                tag, display = self._admin_target(message)
                if tag is None:
                    return {"error": "no such player"}
                ip = self._last_ip.get(tag) if message.get("ip") else None
                hours = clamp_number(message.get("hours"), 0, 24 * 365, default=0)
                reason = str(message.get("reason", "")).strip()[:200] or "Breaking the town rules"
                self._moderation.ban(tag, display, reason, hours, now, ip=ip)
                for pid in [pid for pid, p in self._players.items() if p["owner"] == tag]:
                    del self._players[pid]
                return {"ok": True, "owner": tag, "name": display, "ipBanned": bool(ip)}
            if action == "unban":
                return {"ok": self._moderation.unban(str(message.get("owner", ""))[:12])}
            if action == "removeBuild":
                object_id = str(message.get("id", ""))[:48]
                if object_id not in self._objects:
                    return {"error": "no such build"}
                self._remove_object(object_id)
                self._dirty = True
                return {"ok": True}
            if action == "clearBuilds":
                tag, display = self._admin_target(message)
                if tag is None:
                    return {"error": "no such player"}
                ids = [object_id for object_id, obj in self._objects.items() if obj["owner"] == tag]
                for object_id in ids:
                    self._remove_object(object_id)
                self._dirty = True
                return {"ok": True, "removed": len(ids), "name": display}
            if action == "announce":
                text = str(message.get("text", "")).strip()[:140]
                if not text:
                    return {"error": "empty announcement"}
                self._chat.append({"id": self._next_chat_id, "from": "admin", "owner": "admin", "name": "📢 Town hall", "text": text})
                self._next_chat_id += 1
                self._chat = self._chat[-CHAT_HISTORY:]
                return {"ok": True}
            if action == "resolveReport":
                return {"ok": self._moderation.resolve_report(int(clamp_number(message.get("id"), 0, 1e9)))}
        return {"error": f"unknown action {action!r}"}

    def _admin_target(self, message):
        """An admin action's target: an owner tag ("owner") or a player/account name ("name")."""
        tag = str(message.get("owner", ""))[:12]
        if tag:
            name = next((p["name"] for p in self._players.values() if p["owner"] == tag), None)
            if name is None and self._accounts:
                name = self._accounts.username_for_tag(tag)
            if name is None:
                name = self._known_name(tag)  # offline guests: the name from reports or mutes
            known = name is not None or tag in self._owner_counts or tag in self._wallets
            hint = str(message.get("name") or "").strip()[:16]
            return (tag, name or hint or tag) if known or hint else (None, None)
        return self._find_person(message.get("name"))

    def _known_name(self, tag):
        """Last display name moderation saw for an owner tag (reports first, then mute lists)."""
        for report in reversed(self._moderation.reports):
            if report.get("target") == tag and report.get("targetName"):
                return report["targetName"]
        for muted in self._moderation.muted.values():
            if tag in muted:
                return muted[tag]
        return None

    # ------------------------------------------------------------------ goals & town feed
    # ------------------------------------------------------------------ XP, levels and screen effects
    def _push_fx(self, owner, effect):
        queue = self._fx.setdefault(owner, [])
        queue.append(effect)
        del queue[:-12]

    def _gain_xp(self, owner, amount, name, x, z, now):
        if amount <= 0 or not self.goals_enabled:  # same switch as goal rewards (exact-price tests)
            return
        before, _ = progress.level_for(self._xp.get(owner, 0))
        self._xp[owner] = self._xp.get(owner, 0) + int(amount)
        after, _ = progress.level_for(self._xp[owner])
        self._dirty = True
        self._push_fx(owner, {"kind": "xp", "amount": int(amount)})
        for level in range(before + 1, after + 1):
            reward = level * progress.COINS_PER_LEVEL
            wallet = self._wallet(owner)
            wallet["coins"] = min(economy.MAX_COINS, wallet["coins"] + reward)
            title = progress.title_for(level)
            self._event(owner, f"🎉 Level {level}: {title}!  +{reward} 💰")
            self._push_fx(owner, {"kind": "level", "level": level, "title": title, "coins": reward})
            if level >= progress.FEED_FROM_LEVEL:
                self._feed_post(f"🎉 {name} reached level {level}: {title}", x, z, now)

    def _level_of(self, owner):
        return progress.level_for(self._xp.get(owner, 0))[0]

    def _goal_event(self, owner, kind, detail, amount=1):
        queue = self._goal_events.setdefault(owner, [])
        queue.append((kind, detail, amount))
        del queue[:-20]

    def _feed_post(self, text, x, z, now):
        self._feed.append({
            "id": self._next_feed_id,
            "text": text[:120],
            "x": round(float(x), 1),
            "z": round(float(z), 1),
            "at": int(now),
        })
        self._next_feed_id += 1
        del self._feed[:-FEED_SIZE]
        self._dirty = True

    def _producer_types_of(self, owner):
        return {o["type"] for o in self._objects.values() if o["owner"] == owner and o["type"] in economy.PRODUCERS}

    def _update_goals(self, owner, player, now):
        index = self._goals.get(owner, 0)
        events = self._goal_events.pop(owner, [])
        if not self.goals_enabled or index >= len(goals.GOALS):
            return
        wallet = self._wallet(owner)
        producer_types = _OldBuilds(self, owner)
        state = {
            "plots": len(self._plots_by_owner.get(owner, ())),
            "coins": wallet["coins"],
            "friends": len(self._friends.get(owner, [])),
            "producer_types": producer_types,
        }
        new_index, completed = goals.advance(index, events, state)
        if not completed:
            return
        self._goals[owner] = new_index
        self._dirty = True
        for goal in completed:
            wallet["coins"] = min(economy.MAX_COINS, wallet["coins"] + goal["reward"])
            self._event(owner, f"🎯 Goal complete: {goal['text']}  +{goal['reward']} 💰")
            self._push_fx(owner, {"kind": "goal", "text": goal["text"], "coins": goal["reward"]})
            self._gain_xp(owner, progress.XP["goal"], player["name"], player["x"], player["z"], now)
            step = goals.GOALS.index(goal) + 1
            if step >= goals.FEED_FROM_STEP:
                self._feed_post(f"🎯 {player['name']} completed: {goal['text']}", player["x"], player["z"], now)

    # ------------------------------------------------------------------ social
    def _change_builders(self, kind, key, raw_name, owner, player):
        plot = self._plots.get(key)
        if plot is None:
            self._event(owner, "That plot no longer exists.")
            return
        builders = plot["builders"]
        if kind == "leave":
            if any(b["tag"] == owner for b in builders):
                plot["builders"] = [b for b in builders if b["tag"] != owner]
                self._log({"op": "plot", "plot": plot})
                self._event(owner, f"You left {plot['ownerName']}'s plot.")
            return
        if plot["owner"] != owner:
            self._event(owner, "Only the plot owner can change who builds here.")
            return
        name = str(raw_name or "").strip().lstrip("@")[:16]
        if kind == "uninvite":
            remaining = [b for b in builders if b["name"].lower() != name.lower()]
            if len(remaining) == len(builders):
                self._event(owner, f"{name} isn't a builder on this plot.")
                return
            plot["builders"] = remaining
            self._log({"op": "plot", "plot": plot})
            self._event(owner, f"{name} can no longer build on this plot.")
            return
        tag, username = self._accounts.find_user(name) if self._accounts else (None, None)
        if tag is None:
            self._event(owner, f"No account called {name}. Only players with an account can be invited.")
            return
        if tag == owner:
            self._event(owner, "You already own this plot.")
            return
        if any(b["tag"] == tag for b in builders):
            self._event(owner, f"{username} can already build here.")
            return
        if len(builders) >= MAX_BUILDERS_PER_PLOT:
            self._event(owner, f"A plot can have at most {MAX_BUILDERS_PER_PLOT} co-builders.")
            return
        builders.append({"tag": tag, "name": username})
        self._log({"op": "plot", "plot": plot})
        self._goal_event(owner, "social", "invite")
        self._event(owner, f"{username} can now build on this plot.")
        self._event(tag, f"🔨 {player['name']} invited you to build on their plot. Type /visit {player['name']}")

    def _change_friends(self, kind, raw_name, owner, player):
        name = str(raw_name or "").strip().lstrip("@")[:16]
        friends = self._friends.get(owner, [])
        if kind == "unfriend":
            remaining = [n for n in friends if n.lower() != name.lower()]
            if len(remaining) == len(friends):
                self._event(owner, f"{name} isn't on your friends list.")
                return
            if remaining:
                self._friends[owner] = remaining
            else:
                self._friends.pop(owner, None)
            self._dirty = True
            self._event(owner, f"Removed {name} from your friends.")
            return
        tag, username = self._accounts.find_user(name) if self._accounts else (None, None)
        if tag is None:
            self._event(owner, f"No account called {name}. Friends need an account.")
            return
        if tag == owner:
            self._event(owner, "That's you!")
            return
        if any(n.lower() == username.lower() for n in friends):
            self._event(owner, f"{username} is already your friend.")
            return
        if len(friends) >= MAX_FRIENDS:
            self._event(owner, f"You can have at most {MAX_FRIENDS} friends.")
            return
        self._friends[owner] = friends + [username]
        self._dirty = True
        self._goal_event(owner, "social", "friend")
        self._event(owner, f"👥 Added {username} to your friends.")
        self._event(tag, f"👥 {player['name']} added you as a friend.")

    def _friend_states(self, owner, online_owners):
        states = []
        for username in self._friends.get(owner, []):
            tag, canonical = self._accounts.find_user(username) if self._accounts else (None, None)
            if tag is None:
                continue  # account no longer exists
            plot_keys = sorted(self._plots_by_owner.get(tag, ()))
            states.append({
                "name": canonical,
                "online": tag in online_owners,
                "plot": plot_keys[0] if plot_keys else None,
            })
        return states

    def _collect(self, object_id, owner, player, now):
        obj = self._objects.get(object_id)
        if obj is None or obj["type"] not in economy.PRODUCERS:
            return
        if obj["owner"] != owner and self._plot_owner_at(obj["x"], obj["z"]) != owner:
            self._event(owner, "That isn't yours.")
            return
        if math.hypot(player["x"] - obj["x"], player["z"] - obj["z"]) > economy.COLLECT_REACH:
            self._event(owner, "Walk closer to collect.")
            return
        wallet = self._wallet(owner)
        result = economy.collect(obj, wallet, now)
        self._log({"op": "update", "object": obj})
        harvested = sum(result["took"].values())
        self._goal_event(owner, "collect", obj["type"], harvested)
        labels = economy.public_rules()["goods"]
        parts = [f"+{n} {labels[item]}" for item, n in result["took"].items()]
        for item, n in result["took"].items():
            bonus = 0
            if self._rng.random() < self.bumper_chance:
                room = economy.MAX_GOOD_STACK - wallet["goods"].get(item, 0)
                bonus = min(max(1, n // 2), room)
                if bonus > 0:
                    wallet["goods"][item] = wallet["goods"].get(item, 0) + bonus
                    parts.append(f"🍀 bumper crop +{bonus}")
            self._push_fx(owner, {
                "kind": "collect",
                "item": item,
                "n": n + bonus,
                "bumper": bonus > 0,
                "x": obj["x"],
                "z": obj["z"],
            })
        if harvested:
            self._gain_xp(owner, harvested * progress.XP["collect"], player["name"], obj["x"], obj["z"], now)
        parts += [f"loaded {n} {labels[item]}" for item, n in result["loaded"].items()]
        self._event(owner, ", ".join(parts) if parts else "Nothing ready yet.")

    def _trade(self, kind, item, qty, owner, player, now):
        if item not in economy.GOODS:
            return
        distance = math.hypot(player["x"] - economy.MARKET_X, player["z"] - economy.MARKET_Z)
        if distance > economy.MARKET_REACH:
            self._event(owner, "Go to the market stall on the plaza to trade.")
            return
        wallet = self._wallet(owner)
        label = economy.GOODS[item]["label"]
        before = wallet["goods"].get(item, 0)
        if kind == "sell":
            coins = self._market.sell(wallet, item, qty, now)
            changed = before - wallet["goods"].get(item, 0)
            self._event(owner, f"Sold {changed} {label} for {coins} coins." if changed else f"You have no {label} to sell.")
            self._goal_event(owner, "sell", item, changed)
            if changed:
                self._push_fx(owner, {"kind": "coins", "amount": coins})
                self._gain_xp(owner, changed * progress.XP["sell"], player["name"], player["x"], player["z"], now)
            if changed >= BIG_SALE:
                self._feed_post(
                    f"💰 {player['name']} sold {changed} {label.lower()} for {coins} coins",
                    economy.MARKET_X,
                    economy.MARKET_Z,
                    now,
                )
        else:
            coins = self._market.buy(wallet, item, qty, now)
            changed = wallet["goods"].get(item, 0) - before
            self._event(owner, f"Bought {changed} {label} for {coins} coins." if changed else "Not enough coins.")
        if self._town_life:
            self._town_life.on_trade(player, changed, now)
        self._dirty = True

    # ------------------------------------------------------------------ showcase (plot stars)
    def _add_like(self, key, tag):
        self._likes.setdefault(key, set()).add(tag)
        self._liked_by.setdefault(tag, set()).add(key)

    def _drop_like(self, key, tag):
        stars = self._likes.get(key, set())
        stars.discard(tag)
        if not stars:
            self._likes.pop(key, None)
        mine = self._liked_by.get(tag, set())
        mine.discard(key)
        if not mine:
            self._liked_by.pop(tag, None)

    def _clear_likes(self, key):
        for tag in list(self._likes.get(key, ())):
            self._drop_like(key, tag)
        self._like_peaks.pop(key, None)
        self._showcase_changed()

    def _showcase_changed(self):
        self._showcase_version += 1
        self._top_cache = None

    def _toggle_like(self, key, owner, player, now):
        plot = self._plots.get(key)
        if plot is None:
            return
        if plot["owner"] == owner or any(b["tag"] == owner for b in plot["builders"]):
            self._event(owner, "You can't star a plot you build on. Ask friends to visit!")
            return
        if self._accounts and not self._accounts.username_for_tag(owner):
            self._event(owner, "Create a free account to star plots.")
            return
        if key in self._liked_by.get(owner, ()):
            self._drop_like(key, owner)
            self._event(owner, f"Removed your star from {plot['ownerName']}'s plot.")
        else:
            if len(self._liked_by.get(owner, ())) >= MAX_LIKES_PER_OWNER:
                self._event(owner, f"You can star at most {MAX_LIKES_PER_OWNER} plots.")
                return
            self._add_like(key, owner)
            count = len(self._likes[key])
            self._event(owner, f"⭐ You starred {plot['ownerName']}'s plot.")
            self._event(plot["owner"], f"⭐ {player['name']} starred your plot ({count}).")
            if count in LIKE_MILESTONES and count > self._like_peaks.get(key, 0):
                coords = parse_plot_key(key)
                self._feed_post(
                    f"⭐ {plot['ownerName']}'s plot reached {count} stars",
                    coords[0] * PLOT_SIZE + PLOT_SIZE / 2,
                    coords[1] * PLOT_SIZE + PLOT_SIZE / 2,
                    now,
                )
            if count > self._like_peaks.get(key, 0):
                coords = parse_plot_key(key)
                self._push_fx(plot["owner"], {"kind": "star", "from": player["name"]})
                self._gain_xp(
                    plot["owner"],
                    progress.XP["star"],
                    plot["ownerName"],
                    coords[0] * PLOT_SIZE + PLOT_SIZE / 2,
                    coords[1] * PLOT_SIZE + PLOT_SIZE / 2,
                    now,
                )
            self._like_peaks[key] = max(self._like_peaks.get(key, 0), count)
        plot["likes"] = len(self._likes.get(key, ()))
        self._log({"op": "plot", "plot": plot})
        self._showcase_changed()

    def _top_plots(self):
        if self._top_cache is None:
            ranked = sorted(
                (key for key in self._likes if key in self._plots),
                key=lambda k: (-len(self._likes[k]), self._plots[k]["claimedAt"], k),
            )
            top = []
            for key in ranked[:TOP_PLOTS]:
                coords = parse_plot_key(key)
                top.append({
                    "key": key,
                    "name": self._plots[key]["ownerName"],
                    "likes": len(self._likes[key]),
                    "x": coords[0] * PLOT_SIZE + PLOT_SIZE / 2,
                    "z": coords[1] * PLOT_SIZE + PLOT_SIZE / 2,
                })
            self._top_cache = top
        return self._top_cache

    # ------------------------------------------------------------------ Rosa's daily order
    def _todays_order(self, now):
        day = self._town_day(now)
        if self._order_fills["day"] != day:
            self._order_fills = {"day": day, "owners": set()}
        return orders.order_for_day(day)

    def _fill_order(self, owner, player, now):
        distance = math.hypot(player["x"] - economy.MARKET_X, player["z"] - economy.MARKET_Z)
        if distance > economy.MARKET_REACH:
            self._event(owner, "Bring the order to Rosa's market stall on the plaza.")
            return
        order = self._todays_order(now)
        if owner in self._order_fills["owners"]:
            self._event(owner, "You already filled today's order. Rosa will want something new tomorrow.")
            return
        wallet = self._wallet(owner)
        have = wallet["goods"].get(order["item"], 0)
        if have < order["qty"]:
            self._event(owner, f"Rosa wants {order['qty']} {order['label']}. You have {have}.")
            return
        left = have - order["qty"]
        if left:
            wallet["goods"][order["item"]] = left
        else:
            del wallet["goods"][order["item"]]
        wallet["coins"] = min(economy.MAX_COINS, wallet["coins"] + order["pay"])
        self._order_fills["owners"].add(owner)
        self._dirty = True
        self._event(owner, f"📦 Order filled: {order['qty']} {order['label']} → +{order['pay']} 💰")
        self._goal_event(owner, "sell", order["item"], order["qty"])
        self._push_fx(owner, {"kind": "coins", "amount": order["pay"]})
        self._gain_xp(owner, progress.XP["order"], player["name"], player["x"], player["z"], now)
        self._feed_post(
            f"📦 {player['name']} filled Rosa's order: {order['qty']} {order['label'].lower()}",
            economy.MARKET_X,
            economy.MARKET_Z,
            now,
        )
        if self._town_life:
            self._town_life.on_trade(player, order["qty"], now)

    def _feed_since(self, raw_since):
        since = int(clamp_number(raw_since, 0, 1e12))
        if since == 0:
            return self._feed[-FEED_ON_JOIN:]
        return [entry for entry in self._feed if entry["id"] > since]

    def _world_update(self, since, client_epoch):
        needs_snapshot = (
            client_epoch != self._epoch
            or since < 0
            or since > self._seq
            or (self._op_log and since < self._op_log[0]["seq"] - 1)
            or (not self._op_log and since != self._seq)
        )
        update = {"worldSeq": self._seq, "worldEpoch": self._epoch}
        if needs_snapshot:
            update["worldSnapshot"] = list(self._objects.values())
            update["plotSnapshot"] = list(self._plots.values())
            update["rules"] = RULES
        elif self._op_log:
            start = since - self._op_log[0]["seq"] + 1  # log seqs are contiguous
            update["worldOps"] = self._op_log[max(0, start):]
        else:
            update["worldOps"] = []
        return update

    # ------------------------------------------------------------------ sync
    def sync(self, message, ip=None):
        if not isinstance(message, dict):
            raise ValueError("expected a JSON object")

        player_id = str(message.get("id", ""))[:48]
        if not player_id:
            raise ValueError("missing player id")

        now = time.time()
        name = str(message.get("name", "Guest")).strip()[:16] or "Guest"
        color = str(message.get("color", "#00a5cf"))
        if not COLOR_PATTERN.match(color):
            color = "#00a5cf"
        owner = owner_tag_for(str(message.get("ownerKey", ""))[:64], player_id)
        account_name = self._accounts.username_for_tag(owner) if self._accounts else None
        if account_name:
            name = account_name  # account holders always appear under their username
        elif self._accounts and self._accounts.is_registered_name(name):
            name = "Guest"       # nobody can pose as a registered player
        elif not self._filter.is_clean_name(name):
            name = "Guest"       # no swear words or slurs as guest names

        with self._lock:
            if ip:
                self._last_ip[owner] = ip
            ban = self._moderation.ban_for(owner, ip, now)
            if ban:
                self._players.pop(player_id, None)  # banned people vanish from the town
                return {
                    "banned": {"reason": ban.get("reason", ""), "until": ban.get("until", 0)},
                    "serverTime": now,
                }
            previous = self._players.get(player_id, {})
            player = {
                "id": player_id,
                "owner": owner,
                "name": name,
                "color": color,
                "x": clamp_number(message.get("x"), -WORLD_LIMIT, WORLD_LIMIT),
                "y": clamp_number(message.get("y"), -10, 50),
                "z": clamp_number(message.get("z"), -WORLD_LIMIT, WORLD_LIMIT),
                "ry": clamp_number(message.get("ry"), -100, 100),
                "moving": bool(message.get("moving", False)),
                "pose": "sit" if message.get("pose") == "sit" else "stand",
                "bubble": previous.get("bubble", ""),
                "bubbleAt": previous.get("bubbleAt", 0.0),
                "seen": now,
                "syncs": previous.get("syncs", 0) + 1,
            }

            chat_lines = message.get("chat", [])
            if isinstance(chat_lines, list):
                for raw_text in chat_lines[:5]:
                    text = self._filter.clean(str(raw_text).strip()[:140])
                    if not text:
                        continue
                    self._chat.append({
                        "id": self._next_chat_id,
                        "from": player_id,
                        "owner": owner,
                        "name": name,
                        "text": text,
                    })
                    self._next_chat_id += 1
                    player["bubble"] = text
                    player["bubbleAt"] = now
                    if self._town_life:
                        self._town_life.on_player_chat(player, text, now)
            self._chat = self._chat[-CHAT_HISTORY:]
            self._players[player_id] = player

            self._refresh_plot_labels(owner, name, color)
            rejected = self._apply_build_ops(message.get("build"), owner, player, now)
            self._update_goals(owner, player, now)

            for pid in [pid for pid, p in self._players.items() if now - p["seen"] > PLAYER_TIMEOUT_S]:
                del self._players[pid]
            for key in [k for k, b in self._buckets.items() if now - b["at"] > 120]:
                del self._buckets[key]

            chat_since = int(clamp_number(message.get("chatSince"), 0, 1e12))
            if chat_since == 0:
                new_chat = self._chat[-CHAT_ON_JOIN:]
            else:
                new_chat = [m for m in self._chat if m["id"] > chat_since]
            muted = self._moderation.muted_by(owner)
            new_chat = [
                {"id": m["id"], "from": m["from"], "name": m["name"], "text": m["text"]}
                for m in new_chat
                if m.get("owner") not in muted
            ]

            players = []
            for p in self._players.values():
                bubble_active = now - p["bubbleAt"] < BUBBLE_DURATION_S and p["owner"] not in muted
                players.append({
                    "id": p["id"],
                    "name": p["name"],
                    "color": p["color"],
                    "x": p["x"],
                    "y": p["y"],
                    "z": p["z"],
                    "ry": p["ry"],
                    "moving": p["moving"],
                    "pose": p.get("pose", "stand"),
                    "bubble": p["bubble"] if bubble_active else "",
                    "level": self._level_of(p["owner"]),
                })
            if self._town_life:
                self._town_life.update(now, self._players)
                players.extend(self._town_life.states(now, BUBBLE_DURATION_S))
            lite = bool(message.get("lite"))
            players_full = not lite or (player["syncs"] - 1) % FAR_EVERY == 0
            if not players_full:
                players = players_near(players, player["x"], player["z"])

            world_since = int(clamp_number(message.get("worldSince"), -1, 1e15, default=-1))
            order = self._todays_order(now)
            reply = {
                "players": players,
                "playersFull": players_full,
                "chat": new_chat,
                "you": {
                    "ownerTag": owner,
                    "account": account_name,
                    "name": name,
                    "wallet": self._wallet(owner),
                    "plotPrice": economy.plot_price(len(self._plots_by_owner.get(owner, ()))),
                    "friends": self._friend_states(owner, {p["owner"] for p in self._players.values()}),
                    "goal": goals.public_goal(self._goals.get(owner, 0)),
                    "liked": sorted(self._liked_by.get(owner, ())),
                    "level": progress.public_level(self._xp.get(owner, 0)),
                },
                "order": {
                    **order,
                    "filled": owner in self._order_fills["owners"],
                    "x": economy.MARKET_X,
                    "z": economy.MARKET_Z,
                },
                "feed": self._feed_since(message.get("feedSince")),
                "market": self._market.prices(now),
                "events": self._events.pop(owner, []),
                "fx": self._fx.pop(owner, []),
                "rejected": rejected,
                "serverTime": now,
                "townHour": round(self._town_clock(now) % 24, 4),
            }
            reply.update(self._world_update(world_since, str(message.get("worldEpoch", ""))))
            if int(clamp_number(message.get("topSince"), 0, 1e12)) != self._showcase_version:
                reply["top"] = {"version": self._showcase_version, "plots": self._top_plots()}
        return reply


def players_near(states, x, z, radius=NEAR_RADIUS_M):
    """The people within `radius` metres (on the ground plane) of (x, z)."""
    limit = radius * radius
    return [s for s in states if (s["x"] - x) ** 2 + (s["z"] - z) ** 2 <= limit]


class _OldBuilds:
    """`"oven" in _OldBuilds(world, owner)`: did this person build one before reaching that goal?
    Each (owner, producer type) is looked up once per server run; new builds arrive as events."""

    def __init__(self, world, owner):
        self._world = world
        self._owner = owner
        self._types = None

    def __contains__(self, producer_type):
        key = (self._owner, producer_type)
        if key in self._world._goal_scanned:
            return False
        self._world._goal_scanned.add(key)
        if self._types is None:
            self._types = self._world._producer_types_of(self._owner)
        return producer_type in self._types


ACCOUNTS = AccountStore()        # replaced in main() with one saved next to the world
WORLD = WorldState(accounts=ACCOUNTS)
TRUST_PROXY = False             # --behind-proxy: take client IPs from X-Forwarded-For
ADMIN_TOKEN = ""                # --admin-token / TOWNSQUARE_ADMIN_TOKEN; empty = admin page disabled
ADMIN_FAILS = {}                # ip -> [times of wrong tokens] (10 wrong tries per 10 minutes)
ADMIN_FAIL_LIMIT = 10
ADMIN_FAIL_WINDOW_S = 600


class TownsquareHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".glb": "model/gltf-binary",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def end_headers(self):
        # Always revalidate so code changes show up immediately while developing.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_error(413)
            return None
        try:
            return json.loads(self.rfile.read(length))
        except ValueError:
            self.send_error(400, "invalid JSON")
            return None

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _client_ip(self):
        if TRUST_PROXY:
            forwarded = self.headers.get("X-Forwarded-For", "")
            if forwarded:
                return forwarded.split(",")[0].strip()[:64]
        return self.client_address[0]

    def _handle_admin(self, message):
        if not ADMIN_TOKEN:
            self._send_json({"error": "Admin is off. Start the server with --admin-token or TOWNSQUARE_ADMIN_TOKEN."}, 403)
            return
        ip = self._client_ip()
        now = time.time()
        fails = [t for t in ADMIN_FAILS.get(ip, []) if now - t < ADMIN_FAIL_WINDOW_S]
        ADMIN_FAILS[ip] = fails
        if len(fails) >= ADMIN_FAIL_LIMIT:
            self._send_json({"error": "Too many wrong tokens. Try again in 10 minutes."}, 429)
            return
        if not isinstance(message, dict) or not token_matches(message.get("token"), ADMIN_TOKEN):
            fails.append(now)
            self._send_json({"error": "Wrong admin token."}, 403)
            return
        ADMIN_FAILS.pop(ip, None)
        reply = WORLD.admin(message, now)
        self._send_json(reply, 400 if "error" in reply else 200)

    def _handle_account(self, route, message):
        if not isinstance(message, dict):
            raise AccountError("expected a JSON object")
        ip = self._client_ip()
        if route == "/api/register":
            return ACCOUNTS.register(message.get("username"), message.get("password"), message.get("ownerKey"), ip)
        if route == "/api/login":
            return ACCOUNTS.login(message.get("username"), message.get("password"), ip)
        return ACCOUNTS.change_password(
            message.get("username"), message.get("password"), message.get("newPassword"), ip
        )

    def do_POST(self):
        route = urlsplit(self.path).path
        if route not in ("/api/sync", "/api/register", "/api/login", "/api/password", "/api/admin"):
            self.send_error(404)
            return
        message = self._read_json()
        if message is None:
            return

        if route == "/api/admin":
            self._handle_admin(message)
            return

        if route == "/api/sync":
            try:
                reply = WORLD.sync(message, ip=self._client_ip())
            except ValueError as error:
                self.send_error(400, str(error))
                return
            self._send_json(reply)
            return

        try:
            reply = self._handle_account(route, message)
        except AccountError as error:
            self._send_json({"error": error.message}, error.status)
            return
        self._send_json({"ok": True, **reply})

    def do_GET(self):
        if urlsplit(self.path).path == "/api/health":
            self._send_json(WORLD.health())
            return
        if urlsplit(self.path).path == "/api/town":
            body = json.dumps({"seed": TOWN_SEED, "houses": TOWN_HOUSES}, separators=(",", ":")).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, format, *args):
        if "/api/" in self.path:
            return  # keep the console quiet during the 10 Hz sync traffic
        super().log_message(format, *args)


class ExclusiveThreadingHTTPServer(ThreadingHTTPServer):
    """Refuse to share a port: on Windows SO_REUSEADDR lets two servers bind the
    same port and requests silently go to the wrong app."""

    allow_reuse_address = False
    daemon_threads = True
    # Behind an HTTPS proxy (HTTP/2) a browser's ~15 parallel script requests arrive as ~15
    # simultaneous connections; the default listen backlog of 5 makes Windows refuse the rest.
    request_queue_size = 128

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def lan_address():
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


def autosave_loop(world):
    while True:
        time.sleep(AUTOSAVE_INTERVAL_S)
        world.save_if_dirty()


def main():
    global WORLD, ACCOUNTS, TRUST_PROXY, ADMIN_TOKEN

    parser = argparse.ArgumentParser(description="Townsquare 3D server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--world", type=Path, default=DEFAULT_WORLD_FILE, help="where builds are saved")
    parser.add_argument("--no-townsfolk", action="store_true", help="start without the resident NPCs")
    parser.add_argument("--accounts", type=Path, default=None, help="account file (default: next to the world file)")
    parser.add_argument("--behind-proxy", action="store_true", help="trust X-Forwarded-For (HTTPS reverse proxy)")
    parser.add_argument(
        "--admin-token",
        default=os.environ.get("TOWNSQUARE_ADMIN_TOKEN", ""),
        help="password for /admin.html (moderation); also read from TOWNSQUARE_ADMIN_TOKEN; empty = admin off",
    )
    parser.add_argument(
        "--town-clock-offset",
        type=float,
        default=0.0,
        help="hours added to the server's local time for the town clock (e.g. -6 for players six hours behind)",
    )
    args = parser.parse_args()

    TRUST_PROXY = args.behind_proxy
    ADMIN_TOKEN = args.admin_token.strip()
    if ADMIN_TOKEN and len(ADMIN_TOKEN) < 12:
        raise SystemExit("--admin-token must be at least 12 characters (it guards bans and build removal).")
    ACCOUNTS = AccountStore(args.accounts or args.world.parent / ACCOUNTS_FILE_NAME)
    offset = args.town_clock_offset
    WORLD = WorldState(
        args.world,
        townsfolk=not args.no_townsfolk,
        accounts=ACCOUNTS,
        town_clock=lambda now: (default_local_hour(now) + offset) % 24,
        town_day=lambda now: orders.default_town_day(now + offset * 3600),
        moderation=Moderation(args.world.parent / "moderation.json"),
        word_filter=WordFilter(extra_file=args.world.parent / "blocked_words.txt"),
    )
    try:
        server = ExclusiveThreadingHTTPServer((HOST, args.port), TownsquareHandler)
    except OSError as error:
        raise SystemExit(f"Port {args.port} is busy ({error}). Try: python server.py --port 9000")

    threading.Thread(target=autosave_loop, args=(WORLD,), daemon=True).start()

    print(f"Townsquare 3D {VERSION} is running")
    print(f"  Desktop: http://localhost:{args.port}")
    lan_ip = lan_address()
    if lan_ip:
        print(f"  Phone (same Wi-Fi): http://{lan_ip}:{args.port}")
    print(f"  World saved to: {args.world}")
    if ADMIN_TOKEN:
        print(f"  Moderation: http://localhost:{args.port}/admin.html")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        WORLD.save_if_dirty()


if __name__ == "__main__":
    main()
