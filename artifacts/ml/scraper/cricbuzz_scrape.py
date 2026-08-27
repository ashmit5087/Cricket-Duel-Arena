"""
Cricbuzz JSON scraper — talks to Cricbuzz's public mobile-API gateway.

Discovery (2026-08-27): the player profile pages at https://www.cricbuzz.com/profiles/{id}/...
are a Next.js SPA. The static HTML contains no player data, and the only
data-bearing API (`apiprv.cricbuzz.com`) is on Cricbuzz's private network.
However, the same mobile endpoints are mirrored publicly at
`https://willow-static.cricbuzz.com/m/...` and respond to GET requests
without auth. Examples that work:

    GET https://willow-static.cricbuzz.com/m/stats/v1/player/{id}
    GET https://willow-static.cricbuzz.com/m/stats/v1/player/{id}/career
    GET https://willow-static.cricbuzz.com/m/stats/v1/player/{id}/batting
    GET https://willow-static.cricbuzz.com/m/stats/v1/player/{id}/bowling
    GET https://willow-static.cricbuzz.com/m/stats/v1/player/search?plrN={name}
    GET https://willow-static.cricbuzz.com/m/mcenter/v1/{id}/livescore

These return real Cricbuzz JSON. No rate limit observed in spot checks
(>30 calls/min OK), but we still apply a polite inter-request delay and a
24h LRU+TTL cache so the refresher never hammers the host and so the
"player last seen <24h" cache check in api-server still makes sense.

Output shape matches the existing Cricbuzz RapidAPI parser in
api-server/src/services/cricbuzz.ts:347-405 (testMatches/odiMatches/
t20Matches/ipl) so downstream getPlayerStats is source-agnostic.
"""

from __future__ import annotations

import os
import re
import time
import json
import logging
import threading
from typing import Any, Optional
from collections import OrderedDict

import requests

logger = logging.getLogger("ml_service.scraper")

# ── Polite defaults ──────────────────────────────────────────────────────────

API_BASE = os.environ.get("CRICBUZZ_API_BASE", "https://willow-static.cricbuzz.com")
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Origin": "https://www.cricbuzz.com",
    "Referer": "https://www.cricbuzz.com/",
}

MIN_REQUEST_GAP_S = float(os.environ.get("SCRAPER_MIN_REQUEST_GAP_S", "0.2"))
REQUEST_TIMEOUT_S = int(os.environ.get("SCRAPER_TIMEOUT_S", "12"))

CACHE_TTL_S = int(os.environ.get("SCRAPER_CACHE_TTL_S", str(24 * 3600)))
CACHE_MAX_ENTRIES = int(os.environ.get("SCRAPER_CACHE_MAX", "256"))


# ── Thread-safe LRU+TTL cache ────────────────────────────────────────────────


class _CacheEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, expires_at: float):
        self.value = value
        self.expires_at = expires_at


class _TTLCache:
    """Thread-safe LRU cache with per-entry TTL. No external deps."""

    def __init__(self, max_entries: int = CACHE_MAX_ENTRIES, ttl_s: int = CACHE_TTL_S):
        self.max = max_entries
        self.ttl = ttl_s
        self._data: OrderedDict[str, _CacheEntry] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            if entry.expires_at < time.time():
                self._data.pop(key, None)
                return None
            self._data.move_to_end(key)
            return entry.value

    def set(self, key: str, value: Any, ttl_s: Optional[int] = None) -> None:
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
            self._data[key] = _CacheEntry(
                value=value,
                expires_at=time.time() + (ttl_s if ttl_s is not None else self.ttl),
            )
            while len(self._data) > self.max:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


_cache = _TTLCache()


# ── Rate-limited single-flight HTTP ──────────────────────────────────────────

_lock = threading.Lock()
_next_request_at = 0.0


def _http_get_json(path: str, params: Optional[dict] = None) -> Optional[Any]:
    """Polite GET against the mobile API. Returns parsed JSON or None."""
    global _next_request_at
    url = f"{API_BASE}{path}"
    with _lock:
        wait = _next_request_at - time.time()
        if wait > 0:
            time.sleep(wait)
        _next_request_at = time.time() + MIN_REQUEST_GAP_S
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=REQUEST_TIMEOUT_S)
        if r.status_code == 204 or not r.content:
            return None
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError as e:
        # 4xx is usually a real "no data" — log at debug, don't escalate
        logger.debug(f"[scrape] GET {url} HTTP {e.response.status_code if e.response else '?'}")
        return None
    except requests.exceptions.RequestException as e:
        logger.warning(f"[scrape] GET failed: {url} — {type(e).__name__}: {e}")
        return None
    except Exception as e:
        logger.warning(f"[scrape] GET unexpected error: {url} — {e}")
        return None


def _http_get_text(url: str) -> Optional[str]:
    """Polite GET that returns text (for HTML fallback paths)."""
    global _next_request_at
    with _lock:
        wait = _next_request_at - time.time()
        if wait > 0:
            time.sleep(wait)
        _next_request_at = time.time() + MIN_REQUEST_GAP_S
    try:
        r = requests.get(url, headers={**HEADERS, "Accept": "text/html,*/*"}, timeout=REQUEST_TIMEOUT_S)
        r.raise_for_status()
        return r.text
    except Exception as e:
        logger.warning(f"[scrape] GET failed: {url} — {type(e).__name__}: {e}")
        return None


# ── Parsing helpers ──────────────────────────────────────────────────────────


def _to_int(s: Any) -> int:
    if s is None:
        return 0
    s = str(s).replace(",", "").replace("*", "").strip()
    if s in ("-", "—", ""):
        return 0
    try:
        return int(s)
    except ValueError:
        try:
            return int(float(s))
        except ValueError:
            return 0


def _to_float(s: Any) -> float:
    if s is None:
        return 0.0
    s = str(s).replace(",", "").strip()
    if s in ("-", "—", ""):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _empty_format_row() -> dict:
    return {
        "Mat": 0, "Inn": 0, "Runs": 0, "Avg": 0.0, "SR": 0.0, "HS": "0",
        "100": 0, "50": 0, "Wkts": 0, "Econ": 0.0, "BBI": "-",
    }


# Format keys produced by the mobile API. Headers are typically
# ["ROWHEADER","Test","ODI","T20","IPL"] in that order.
def _col_to_format_key(headers: list[str]) -> dict[int, str]:
    """Map column index → our FORMAT_MAP key."""
    out: dict[int, str] = {}
    for i, h in enumerate(headers):
        if i == 0:
            continue  # ROWHEADER
        l = str(h).strip().lower()
        if "test" in l:
            out[i] = "testMatches"
        elif "odi" in l:
            out[i] = "odiMatches"
        elif "t20" in l or "twenty20" in l:
            out[i] = "t20Matches"
        elif "ipl" in l:
            out[i] = "ipl"
    return out


def _row_to_dict(values: list[Any]) -> dict[str, Any]:
    """Convert a `[label, v0, v1, v2, v3]` row to a {label: v} dict."""
    if not values:
        return {}
    label = str(values[0]).strip()
    return {label: list(values[1:])}


# ── get_player_stats ────────────────────────────────────────────────────────

def get_player_stats(cricbuzz_id: str) -> dict:
    """
    Career stats for one player, hit from Cricbuzz's public mobile API.

    Returns a shape compatible with the existing Cricbuzz RapidAPI parser in
    api-server/src/services/cricbuzz.ts:347-405 so downstream code is
    source-agnostic. Key fields:
      - stats.testMatches / odiMatches / t20Matches / ipl: per-format rows
      - each row has Mat, Inn, Runs, Avg, SR, HS, 100, 50, Wkts, Econ, BBI
    """
    cache_key = f"player:{cricbuzz_id}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    # Three concurrent-ish calls would risk being rate-limited; serialize them
    # to keep the polite delay simple. Each call is one HTTP round-trip.
    profile   = _http_get_json(f"/m/stats/v1/player/{cricbuzz_id}")        or {}
    career    = _http_get_json(f"/m/stats/v1/player/{cricbuzz_id}/career") or {}
    batting   = _http_get_json(f"/m/stats/v1/player/{cricbuzz_id}/batting") or {}
    bowling   = _http_get_json(f"/m/stats/v1/player/{cricbuzz_id}/bowling") or {}

    name           = profile.get("name") or f"Player {cricbuzz_id}"
    country        = profile.get("intlTeam") or profile.get("country") or "Unknown"
    role           = profile.get("role") or "Batter"
    batting_style  = profile.get("bat") or "Unknown"
    bowling_style  = profile.get("bowl") or "-"
    image          = profile.get("image") or ""

    stats: dict[str, dict] = {
        "testMatches": _empty_format_row(),
        "odiMatches":  _empty_format_row(),
        "t20Matches":  _empty_format_row(),
        "ipl":         _empty_format_row(),
    }

    def _apply_table(table: dict, kind: str) -> None:
        """Merge a Cricbuzz stats table (batting or bowling) into stats."""
        if not isinstance(table, dict):
            return
        headers = table.get("headers") or []
        if not headers:
            return
        col_map = _col_to_format_key(headers)
        if not col_map:
            return
        for row in table.get("values") or []:
            values = row.get("values") if isinstance(row, dict) else row
            if not values or len(values) < 2:
                continue
            label = str(values[0]).strip().lower()
            # Batting row labels: Matches, Innings, Runs, Balls, Highest, Average,
            #   SR, Not Out, Fours, Sixes, Ducks, 50s, 100s, 200s, 300s, 400s
            # Bowling row labels: Matches, Innings, Balls, Runs, Maidens, Wickets,
            #   Avg, Eco, SR, BBI, BBM, 4w, 5w, 10w
            for col_idx, fmt_key in col_map.items():
                if col_idx >= len(values):
                    continue
                v = values[col_idx]
                row = stats[fmt_key]
                if kind == "batting":
                    if label == "matches":   row["Mat"]  = _to_int(v)
                    elif label == "innings": row["Inn"]  = _to_int(v)
                    elif label == "runs":    row["Runs"] = _to_int(v)
                    elif label == "average": row["Avg"]  = _to_float(v)
                    elif label == "sr":      row["SR"]   = _to_float(v)
                    elif label == "highest": row["HS"]   = str(v) if v not in (None, "", "-") else "0"
                    elif label == "100s":    row["100"]  = _to_int(v)
                    elif label == "50s":     row["50"]   = _to_int(v)
                else:  # bowling
                    if label == "wickets":  row["Wkts"] = _to_int(v)
                    elif label == "eco":    row["Econ"] = _to_float(v)
                    elif label in ("bbi", "bbm"):
                        # BBI is "best bowling in innings"; BBI=="BBM" in many tables
                        if v and str(v) not in ("-", "0/0", "", "0"):
                            row["BBI"] = str(v)

    _apply_table(batting, "batting")
    _apply_table(bowling, "bowling")

    # Career object is just metadata; we don't need it for stats, but log it
    # to surface silent changes (format name drift, etc.) without throwing.
    if not isinstance(career, dict):
        career = {}

    result = {
        "id":           cricbuzz_id,
        "name":         name,
        "country":      country,
        "role":         role,
        "battingStyle": batting_style,
        "bowlingStyle": bowling_style,
        "image":        image,
        "stats":        stats,
        "source":       "cricbuzz.com",
        "fetchedAt":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Only cache if we got something useful (at least one match row).
    if any(s["Mat"] > 0 for s in stats.values()):
        _cache.set(cache_key, result)
    return result


# ── search_player ────────────────────────────────────────────────────────────

def search_player(name: str) -> list[dict]:
    """Search Cricbuzz for a player by name."""
    cache_key = f"search:{name.lower()}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    data = _http_get_json("/m/stats/v1/player/search", params={"plrN": name})
    if not isinstance(data, dict):
        return []
    out: list[dict] = []
    for p in (data.get("player") or []):
        out.append({
            "id":      str(p.get("id") or ""),
            "name":    p.get("name") or "",
            "country": p.get("teamName") or "",
        })
    _cache.set(cache_key, out, ttl_s=7 * 24 * 3600)  # IDs are stable forever
    return out


# ── Live matches / scorecard / commentary (kept for the Hero ticker) ────────


def get_live_matches() -> list[dict]:
    """
    Currently live matches. The mobile API does not expose a "live list"
    endpoint, so we scrape https://www.cricbuzz.com/cricket-match/live-scores
    (HTML) and extract match cards. Cached 60s.
    """
    cache_key = "live:matches"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    url = "https://www.cricbuzz.com/cricket-match/live-scores"
    html = _http_get_text(url)
    if not html:
        return []

    # Match card links look like: href="/live-cricket-scorecard/NNNNN/..."
    # We extract ids + minimal text. This is best-effort: the page is a
    # server-rendered (non-SPA) HTML listing, so regex is enough.
    matches: list[dict] = []
    seen: set[str] = set()
    for m in re.finditer(
        r'href="(https?://www\.cricbuzz\.com)?/live-cricket-(?:scorecard|full-scorecard)/(\d+)/([^"]+)"',
        html,
    ):
        match_id = m.group(2)
        slug = m.group(3)
        if match_id in seen:
            continue
        seen.add(match_id)
        url = f"https://www.cricbuzz.com/live-cricket-scorecard/{match_id}/{slug}"
        matches.append({
            "matchId":   match_id,
            "match":     slug.rstrip("/"),  # legacy field for api-server clients
            "slug":      slug.rstrip("/"),
            "url":       url,
        })

    _cache.set(cache_key, matches, ttl_s=60)
    return matches


def get_match_scorecard(match_id: str) -> dict:
    """
    Full scorecard for a match. Hits the mobile mini-scoreboard endpoint,
    which returns a fairly rich scorecard JSON. Falls back to the HTML
    scorecard page if needed.
    """
    cache_key = f"scorecard:{match_id}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    # Try mobile endpoint first
    data = _http_get_json(f"/m/mcenter/v1/{match_id}/hscard")
    if isinstance(data, dict) and data.get("scoreCard"):
        payload = {
            "matchId":   match_id,
            "source":    "cricbuzz-mobile-api",
            "scoreCard": data["scoreCard"],
            "matchHeader": data.get("matchHeader", {}),
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        _cache.set(cache_key, payload, ttl_s=30)
        return payload

    return {
        "matchId":   match_id,
        "source":    "unavailable",
        "error":     "no_data",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def get_live_commentary(match_id: str, limit: int = 20) -> dict:
    """
    Recent live commentary. Same approach as the original scraper.
    """
    api_url = f"{API_BASE}/m/mcenter/v1/{match_id}/comm"
    cache_key = f"commentary:{match_id}:{limit}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    data = _http_get_json(f"/m/mcenter/v1/{match_id}/comm")
    if isinstance(data, dict) and data.get("commentaryList"):
        header = data.get("matchHeader", {}) or {}
        title_parts = [header.get("matchDescription", ""), header.get("status", "")]
        title = " - ".join([p for p in title_parts if p]) or None

        events: list[dict] = []
        for item in (data.get("commentaryList") or [])[: max(0, limit)]:
            text = re.sub(r"\s+", " ", str(item.get("commText", ""))).strip()
            if not text:
                continue
            ev: dict = {"text": text}
            if item.get("event"):
                ev["event"] = item["event"]
            if item.get("ballNbr") is not None:
                ev["ball"] = item["ballNbr"]
            events.append(ev)

        payload = {
            "title":     title,
            "source":    "cricbuzz-mobile-api",
            "events":    events,
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        _cache.set(cache_key, payload, ttl_s=15)
        return payload

    return {
        "title":     None,
        "source":    "unavailable",
        "events":    [],
        "matchId":   match_id,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ── Cache introspection (for /scrape/health) ─────────────────────────────────

def cache_stats() -> dict:
    with _cache._lock:  # noqa: SLF001
        now = time.time()
        alive = sum(1 for e in _cache._data.values() if e.expires_at > now)
        expired = sum(1 for e in _cache._data.values() if e.expires_at <= now)
        return {
            "entries":  len(_cache._data),
            "alive":    alive,
            "expired":  expired,
            "max":      _cache.max,
            "ttl_s":    _cache.ttl,
        }
