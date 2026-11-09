"""Solo mode: the real Townsquare server logic, run inside the browser by Pyodide.

Static hosts (GitHub Pages, Cloudflare Pages) have no backend, so web/solo.js loads this module
in Pyodide and answers the game's /api/* requests in the page itself. The game rules, economy,
townsfolk, goals and safety code are exactly the server's; only the HTTP layer is replaced.
Saves live in /data, which solo.js keeps in the browser's IndexedDB.
"""

import json
import os
import time
from pathlib import Path

import server
from accounts import AccountError, AccountStore
from moderation import Moderation, WordFilter

DATA_DIR = Path(os.environ.get("TOWNSQUARE_SOLO_DATA", "/data"))  # /data is IndexedDB-backed in the browser
SOLO_PBKDF2_ITERATIONS = 20_000  # accounts never leave this browser; keeps sign-up quick in WebAssembly
SOLO_IP = "solo"

DATA_DIR.mkdir(parents=True, exist_ok=True)
ACCOUNTS = AccountStore(DATA_DIR / server.ACCOUNTS_FILE_NAME, iterations=SOLO_PBKDF2_ITERATIONS)
WORLD = server.WorldState(
    DATA_DIR / "world.json",
    accounts=ACCOUNTS,
    moderation=Moderation(DATA_DIR / "moderation.json"),
    word_filter=WordFilter(),
)
server.WORLD = WORLD
server.ACCOUNTS = ACCOUNTS


def _reply(status, payload):
    return json.dumps([status, json.dumps(payload, separators=(",", ":"))])


def handle(method, route, body):
    """Answer one API call. Returns JSON text: [status, response body text]."""
    if method == "GET":
        if route == "/api/town":
            return _reply(200, {"seed": server.TOWN_SEED, "houses": server.TOWN_HOUSES})
        if route == "/api/health":
            return _reply(200, {**WORLD.health(), "mode": "solo"})
        return _reply(404, {"error": "not found"})

    try:
        message = json.loads(body or "null")
    except ValueError:
        return _reply(400, {"error": "invalid JSON"})

    if route == "/api/sync":
        try:
            return _reply(200, WORLD.sync(message, ip=SOLO_IP))
        except ValueError as error:
            return _reply(400, {"error": str(error)})

    if route in ("/api/register", "/api/login", "/api/password"):
        if not isinstance(message, dict):
            return _reply(400, {"error": "expected a JSON object"})
        try:
            if route == "/api/register":
                reply = ACCOUNTS.register(
                    message.get("username"), message.get("password"), message.get("ownerKey"), SOLO_IP
                )
            elif route == "/api/login":
                reply = ACCOUNTS.login(message.get("username"), message.get("password"), SOLO_IP)
            else:
                reply = ACCOUNTS.change_password(
                    message.get("username"), message.get("password"), message.get("newPassword"), SOLO_IP
                )
        except AccountError as error:
            return _reply(error.status, {"error": error.message})
        return _reply(200, {"ok": True, **reply})

    if route == "/api/admin":
        return _reply(403, {"error": "Moderation needs the multiplayer server."})
    return _reply(404, {"error": "not found"})


def save():
    """Write the world to /data if anything changed. Returns True when a file was written."""
    before = WORLD._dirty
    WORLD.save_if_dirty()
    return bool(before)


def is_dirty():
    """True when the world has unsaved changes (cheap; called after every sync)."""
    return bool(WORLD._dirty or getattr(ACCOUNTS, "_dirty", False))


def now():
    return time.time()
