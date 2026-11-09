"""Cozy Island village server - standard-library Python only (3.9+), no installs.

Serves the game (../app/CozyIsland.html) and a small JSON API for the shared village:
  * each player claims one homestead (4 plots, matching the island)
  * the owner gets a 6-letter invite code; friends who join become plot-mates
  * plot-mates may plant / water / harvest; any villager may water and leave mailbox notes
  * live co-op: presence heartbeats + 1.5 s state polling show friends and their actions
  * async visits: everything is stored in village_data.json, growth runs on server time
  * presents (private inbox) and cat visits (your cat naps by a friend's mailbox for 10 minutes)

Run:   python village_server.py            (default port 8787, or set PORT / --port)
Then:  open http://localhost:8787 - friends use the LAN / tunnel / hosted address.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import socket
import sys
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

SERVER_DIR = Path(__file__).resolve().parent
GAME_FILE = SERVER_DIR.parent / "app" / "CozyIsland.html"
DATA_FILE = Path(os.environ.get("COZY_DATA", SERVER_DIR / "village_data.json"))

PLOT_COUNT = 4
BEDS_PER_PLOT = 4
MAX_NOTES_PER_PLOT = 20
NOTE_MAX_CHARS = 140
NAME_MAX_CHARS = 20
PRESENCE_TIMEOUT_S = 12
MAX_BODY_BYTES = 4096
INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I confusion
MAX_GIFTS_PER_PLAYER = 30
GIFT_NOTE_MAX_CHARS = 80
GIFT_KINDS = {"fish", "crops", "dishes"}
GIFT_ITEM_PATTERN = re.compile(r"[\w .'\-]{1,40}")
# Mochi visits: your cat naps at a friend's homestead for a while, then comes home with a souvenir.
CAT_VISIT_SECONDS = int(os.environ.get("COZY_CAT_VISIT_S", "600"))
MAX_CAT_PETS = 99
CAT_PETTERS_KEPT = 5

# Must match SEEDS in app/src/activities.js (minutes to bloom).
# Seasonal seeds are gated by season on the client; the server just needs their grow times.
SEED_MINUTES = {
    "daisy": 5,
    "tulip": 15,
    "tomato": 25,
    "sunflower": 50,
    "moonflower": 90,
    "strawberry": 20,
    "watermelon": 40,
    "pumpkin": 45,
    "snowdrop": 10,
}
WATER_FRACTION = 0.55  # one watering lasts 55 % of the full grow time (same as the client)


def now_ms() -> int:
    return int(time.time() * 1000)


def empty_bed() -> dict:
    return {"seedId": "", "grownMs": 0, "lastTick": 0, "waterEnds": 0, "by": ""}


def empty_plot() -> dict:
    return {"owner": "", "mates": [], "code": "", "beds": [empty_bed() for _ in range(BEDS_PER_PLOT)], "notes": []}


class Village:
    """All mutable state, guarded by one lock and persisted to JSON after every change."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.presence: dict[str, dict] = {}
        self.data = {"version": 1, "players": {}, "plots": [empty_plot() for _ in range(PLOT_COUNT)]}
        if path.exists():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if len(loaded.get("plots", [])) == PLOT_COUNT:
                    self.data = loaded
            except (OSError, ValueError) as error:
                print(f"! could not read {path} ({error}); starting a fresh village", file=sys.stderr)

    # ---------------------------------------------------------------- persistence
    def save(self) -> None:
        self.data["version"] += 1
        temp = self.path.with_suffix(".tmp")
        temp.write_text(json.dumps(self.data, indent=1), encoding="utf-8")
        os.replace(temp, self.path)

    # ---------------------------------------------------------------- helpers
    def player_name(self, player_id: str) -> str:
        return self.data["players"].get(player_id, {}).get("name", "Villager")

    def owned_plot(self, player_id: str) -> int:
        for index, plot in enumerate(self.data["plots"]):
            if plot["owner"] == player_id:
                return index
        return -1

    def is_member(self, plot: dict, player_id: str) -> bool:
        return plot["owner"] == player_id or player_id in plot["mates"]

    def new_code(self) -> str:
        used = {plot["code"] for plot in self.data["plots"]}
        while True:
            code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(6))
            if code not in used:
                return code

    # ---------------------------------------------------------------- public view
    def snapshot(self, player_id: str) -> dict:
        cutoff = time.time() - PRESENCE_TIMEOUT_S
        online = [
            {"id": pid, "name": self.player_name(pid), "activity": p["activity"], "x": p["x"], "y": p["y"], "z": p["z"]}
            for pid, p in self.presence.items()
            if p["seen"] >= cutoff and pid != player_id
        ]
        plots = []
        for plot in self.data["plots"]:
            member = self.is_member(plot, player_id)
            plots.append({
                "owner": plot["owner"],
                "ownerName": self.player_name(plot["owner"]) if plot["owner"] else "",
                "mates": [{"id": mate, "name": self.player_name(mate)} for mate in plot["mates"]],
                "member": member,
                "code": plot["code"] if plot["owner"] == player_id else "",
                "beds": plot["beds"],
                # notes are private to the homestead's owner and plot-mates
                "notes": plot["notes"] if member else [],
                "noteCount": len(plot["notes"]),
                # a visiting cat sits by the mailbox where everyone can see (and pet) her
                "catVisit": plot.get("catVisit"),
            })
        return {
            "ok": True, "you": player_id, "name": self.player_name(player_id),
            "serverNow": now_ms(), "version": self.data["version"],
            "plots": plots, "online": online, "shareUrls": SHARE_URLS,
            # wrapped presents waiting in *your* mailbox (nobody else can see them)
            "gifts": self.data.get("gifts", {}).get(player_id, []),
        }

    # ---------------------------------------------------------------- actions
    def hello(self, player_id: str, name: str) -> None:
        players = self.data["players"]
        if players.get(player_id, {}).get("name") != name:
            players[player_id] = {"name": name, "since": now_ms()}
            self.save()

    def claim(self, player_id: str, index: int) -> str | None:
        plot = self.data["plots"][index]
        if self.owned_plot(player_id) >= 0:
            return "You already have a homestead."
        if plot["owner"]:
            return "Someone already lives here."
        plot.update(empty_plot())
        plot["owner"] = player_id
        plot["code"] = self.new_code()
        self.save()
        return None

    def new_invite(self, player_id: str) -> str | None:
        index = self.owned_plot(player_id)
        if index < 0:
            return "Claim a homestead first."
        self.data["plots"][index]["code"] = self.new_code()
        self.save()
        return None

    def join(self, player_id: str, code: str) -> str | None:
        code = code.strip().upper()
        for plot in self.data["plots"]:
            if plot["owner"] and plot["code"] == code:
                if self.is_member(plot, player_id):
                    return "You're already part of that homestead."
                plot["mates"].append(player_id)
                self.save()
                return None
        return "That invite code doesn't match any homestead."

    def leave(self, player_id: str, index: int) -> str | None:
        plot = self.data["plots"][index]
        if player_id in plot["mates"]:
            plot["mates"].remove(player_id)
        elif plot["owner"] == player_id:
            plot.update(empty_plot())  # owner moving out frees the plot
        else:
            return "You don't live here."
        self.save()
        return None

    def bed_action(self, player_id: str, index: int, bed_index: int, action: str, seed_id: str) -> str | None:
        plot = self.data["plots"][index]
        if not plot["owner"]:
            return "Nobody lives here yet."
        bed = plot["beds"][bed_index]
        member = self.is_member(plot, player_id)
        now = now_ms()
        total = SEED_MINUTES.get(bed["seedId"], 0) * 60000
        grown = bed["grownMs"] + max(0, min(now, bed["waterEnds"]) - bed["lastTick"]) if total else 0

        if action == "plant":
            if not member:
                return "Only the family of this homestead can plant here."
            if bed["seedId"]:
                return "Something is already growing."
            if seed_id not in SEED_MINUTES:
                return "Unknown seed."
            bed.update({"seedId": seed_id, "grownMs": 0, "lastTick": now, "waterEnds": 0, "by": player_id})
        elif action == "water":
            if not total:
                return "Nothing to water."
            if now < bed["waterEnds"] or grown >= total:
                return "It doesn't need water right now."
            bed.update({"grownMs": grown, "lastTick": now, "waterEnds": now + int(total * WATER_FRACTION),
                        "wateredBy": self.player_name(player_id)})
        elif action == "harvest":
            if not member:
                return "Only the family of this homestead can harvest."
            if not total or grown < total:
                return "Not ready yet."
            bed.update(empty_bed())
        else:
            return "Unknown action."
        self.save()
        return None

    def add_note(self, player_id: str, index: int, text: str) -> str | None:
        plot = self.data["plots"][index]
        if not plot["owner"]:
            return "Nobody lives here yet."
        text = re.sub(r"\s+", " ", text).strip()[:NOTE_MAX_CHARS]
        if not text:
            return "Write something first."
        plot["notes"].append({"from": player_id, "name": self.player_name(player_id), "text": text, "at": now_ms()})
        del plot["notes"][:-MAX_NOTES_PER_PLOT]
        self.save()
        return None

    def heartbeat(self, player_id: str, activity: str, x: float, y: float, z: float) -> None:
        self.presence[player_id] = {"activity": activity[:16], "x": x, "y": y, "z": z, "seen": time.time()}

    def send_gift(self, player_id: str, index: int, kind: str, item: str, note: str) -> str | None:
        """Wraps an item for the owner of homestead `index`. The sender's game removes it from their pantry."""
        owner = self.data["plots"][index]["owner"]
        if not owner:
            return "Nobody lives here yet."
        if owner == player_id:
            return "That's your own mailbox - send presents to friends."
        if kind not in GIFT_KINDS or not GIFT_ITEM_PATTERN.fullmatch(item):
            return "That present can't be wrapped."
        inbox = self.data.setdefault("gifts", {}).setdefault(owner, [])
        if len(inbox) >= MAX_GIFTS_PER_PLAYER:
            return "Their mailbox is already full of presents."
        note = re.sub(r"\s+", " ", note).strip()[:GIFT_NOTE_MAX_CHARS]
        inbox.append({
            "id": secrets.token_hex(6), "from": player_id, "fromName": self.player_name(player_id),
            "kind": kind, "item": item, "note": note, "at": now_ms(),
        })
        self.save()
        return None

    def open_gift(self, player_id: str, gift_id: str) -> tuple[str | None, dict | None]:
        inbox = self.data.get("gifts", {}).get(player_id, [])
        for gift in inbox:
            if gift["id"] == gift_id:
                inbox.remove(gift)
                self.save()
                return None, gift
        return "That present was already opened.", None


    def active_cat_visit(self, plot: dict) -> dict | None:
        visit = plot.get("catVisit")
        return visit if visit and visit["until"] > now_ms() else None

    def send_cat(self, player_id: str, index: int, cat_name: str) -> str | None:
        """Sends the player's cat to nap at homestead `index` for CAT_VISIT_SECONDS."""
        plot = self.data["plots"][index]
        if not plot["owner"]:
            return "Nobody lives here yet."
        if plot["owner"] == player_id:
            return "That's your own homestead - she already lives here."
        for other in self.data["plots"]:
            visit = self.active_cat_visit(other)
            if visit and visit["from"] == player_id:
                return f"{visit['cat']} is already out visiting."
        visit = self.active_cat_visit(plot)
        if visit:
            return f"{visit['fromName']}'s cat is already napping there."
        now = now_ms()
        plot["catVisit"] = {
            "from": player_id, "fromName": self.player_name(player_id), "cat": cat_name,
            "at": now, "until": now + CAT_VISIT_SECONDS * 1000, "pets": 0, "petBy": [], "lastPetBy": "",
        }
        self.save()
        return None

    def pet_cat(self, player_id: str, index: int) -> str | None:
        visit = self.active_cat_visit(self.data["plots"][index])
        if not visit:
            return "No cat is visiting here right now."
        name = self.player_name(player_id)
        visit["pets"] = min(MAX_CAT_PETS, visit["pets"] + 1)
        visit["lastPetBy"] = name
        if name not in visit["petBy"]:
            visit["petBy"] = (visit["petBy"] + [name])[-CAT_PETTERS_KEPT:]
        self.save()
        return None


VILLAGE: Village  # created in main()
SHARE_URLS: list[str] = []  # addresses friends can use, filled in main()


def clean_name(value) -> str:
    name = re.sub(r"[^\w .'\-]", "", str(value or ""), flags=re.UNICODE).strip()[:NAME_MAX_CHARS]
    return name or "Villager"


def player_id_from_secret(secret: str) -> str:
    """Clients keep a random secret; the public id is derived from it, so ids can't be spoofed."""
    return hashlib.sha256(("cozy-island:" + secret).encode()).hexdigest()[:16]


class Handler(BaseHTTPRequestHandler):
    server_version = "CozyVillage/1.0"

    # quieter console: only log errors
    def log_message(self, fmt, *args):
        if args and str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
            super().log_message(fmt, *args)

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Cozy-Secret")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html", "/CozyIsland.html"):
            if not GAME_FILE.exists():
                self.send_error(HTTPStatus.NOT_FOUND, "Build the game first: python app/build.py")
                return
            body = GAME_FILE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path == "/api/ping":
            self.send_json({"ok": True, "game": "cozy-island", "serverNow": now_ms()})
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            self.send_json({"ok": False, "error": "Request too large."}, 413)
            return
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self.send_json({"ok": False, "error": "Bad JSON."}, 400)
            return
        secret = self.headers.get("X-Cozy-Secret", "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", secret):
            self.send_json({"ok": False, "error": "Missing player secret."}, 401)
            return
        player_id = player_id_from_secret(secret)

        def plot_index(key="plot") -> int:
            index = int(body.get(key, -1))
            if not 0 <= index < PLOT_COUNT:
                raise ValueError("bad plot")
            return index

        action = path[len("/api/"):]
        try:
            with VILLAGE.lock:
                error = None
                if action == "hello":
                    VILLAGE.hello(player_id, clean_name(body.get("name")))
                elif action == "state":
                    pass
                elif action == "presence":
                    VILLAGE.heartbeat(player_id, str(body.get("activity", "")), float(body.get("x", 0)),
                                      float(body.get("y", 0)), float(body.get("z", 0)))
                elif action == "claim":
                    error = VILLAGE.claim(player_id, plot_index())
                elif action == "invite":
                    error = VILLAGE.new_invite(player_id)
                elif action == "join":
                    error = VILLAGE.join(player_id, str(body.get("code", "")))
                elif action == "leave":
                    error = VILLAGE.leave(player_id, plot_index())
                elif action == "bed":
                    bed_index = int(body.get("bed", -1))
                    if not 0 <= bed_index < BEDS_PER_PLOT:
                        raise ValueError("bad bed")
                    error = VILLAGE.bed_action(player_id, plot_index(), bed_index,
                                               str(body.get("action", "")), str(body.get("seed", "")))
                elif action == "note":
                    error = VILLAGE.add_note(player_id, plot_index(), str(body.get("text", "")))
                elif action == "gift":
                    error = VILLAGE.send_gift(player_id, plot_index(), str(body.get("kind", "")),
                                              str(body.get("item", "")), str(body.get("note", "")))
                elif action == "opengift":
                    error, opened = VILLAGE.open_gift(player_id, str(body.get("id", "")))
                elif action == "sendcat":
                    error = VILLAGE.send_cat(player_id, plot_index(), clean_name(body.get("cat")) or "Mochi")
                elif action == "petcat":
                    error = VILLAGE.pet_cat(player_id, plot_index())
                else:
                    self.send_json({"ok": False, "error": "Unknown endpoint."}, 404)
                    return
                if player_id not in VILLAGE.data["players"]:
                    VILLAGE.hello(player_id, clean_name(body.get("name")))
                snapshot = VILLAGE.snapshot(player_id)
                if action == "opengift" and not error:
                    snapshot["opened"] = opened
        except (ValueError, TypeError) as problem:
            self.send_json({"ok": False, "error": f"Bad request ({problem})."}, 400)
            return
        if error:
            snapshot["ok"] = False
            snapshot["error"] = error
        self.send_json(snapshot)


def lan_addresses() -> list[str]:
    addresses = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))  # no packets sent; just picks the outgoing interface
            addresses.add(probe.getsockname()[0])
    except OSError:
        pass
    return sorted(addresses)


def main() -> None:
    global VILLAGE
    parser = argparse.ArgumentParser(description="Cozy Island village server")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8787)))
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    args = parser.parse_args()

    VILLAGE = Village(DATA_FILE)
    public_url = os.environ.get("PUBLIC_URL", "").rstrip("/")
    if public_url:
        SHARE_URLS.append(public_url)
    SHARE_URLS.extend(f"http://{address}:{args.port}" for address in lan_addresses())
    ThreadingHTTPServer.allow_reuse_address = False  # on Windows, reuse would silently share a busy port
    try:
        httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError:
        print(f"Port {args.port} is already in use by another program.")
        print(f"Start with a different port, e.g.:  python village_server.py --port {args.port + 1}")
        sys.exit(1)
    print("Cozy Island village server is running")
    print(f"  You:              http://localhost:{args.port}")
    for address in lan_addresses():
        print(f"  Friends on Wi-Fi: http://{address}:{args.port}")
    print("  Friends anywhere: see README section 6 (tunnel or free hosting)")
    print(f"  Village saved in: {DATA_FILE}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nGood night!")


if __name__ == "__main__":
    main()
