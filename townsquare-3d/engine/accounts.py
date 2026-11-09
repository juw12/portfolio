"""Townsquare 3D - player accounts.

An account links a username + password to an *owner key*: the private key the
browser already uses to own plots, builds, coins and goods. Logging in on
another device returns that key, so everything follows the account.

* Passwords are hashed with PBKDF2-HMAC-SHA256 and a random 16-byte salt.
* Usernames are unique, case-insensitive, 3-16 characters [A-Za-z0-9_].
* A guest can upgrade at any time: registering links the key they already
  play with, so nothing is lost.
* Failed logins are rate limited per IP address and per username.

Stored in data/accounts.json (written atomically). The owner key is a bearer
secret (like a session token): keep the data folder private and backed up.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from pathlib import Path

from moderation import WordFilter

NAME_FILTER = WordFilter()  # usernames with swear words or slurs are refused

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,16}$")
MIN_PASSWORD_LENGTH = 6
MAX_PASSWORD_LENGTH = 128
MAX_OWNER_KEY_LENGTH = 64
PBKDF2_ITERATIONS = 200_000
SALT_BYTES = 16

FAILURE_WINDOW_S = 600.0     # failed attempts are remembered for 10 minutes
MAX_FAILURES_PER_IP = 20
MAX_FAILURES_PER_NAME = 8
MAX_REGISTRATIONS_PER_IP = 10  # per FAILURE_WINDOW_S, stops scripted name squatting


class AccountError(Exception):
    """A user-facing account problem. `status` is the HTTP status to send."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def owner_tag(owner_key):
    """Same public owner id the world server derives (see server.owner_tag_for)."""
    return hashlib.sha256(owner_key.encode("utf-8")).hexdigest()[:12]


def hash_password(password, salt, iterations):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def validate_username(username):
    username = str(username or "").strip()
    if not USERNAME_PATTERN.match(username):
        raise AccountError("Usernames are 3-16 letters, numbers or _")
    return username


def validate_password(password):
    password = str(password or "")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AccountError(f"Passwords need at least {MIN_PASSWORD_LENGTH} characters")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise AccountError("That password is too long")
    return password


class AccountStore:
    def __init__(self, path=None, iterations=PBKDF2_ITERATIONS):
        self._lock = threading.Lock()
        self._path = Path(path) if path else None
        self._iterations = iterations
        self._accounts = {}        # lower-case username -> record
        self._by_tag = {}          # owner tag -> lower-case username
        self._failures = {}        # "ip:..." / "name:..." -> [timestamps]
        self._registrations = {}   # ip -> [timestamps]
        # Used to spend the same time on unknown usernames as on real ones.
        self._dummy_salt = secrets.token_bytes(SALT_BYTES)
        if self._path:
            self._load()

    # ------------------------------------------------------------------ persistence
    def _load(self):
        if not self._path.exists():
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            backup = self._path.with_suffix(f".corrupt-{int(time.time())}.json")
            print(f"WARNING: could not read {self._path} ({error}); moved to {backup}")
            self._path.replace(backup)
            return
        for raw in (data.get("accounts") or {}).values():
            try:
                record = {
                    "username": validate_username(raw["username"]),
                    "salt": str(raw["salt"]),
                    "hash": str(raw["hash"]),
                    "iterations": int(raw["iterations"]),
                    "ownerKey": str(raw["ownerKey"])[:MAX_OWNER_KEY_LENGTH],
                    "createdAt": float(raw.get("createdAt", 0)),
                }
                bytes.fromhex(record["salt"])
                bytes.fromhex(record["hash"])
            except (AccountError, KeyError, TypeError, ValueError):
                continue
            if not record["ownerKey"]:
                continue
            key = record["username"].lower()
            self._accounts[key] = record
            self._by_tag[owner_tag(record["ownerKey"])] = key
        print(f"Loaded {len(self._accounts)} accounts from {self._path}")

    def _save(self):
        if not self._path:
            return
        payload = {"version": 1, "accounts": self._accounts}
        self._path.parent.mkdir(parents=True, exist_ok=True)
        temp_file = self._path.with_suffix(".json.tmp")
        temp_file.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        os.replace(temp_file, self._path)

    # ------------------------------------------------------------------ rate limits
    def _recent(self, bucket, key, now):
        stamps = [t for t in bucket.get(key, []) if now - t < FAILURE_WINDOW_S]
        if stamps:
            bucket[key] = stamps
        else:
            bucket.pop(key, None)
        return stamps

    def _check_login_allowed(self, ip, name_key, now):
        if len(self._recent(self._failures, f"ip:{ip}", now)) >= MAX_FAILURES_PER_IP:
            raise AccountError("Too many attempts. Try again in a few minutes.", 429)
        if len(self._recent(self._failures, f"name:{name_key}", now)) >= MAX_FAILURES_PER_NAME:
            raise AccountError("Too many attempts for this account. Try again in a few minutes.", 429)

    def _record_failure(self, ip, name_key, now):
        self._failures.setdefault(f"ip:{ip}", []).append(now)
        self._failures.setdefault(f"name:{name_key}", []).append(now)

    # ------------------------------------------------------------------ queries
    def username_for_tag(self, tag):
        with self._lock:
            key = self._by_tag.get(tag)
            return self._accounts[key]["username"] if key else None

    def find_user(self, name):
        """(owner tag, canonical username) for a registered name, else (None, None)."""
        with self._lock:
            record = self._accounts.get(str(name or "").strip().lower())
            if not record:
                return None, None
            return owner_tag(record["ownerKey"]), record["username"]

    def is_registered_name(self, name):
        with self._lock:
            return str(name).strip().lower() in self._accounts

    def count(self):
        with self._lock:
            return len(self._accounts)

    # ------------------------------------------------------------------ actions
    def register(self, username, password, owner_key="", ip="?", now=None):
        """Create an account. `owner_key` is the guest key to keep (or empty for a new one)."""
        now = time.time() if now is None else now
        username = validate_username(username)
        if not NAME_FILTER.is_clean_name(username):
            raise AccountError("Please choose a different username.")
        password = validate_password(password)
        owner_key = str(owner_key or "")[:MAX_OWNER_KEY_LENGTH]
        if len(owner_key) < 8:
            owner_key = secrets.token_urlsafe(24)
        name_key = username.lower()

        with self._lock:
            if len(self._recent(self._registrations, ip, now)) >= MAX_REGISTRATIONS_PER_IP:
                raise AccountError("Too many new accounts from this network. Try again later.", 429)
            if name_key in self._accounts:
                raise AccountError("That username is taken", 409)
            linked = self._by_tag.get(owner_tag(owner_key))
            if linked:
                raise AccountError(
                    f"This device's progress already belongs to {self._accounts[linked]['username']}. Log in instead.",
                    409,
                )

        salt = secrets.token_bytes(SALT_BYTES)
        digest = hash_password(password, salt, self._iterations)  # slow: done outside the lock

        with self._lock:
            if name_key in self._accounts:  # lost a race with an identical request
                raise AccountError("That username is taken", 409)
            record = {
                "username": username,
                "salt": salt.hex(),
                "hash": digest.hex(),
                "iterations": self._iterations,
                "ownerKey": owner_key,
                "createdAt": now,
            }
            self._accounts[name_key] = record
            self._by_tag[owner_tag(owner_key)] = name_key
            self._registrations.setdefault(ip, []).append(now)
            try:
                self._save()
            except OSError as error:
                del self._accounts[name_key]
                del self._by_tag[owner_tag(owner_key)]
                raise AccountError(f"Could not save the account ({error})", 500)
        return {"username": username, "ownerKey": owner_key}

    def _verify(self, username, password, ip, now):
        """Return the account record for a correct username/password, else raise."""
        try:
            username = validate_username(username)
        except AccountError:
            raise AccountError("Wrong username or password", 401)
        password = str(password or "")[:MAX_PASSWORD_LENGTH]
        name_key = username.lower()

        with self._lock:
            self._check_login_allowed(ip, name_key, now)
            record = self._accounts.get(name_key)
            if record:
                salt = bytes.fromhex(record["salt"])
                expected = bytes.fromhex(record["hash"])
                iterations = record["iterations"]
            else:
                salt, expected, iterations = self._dummy_salt, b"", self._iterations

        digest = hash_password(password, salt, iterations)
        if record and hmac.compare_digest(digest, expected):
            return record
        with self._lock:
            self._record_failure(ip, name_key, now)
        raise AccountError("Wrong username or password", 401)

    def login(self, username, password, ip="?", now=None):
        now = time.time() if now is None else now
        record = self._verify(username, password, ip, now)
        return {"username": record["username"], "ownerKey": record["ownerKey"]}

    def change_password(self, username, old_password, new_password, ip="?", now=None):
        now = time.time() if now is None else now
        new_password = validate_password(new_password)
        record = self._verify(username, old_password, ip, now)
        salt = secrets.token_bytes(SALT_BYTES)
        digest = hash_password(new_password, salt, self._iterations)
        with self._lock:
            previous = dict(record)
            record.update({"salt": salt.hex(), "hash": digest.hex(), "iterations": self._iterations})
            try:
                self._save()
            except OSError as error:
                record.update(previous)
                raise AccountError(f"Could not save the new password ({error})", 500)
        return {"username": record["username"]}
