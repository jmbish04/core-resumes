#!/usr/bin/env python3
"""
Sync NotebookLM cookies from Chrome Profile 6 to Worker KV.

This script reads Chrome's encrypted cookie database directly on macOS, decrypts
the Google session cookies with the Keychain-backed Chrome Safe Storage secret,
writes a NotebookLM-compatible storage_state.json, validates it with
notebooklm-py, and syncs the Cookie header to the Worker when needed.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sqlite3
import stat
import subprocess
import sys
import time
import traceback
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import keyring
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2

# ---------------------------------------------------------------------------
# Paths and constants
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
LOG_DIR = SCRIPT_DIR / "logs"
LOG_PATH = LOG_DIR / "sync-cookies.log"

WORKER_URL = os.environ.get("WORKER_URL", "https://core-resumes.hacolby.workers.dev")
TARGET_HOST = "notebooklm.google.com"
DEFAULT_CHROME_PROFILE_DIR = "Profile 6"
DEFAULT_NOTEBOOKLM_PROFILE = os.environ.get("NOTEBOOKLM_PROFILE", "jmbish04")
API_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/147.0.0.0 Safari/537.36"
)

CHROME_EPOCH_DELTA_MICROS = 11_644_473_600_000_000

REQUIRED_COOKIES = (
    "SID",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "__Secure-1PSID",
    "__Secure-3PSID",
    "__Secure-1PAPISID",
    "__Secure-3PAPISID",
    "NID",
    "__Secure-1PSIDTS",
    "__Secure-3PSIDTS",
)

_LOG: logging.Logger | None = None


@dataclass(frozen=True)
class CookieRow:
    """A decrypted Chrome cookie with enough metadata for storage_state.json."""

    profile: str
    host_key: str
    name: str
    value: str
    path: str
    expires_utc: int
    is_secure: int
    is_httponly: int
    samesite: int


# ---------------------------------------------------------------------------
# Logging and configuration
# ---------------------------------------------------------------------------

def configure_logging() -> logging.Logger:
    """Configure verbose file logs and concise stdout logs."""
    global _LOG

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log = logging.getLogger("sync_cookies")
    log.handlers.clear()
    log.setLevel(logging.DEBUG)
    log.propagate = False

    formatter = logging.Formatter(
        "%(asctime)s.%(msecs)03d %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.FileHandler(LOG_PATH, mode="w", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setLevel(logging.INFO)
    stdout_handler.setFormatter(formatter)

    log.addHandler(file_handler)
    log.addHandler(stdout_handler)
    _LOG = log
    return log


def get_log() -> logging.Logger:
    """Return the configured logger."""
    if _LOG is None:
        raise RuntimeError("logging not configured; call configure_logging() first")
    return _LOG


def parse_args() -> argparse.Namespace:
    """Parse CLI options for one-shot, daemon, and local validation modes."""
    argv = sys.argv[1:]
    if argv and argv[0] == "--":
        argv = argv[1:]

    parser = argparse.ArgumentParser(
        description="Sync NotebookLM cookies from Chrome Profile 6 to Worker KV.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="Run once and exit (default).")
    mode.add_argument("--daemon", action="store_true", help="Poll forever.")
    parser.add_argument(
        "--interval-min",
        type=float,
        default=60.0,
        help="Polling interval for --daemon (default: 60).",
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Refresh and sync cookies even if Worker health is currently OK.",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Decrypt, write storage_state.json, and run local auth check only.",
    )
    parser.add_argument(
        "--profile-dir",
        default=DEFAULT_CHROME_PROFILE_DIR,
        help="Chrome profile directory name (default: Profile 6).",
    )
    parser.add_argument(
        "--nlm-profile",
        default=DEFAULT_NOTEBOOKLM_PROFILE,
        help="notebooklm-py profile name (default: jmbish04 or NOTEBOOKLM_PROFILE).",
    )
    parser.add_argument(
        "--host",
        default="google",
        help="Cookie host_key substring for SQLite query (default: google).",
    )
    parser.add_argument(
        "--beekeeper",
        action="store_true",
        help="Export decrypted cookie rows to decrypted_cookies.db for debugging.",
    )
    return parser.parse_args(argv)


def resolve_worker_api_key() -> str:
    """Resolve the Worker API key from env or known local token aliases."""
    env = os.environ.get("WORKER_API_KEY", "").strip()
    if env:
        get_log().debug("WORKER_API_KEY from environment (len=%s)", len(env))
        return env

    for token_name in ("CLOUDFLARE_WORKER_API_KEY", "WORKER_API_KEY"):
        try:
            get_log().debug("WORKER_API_KEY not in env; invoking `tokens show %s`", token_name)
            out = subprocess.check_output(
                ["tokens", "show", token_name, "--value-only"],
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
        except Exception:
            continue
        if out:
            get_log().debug("Worker API key from token %s (len=%s)", token_name, len(out))
            return out

    raise RuntimeError("No usable WORKER_API_KEY found in env or local tokens")


# ---------------------------------------------------------------------------
# Chrome cookie decryption
# ---------------------------------------------------------------------------

def chrome_user_data_dir() -> Path:
    """Return Chrome's user data directory for this platform."""
    home = Path.home()
    if sys.platform == "darwin":
        return home / "Library/Application Support/Google/Chrome"
    if sys.platform.startswith("linux"):
        return home / ".config/google-chrome"
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA", str(home / "AppData/Local"))
        return Path(local) / "Google" / "Chrome" / "User Data"
    return home / ".config/google-chrome"


def get_chrome_key() -> bytes:
    """Fetch and derive Chrome's AES cookie key from macOS Keychain."""
    password = keyring.get_password("Chrome Safe Storage", "Chrome")
    if not password:
        raise RuntimeError("Could not find Chrome password in Keychain.")

    salt = b"saltysalt"
    iterations = 1003
    return PBKDF2(password.encode("utf-8"), salt, 32, iterations)


def decrypt_cookie(encrypted_value: bytes, key: bytes, plaintext_value: str = "") -> str:
    """Decrypt Chrome v10/v11 cookie values, including the Chrome 130+ host hash."""
    if plaintext_value:
        return plaintext_value
    if not encrypted_value or len(encrypted_value) < 3:
        return "[Empty]"

    prefix = encrypted_value[:3]
    try:
        if prefix == b"v11":
            nonce = encrypted_value[3:15]
            ciphertext = encrypted_value[15:-16]
            tag = encrypted_value[-16:]
            cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
            decrypted = cipher.decrypt_and_verify(ciphertext, tag)
            if len(decrypted) > 32:
                decrypted = decrypted[32:]
            return decrypted.decode("utf-8")

        if prefix == b"v10":
            cipher = AES.new(key[:16], AES.MODE_CBC, iv=b" " * 16)
            decrypted = cipher.decrypt(encrypted_value[3:])
            padding_len = decrypted[-1]
            result = decrypted[:-padding_len]
            if len(result) > 32:
                result = result[32:]
            return result.decode("utf-8")

        return f"[Unsupported Cookie Prefix: {prefix!r}]"
    except Exception as exc:
        return f"[Decryption Failed: {exc}]"


def get_cookie_paths(profile_dir: str | None = None) -> list[tuple[str, Path]]:
    """Find Chrome cookie DB paths, supporting both legacy and Network layouts."""
    base_path = chrome_user_data_dir()
    paths: list[tuple[str, Path]] = []
    if not base_path.exists():
        return paths

    profile_names = [profile_dir] if profile_dir else sorted(os.listdir(base_path))
    for item in profile_names:
        if item is None:
            continue
        profile_path = base_path / item
        if not profile_path.is_dir():
            continue
        for candidate in (profile_path / "Cookies", profile_path / "Network" / "Cookies"):
            if candidate.exists():
                paths.append((item, candidate))
                break
    return paths


def extract_cookies(profile_dir: str, key: bytes, host_filter: str) -> list[CookieRow]:
    """Decrypt cookies from a single Chrome profile and return structured rows."""
    log = get_log()
    cookie_paths = get_cookie_paths(profile_dir)
    if not cookie_paths:
        raise FileNotFoundError(f"No Chrome cookie DB found for profile {profile_dir!r}")

    profile_name, db_path = cookie_paths[0]
    log.info("Reading Chrome cookies profile=%s db=%s", profile_name, db_path)
    query = """
        SELECT host_key, name, value, encrypted_value, path, expires_utc,
               is_secure, is_httponly, samesite
        FROM cookies
        WHERE host_key LIKE ?
        ORDER BY host_key, name
    """

    attempts = 0
    while True:
        attempts += 1
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro&nolock=1", uri=True)
            try:
                cursor = conn.cursor()
                cursor.execute(query, (f"%{host_filter}%",))
                rows = cursor.fetchall()
            finally:
                conn.close()
            break
        except sqlite3.OperationalError:
            if attempts >= 2:
                raise
            time.sleep(0.5)

    decrypted: list[CookieRow] = []
    for (
        host_key,
        name,
        value,
        encrypted_value,
        path,
        expires_utc,
        is_secure,
        is_httponly,
        samesite,
    ) in rows:
        cookie_value = decrypt_cookie(encrypted_value, key, value)
        decrypted.append(
            CookieRow(
                profile=profile_name,
                host_key=host_key,
                name=name,
                value=cookie_value,
                path=path or "/",
                expires_utc=int(expires_utc or 0),
                is_secure=int(is_secure or 0),
                is_httponly=int(is_httponly or 0),
                samesite=int(samesite if samesite is not None else -1),
            ),
        )

    log.info("Decrypted %s cookie row(s) matching host filter %r", len(decrypted), host_filter)
    return decrypted


def cookie_applies_to_target(row: CookieRow, target_host: str = TARGET_HOST) -> bool:
    """Return true when Chrome would send the row to notebooklm.google.com."""
    host = row.host_key.lstrip(".").lower()
    target = target_host.lower()
    if row.host_key.startswith("."):
        return target == host or target.endswith("." + host)
    return target == host


def is_bad_cookie_value(value: str) -> bool:
    """Detect empty or failed decryption sentinel values."""
    return not value or value.startswith("[Empty]") or value.startswith("[Decryption Failed:")


def target_cookie_rows(rows: list[CookieRow]) -> list[CookieRow]:
    """Filter rows down to cookies relevant to NotebookLM requests."""
    relevant = [row for row in rows if cookie_applies_to_target(row) and not is_bad_cookie_value(row.value)]
    return sorted(relevant, key=lambda row: (row.host_key, row.path, row.name))


def require_cookies(rows: list[CookieRow]) -> dict[str, str]:
    """Ensure all required Google session cookies decrypted successfully."""
    relevant = target_cookie_rows(rows)
    values = {row.name: row.value for row in relevant}
    missing = [name for name in REQUIRED_COOKIES if is_bad_cookie_value(values.get(name, ""))]
    if missing:
        raise RuntimeError(f"Missing or failed required NotebookLM cookies: {', '.join(missing)}")
    return {name: values[name] for name in REQUIRED_COOKIES}


def build_cookie_header(rows: list[CookieRow]) -> str:
    """Build the Cookie header value sent to the Worker session sync endpoint."""
    relevant = target_cookie_rows(rows)
    seen: set[tuple[str, str, str]] = set()
    parts: list[str] = []
    for row in relevant:
        key = (row.host_key, row.path, row.name)
        if key in seen:
            continue
        seen.add(key)
        parts.append(f"{row.name}={row.value}")
    return "; ".join(parts)


def chrome_expiry_to_unix(expires_utc: int) -> int:
    """Convert Chromium epoch microseconds to Unix seconds for Playwright."""
    if not expires_utc:
        return -1
    return int((expires_utc - CHROME_EPOCH_DELTA_MICROS) / 1_000_000)


def chrome_samesite_to_playwright(value: int) -> str:
    """Map Chromium's samesite enum to Playwright storage-state strings."""
    return {-1: "Lax", 0: "None", 1: "Lax", 2: "Strict"}.get(value, "Lax")


def build_storage_state(rows: list[CookieRow]) -> dict[str, Any]:
    """Build a notebooklm-py compatible Playwright storage_state.json object."""
    cookies = []
    for row in target_cookie_rows(rows):
        cookies.append(
            {
                "name": row.name,
                "value": row.value,
                "domain": row.host_key,
                "path": row.path or "/",
                "expires": chrome_expiry_to_unix(row.expires_utc),
                "httpOnly": bool(row.is_httponly),
                "secure": bool(row.is_secure),
                "sameSite": chrome_samesite_to_playwright(row.samesite),
            },
        )
    return {"cookies": cookies, "origins": []}


def notebooklm_home() -> Path:
    """Return NOTEBOOKLM_HOME or ~/.notebooklm."""
    env = os.environ.get("NOTEBOOKLM_HOME", "").strip()
    return Path(env).expanduser() if env else Path.home() / ".notebooklm"


def write_storage_state(state: dict[str, Any], profile: str) -> Path:
    """Write storage_state.json for notebooklm-py and restrict file permissions."""
    path = notebooklm_home() / "profiles" / profile / "storage_state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    get_log().info("Wrote notebooklm-py storage state: %s", path)
    return path


def export_to_beekeeper(rows: list[CookieRow]) -> None:
    """Export decrypted cookies to a local SQLite DB for manual inspection."""
    db_name = SCRIPT_DIR / "decrypted_cookies.db"
    conn = sqlite3.connect(db_name)
    try:
        cursor = conn.cursor()
        cursor.execute("DROP TABLE IF EXISTS cookies")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS  cookies (
                profile TEXT, host_key TEXT, name TEXT, value TEXT, path TEXT,
                expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER, samesite INTEGER
            )
            """,
        )
        cursor.executemany(
            "INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    row.profile,
                    row.host_key,
                    row.name,
                    row.value,
                    row.path,
                    row.expires_utc,
                    row.is_secure,
                    row.is_httponly,
                    row.samesite,
                )
                for row in rows
            ],
        )
        conn.commit()
    finally:
        conn.close()
    print(f"\nSuccess. Open '{db_name}' in Beekeeper Studio.")


# ---------------------------------------------------------------------------
# notebooklm-py validation and Worker API
# ---------------------------------------------------------------------------

def notebooklm_bin() -> Path:
    """Return the notebooklm console script inside scripts/.venv."""
    return SCRIPT_DIR / ".venv" / "bin" / "notebooklm"


def notebooklm_auth_check(profile: str, storage_path: Path) -> tuple[bool, dict[str, Any]]:
    """Run notebooklm-py's network auth check against the generated profile."""
    cmd = [
        str(notebooklm_bin()),
        "--storage",
        str(storage_path),
        "auth",
        "check",
        "--test",
        "--json",
    ]
    get_log().info("Running local notebooklm auth check for profile=%s", profile)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    stdout = result.stdout.strip()
    stderr = result.stderr.strip()
    parsed: dict[str, Any] = {}

    if stdout:
        try:
            parsed = json.loads(stdout)
        except json.JSONDecodeError:
            parsed = {"stdout": stdout}
    if stderr:
        parsed["stderr"] = stderr

    explicitly_bad = (
        parsed.get("valid") is False
        or parsed.get("ok") is False
        or parsed.get("status") in {"fail", "failed", "error"}
    )
    ok = result.returncode == 0 and not explicitly_bad
    if ok:
        get_log().info("Local notebooklm auth check passed")
    else:
        get_log().warning(
            "Local notebooklm auth check failed returncode=%s parsed=%s",
            result.returncode,
            parsed,
        )
    return ok, parsed


def request_json(
    url: str,
    api_key: str,
    payload: dict[str, Any] | None = None,
    extra_headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, Any], dict[str, str]]:
    """POST JSON to the Worker with x-api-key and parse the JSON response."""
    data = json.dumps(payload or {}).encode("utf-8")
    req = Request(
        url,
        data=data,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": API_USER_AGENT,
            "x-api-key": api_key,
            **(extra_headers or {}),
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}, dict(resp.headers)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body) if body else {}
        except json.JSONDecodeError:
            parsed = {"error": body}
        return exc.code, parsed, dict(exc.headers)
    except URLError as exc:
        return 0, {"error": str(exc.reason)}, {}


def worker_login_session_cookie(api_key: str) -> str:
    """Create a browser session cookie for compatibility with deployed auth gates."""
    status, _body, headers = request_json(
        f"{WORKER_URL}/api/auth/login",
        api_key,
        {"apiKey": api_key},
    )
    if status != 200:
        raise RuntimeError(f"Worker login failed with status {status}")
    set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie")
    if not set_cookie:
        raise RuntimeError("Worker login did not return Set-Cookie")
    return set_cookie.split(";", 1)[0]


def worker_session_check(api_key: str, session_cookie: str | None = None) -> tuple[bool, dict[str, Any]]:
    """Run the Worker's active NotebookLM session check endpoint."""
    url = f"{WORKER_URL}/api/notebook/session/check"
    extra_headers = {"Cookie": session_cookie} if session_cookie else None
    status, body, _headers = request_json(url, api_key, extra_headers=extra_headers)
    ok = status == 200 and body.get("ok") is True
    get_log().info("Worker session check status=%s ok=%s body=%s", status, ok, body)
    return ok, body


def worker_session_sync(cookie_header: str, api_key: str) -> tuple[bool, dict[str, Any]]:
    """Sync a fresh Cookie header to the Worker KV session endpoint."""
    url = f"{WORKER_URL}/api/notebook/session/sync"
    status, body, _headers = request_json(url, api_key, {"cookies": cookie_header})
    ok = status == 200 and body.get("ok") is True
    get_log().info(
        "Worker session sync status=%s ok=%s cookie_length=%s body=%s",
        status,
        ok,
        len(cookie_header),
        body,
    )
    return ok, body


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def refresh_from_chrome(args: argparse.Namespace) -> tuple[str, Path]:
    """Decrypt Chrome cookies, write storage_state.json, and validate locally."""
    print(f"Decrypting Chrome cookies from {args.profile_dir}...")
    key = get_chrome_key()
    rows = extract_cookies(args.profile_dir, key, args.host)

    if args.beekeeper:
        export_to_beekeeper(rows)

    required = require_cookies(rows)
    get_log().debug("Required cookies present: %s", sorted(required.keys()))

    cookie_header = build_cookie_header(rows)
    if len(cookie_header) < 20:
        raise RuntimeError("Cookie header is unexpectedly short")

    state = build_storage_state(rows)
    storage_path = write_storage_state(state, args.nlm_profile)

    ok, parsed = notebooklm_auth_check(args.nlm_profile, storage_path)
    if not ok:
        raise RuntimeError(f"notebooklm auth check failed: {json.dumps(parsed)[:1000]}")

    print(
        f"Local NotebookLM auth OK. Prepared {len(state['cookies'])} cookies "
        f"({len(cookie_header)} chars).",
    )
    return cookie_header, storage_path


def active_session_check(api_key: str) -> tuple[bool, dict[str, Any]]:
    """Run active check, falling back to a short-lived browser session if needed."""
    healthy, body = worker_session_check(api_key)
    if healthy or body.get("error") != "Unauthorized":
        return healthy, body

    get_log().info("Active check needs cr_session compatibility fallback")
    try:
        session_cookie = worker_login_session_cookie(api_key)
        return worker_session_check(api_key, session_cookie)
    except Exception as exc:
        get_log().warning("cr_session compatibility fallback failed: %s", exc)
        return healthy, body


def run_once(args: argparse.Namespace) -> int:
    """Run one poll/refresh/sync cycle."""
    log = get_log()
    log.info(
        "NotebookLM Cookie Sync start worker=%s chrome_profile=%s nlm_profile=%s",
        WORKER_URL,
        args.profile_dir,
        args.nlm_profile,
    )
    print(f"\n[{datetime.now():%Y-%m-%d %H:%M:%S}] NotebookLM Cookie Sync")
    print(f"Worker:        {WORKER_URL}")
    print(f"Chrome profile:{args.profile_dir}")
    print(f"NLM profile:   {args.nlm_profile}")
    print(f"Log:           {LOG_PATH}")

    if args.validate_only:
        refresh_from_chrome(args)
        print("Validate-only complete; Worker was not touched.")
        return 0

    try:
        api_key = resolve_worker_api_key()
    except Exception as exc:
        log.error("WORKER_API_KEY resolution failed: %s", exc)
        log.debug("%s", traceback.format_exc())
        print("WORKER_API_KEY not set. Export it or store via `tokens`.")
        return 1

    if not api_key:
        print("WORKER_API_KEY not set. Export it or store via `tokens`.")
        return 1

    healthy, health_body = active_session_check(api_key)
    if healthy and not args.force_refresh:
        print(f"Worker NotebookLM session is healthy ({health_body.get('latencyMs', '?')} ms).")
        return 0

    if args.force_refresh:
        print("Force refresh requested; refreshing Chrome cookies.")
    else:
        print(f"Worker session check failed; refreshing cookies: {health_body}")

    try:
        cookie_header, _storage_path = refresh_from_chrome(args)
    except Exception as exc:
        log.error("Local refresh failed: %s", exc)
        log.debug("%s", traceback.format_exc())
        print(f"Local refresh failed: {exc}")
        return 1

    synced, sync_body = worker_session_sync(cookie_header, api_key)
    if not synced:
        print(f"Worker sync failed: {sync_body}")
        return 2

    print(
        "Synced to Worker KV: "
        f"{sync_body.get('cookieLength', len(cookie_header))} chars at {sync_body.get('updatedAt', '?')}",
    )

    verified, verify_body = active_session_check(api_key)
    if not verified:
        print(f"Post-sync verification failed: {verify_body}")
        return 2

    print(f"Post-sync verification passed ({verify_body.get('latencyMs', '?')} ms).")
    return 0


def main() -> None:
    """Entrypoint for one-shot and daemon sync modes."""
    configure_logging()
    args = parse_args()

    if args.interval_min <= 0:
        print("--interval-min must be greater than zero")
        sys.exit(1)

    if not args.daemon:
        sys.exit(run_once(args))

    while True:
        code = run_once(args)
        if code != 0:
            get_log().warning("Daemon iteration failed with exit code %s; continuing", code)
        sleep_seconds = int(args.interval_min * 60)
        print(f"Sleeping {args.interval_min:g} minute(s) before next poll...")
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    main()
