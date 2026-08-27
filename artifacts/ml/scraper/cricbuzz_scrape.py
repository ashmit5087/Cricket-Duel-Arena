"""
Cricbuzz scraper — adapted from tarun7r/cricket-mcp-server.

Key changes from upstream:
  1. Direct profile URL with slug. Cricbuzz 404s on /profiles/{id} without a
     slug, so we resolve the slug from a small id→slug map kept in
     PLAYER_SLUGS. Unknown ids get a generic slug probe (works in practice
     because Cricbuzz's CDN ignores unknown slugs once a valid id is present).
  2. 24h in-memory LRU+TTL cache, mirrors api-server's TTL.CAREER_STATS.
     Polite: 1s gap between requests.
  3. Output shape matches the existing Cricbuzz RapidAPI parser in
     api-server/src/services/cricbuzz.ts:347-405 (FORMAT_MAP with
     testMatches/odiMatches/t20Matches/ipl) so downstream getPlayerStats is
     source-agnostic.
  4. **Cricbuzz's profile page is a SPA / dynamically rendered for much of the
     stats content.** The header card (name/country/role) is server-rendered
     but the career summary tables are rendered after initial load. The
     requests-html-style of scraping won't get them without JS execution.
     We use the *static fallback path*: hit Cricbuzz's CDN-backed HTML page
     which still includes the summary tables in the initial response for
     player profiles (verified for 2026-08 layout). If a future layout
     change breaks this, `get_player_stats()` returns empty stats and the
     refresher falls back to RapidAPI — this is the right failure mode.
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
from bs4 import BeautifulSoup, Tag

logger = logging.getLogger("ml_service.scraper")

# ── Polite defaults ──────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

MIN_REQUEST_GAP_S = float(os.environ.get("SCRAPER_MIN_REQUEST_GAP_S", "1.0"))
REQUEST_TIMEOUT_S = int(os.environ.get("SCRAPER_TIMEOUT_S", "12"))

CACHE_TTL_S = int(os.environ.get("SCRAPER_CACHE_TTL_S", str(24 * 3600)))
CACHE_MAX_ENTRIES = int(os.environ.get("SCRAPER_CACHE_MAX", "256"))


# ── Profile URL helpers ──────────────────────────────────────────────────────
# Cricbuzz serves the same player page for any slug — verified by hitting
# /profiles/{id}/anything and seeing the 200 + correct content. So we just
# need any non-empty slug and the id; the slug is SEO metadata, not routing.
# Earlier drafts of this file had a 800-entry PLAYER_SLUGS map that turned
# out to be wrong (Cricbuzz IDs aren't sequential and I was guessing). The
# real IDs come from api-server/src/models/player.ts and are passed in as
# the cricbuzz_id argument — the slug doesn't matter.


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


def _http_get(url: str) -> Optional[str]:
    """Polite GET with a global inter-request delay. Returns body or None."""
    global _next_request_at
    with _lock:
        wait = _next_request_at - time.time()
        if wait > 0:
            time.sleep(wait)
        _next_request_at = time.time() + MIN_REQUEST_GAP_S
    try:
        r = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT_S)
        r.raise_for_status()
        return r.text
    except requests.exceptions.RequestException as e:
        logger.warning(f"[scrape] GET failed: {url} — {type(e).__name__}: {e}")
        return None
    except Exception as e:
        logger.warning(f"[scrape] GET unexpected error: {url} — {e}")
        return None


# ── URL helpers ──────────────────────────────────────────────────────────────


def _profile_url(cricbuzz_id: str) -> str:
    """Build a Cricbuzz profile URL. Slug is SEO metadata only — any
    non-empty slug returns the same page. The numeric id is the routing key."""
    return f"https://www.cricbuzz.com/profiles/{cricbuzz_id}/player"


def _live_scores_url() -> str:
    return "https://www.cricbuzz.com/cricket-match/live-scores"


def _match_url(slug: str) -> str:
    if slug.startswith("http"):
        return slug
    return f"https://www.cricbuzz.com{slug}" if slug.startswith("/") else f"https://www.cricbuzz.com/{slug}"


# ── Parsing helpers ─────────────────────────────────────────────────────────


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


def _map_format_label(label: str) -> Optional[str]:
    """Map format header (Test/ODI/T20/IPL) to parser's FORMAT_MAP key."""
    if not label:
        return None
    l = label.strip().lower()
    if "test" in l:
        return "testMatches"
    if "odi" in l:
        return "odiMatches"
    if "t20" in l or "twenty20" in l:
        return "t20Matches"
    if "ipl" in l:
        return "ipl"
    return None


# ── get_player_stats ────────────────────────────────────────────────────────

def get_player_stats(cricbuzz_id: str) -> dict:
    """
    Scrape a player's profile page and return career stats across all formats.

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

    url = _profile_url(cricbuzz_id)
    html = _http_get(url)
    if not html:
        return _empty_player(cricbuzz_id, "fetch_failed")

    soup = BeautifulSoup(html, "lxml")

    # ── Header (name, country, role) ───────────────────────────────────────
    # The Cricbuzz 2026-08 layout renders the header card without a
    # div#playerProfile wrapper — name/country are the first two H1/H3
    # elements on the page (after the site nav). Role is in the "Personal
    # Information" list.
    name, country = _extract_name_country(soup)
    role, batting_style, bowling_style = _extract_personal_info(soup)
    image = _extract_player_image(soup)

    # ── Career summary tables ─────────────────────────────────────────────
    # Layout: two tables, "Batting Career Summary" and "Bowling Career Summary".
    # Each has row 0 = ['', 'Test', 'ODI', 'T20', 'IPL'] header (column 0 is
    # an empty corner cell), and the stat rows follow: ['Matches', n, n, n, n].
    stats: dict[str, dict] = {
        "testMatches": _empty_format_row(),
        "odiMatches":  _empty_format_row(),
        "t20Matches":  _empty_format_row(),
        "ipl":         _empty_format_row(),
    }

    summary_tables = _find_career_tables(soup)
    # Batting and bowling tables have overlapping but distinct stat schemas
    # (e.g. "Inn" means batting-innings in one, bowling-innings in the other).
    # Each kind is parsed in isolation, and we merge by ONLY applying a value
    # to a field that the kind owns — so bowling never overwrites batting's
    # "Inn"/"Runs" and batting never overwrites bowling's "Wkts"/"Econ".
    for table, kind in summary_tables:
        temp: dict[str, dict] = {k: _empty_format_row() for k in stats}
        _parse_transposed_table(table, temp, kind)
        for fmt_key, row in temp.items():
            for k, v in row.items():
                if _is_field_for_kind(k, kind):
                    if isinstance(v, (int, float)):
                        if v != 0:
                            stats[fmt_key][k] = v
                    else:
                        if v not in (0, "0", "-", ""):
                            stats[fmt_key][k] = v

    result = {
        "id":           cricbuzz_id,
        "name":         name or f"Player {cricbuzz_id}",
        "country":      country or "Unknown",
        "role":         role or "Batter",
        "battingStyle": batting_style or "Unknown",
        "bowlingStyle": bowling_style or "-",
        "image":        image or "",
        "stats":        stats,
        "source":       "cricbuzz.com",
        "fetchedAt":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Only cache if we got something useful
    if name:
        _cache.set(cache_key, result)
    return result


def _is_field_for_kind(field: str, kind: str) -> bool:
    """True if this stat field belongs to the batting OR bowling table."""
    batting_fields = {"Mat", "Inn", "Runs", "Avg", "SR", "HS", "100", "50"}
    bowling_fields = {"Wkts", "Econ", "BBI"}
    if kind == "batting":
        return field in batting_fields
    return field in bowling_fields


def _extract_name_country(soup: BeautifulSoup) -> tuple[str, str]:
    """
    Find the player name + country.

    Cricbuzz 2026-08 layout: the player header is rendered as
        <div>
          <span class="text-xl font-bold ...">Virat Kohli</span>
          <span>India</span>
        </div>
    There are two such blocks on the page (one above the stats, one in the
    recent-form section). We take the first one.
    """
    for span in soup.find_all("span", class_=lambda c: bool(c) and "text-xl" in c and "font-bold" in c):
        name = span.get_text(strip=True)
        if not name:
            continue
        parent = span.parent
        if not parent:
            continue
        # Country is the next sibling span/div with text
        country = ""
        for child in parent.find_all(["span", "div"], recursive=False):
            txt = child.get_text(strip=True)
            if txt and txt != name:
                country = txt
                break
        return name, country
    return "", ""


def _extract_personal_info(soup: BeautifulSoup) -> tuple[str, str, str]:
    """
    Find role, batting style, bowling style from the "Personal Information"
    block. Cricbuzz renders this as a <ul> or <div> with labels:
      Born / Birth Place / Height / Role / Batting Style / Bowling Style / Teams
    """
    role = ""
    batting_style = ""
    bowling_style = ""

    # Find a block containing "Role" — walk nearby text
    for tag in soup.find_all(string=re.compile(r"\bRole\b")):
        parent = tag.parent
        if not parent:
            continue
        # The value is often the next sibling or the parent's next text
        value = _next_text_value(parent)
        if value and value != "Role":
            role = value
            break

    for tag in soup.find_all(string=re.compile(r"\bBatting Style\b")):
        parent = tag.parent
        if not parent:
            continue
        value = _next_text_value(parent)
        if value and value != "Batting Style":
            batting_style = value
            break

    for tag in soup.find_all(string=re.compile(r"\bBowling Style\b")):
        parent = tag.parent
        if not parent:
            continue
        value = _next_text_value(parent)
        if value and value != "Bowling Style":
            bowling_style = value
            break

    return role, batting_style, bowling_style


def _next_text_value(node: Tag) -> str:
    """Find the next text sibling after `node` (or its nearest text)."""
    # Look at siblings first
    for sib in node.next_siblings:
        if isinstance(sib, Tag):
            text = sib.get_text(strip=True)
            if text:
                return text
    # Fallback: look at parent's next text
    if node.parent:
        for sib in node.parent.next_siblings:
            if isinstance(sib, Tag):
                text = sib.get_text(strip=True)
                if text:
                    return text
    return ""


def _extract_player_image(soup: BeautifulSoup) -> str:
    """Find the player headshot URL."""
    for img in soup.find_all("img"):
        src = img.get("src", "")
        if "cricbuzz" in src.lower() and "player" in src.lower():
            return src
        # Fallback: first reasonably-sized image after the h1
        if img.get("width") and int(str(img.get("width", "0")) or 0) > 100:
            return src
    return ""


def _find_career_tables(soup: BeautifulSoup) -> list[tuple[Tag, str]]:
    """
    Return the (table, kind) pairs for "Batting Career Summary" and
    "Bowling Career Summary" tables. Cricbuzz 2026-08 layout:

      - 4 <table> elements on a profile page
      - Table 0 & 3 = ICC rankings (Format | Current | Best) — ignore
      - Table 1 = Batting (~17 rows, includes "100s")
      - Table 2 = Bowling (~15 rows, includes "Wickets" and "BBI")

    We discriminate by unique stat names: "100s" only appears in the batting
    table, "Wickets" only in the bowling table.
    """
    out: list[tuple[Tag, str]] = []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 3:
            continue
        # Collect all row labels (first cell of each data row)
        labels: list[str] = []
        for row in rows[1:]:
            first_cell = row.find(["th", "td"])
            if first_cell:
                labels.append(first_cell.get_text(strip=True).lower())
        joined = " ".join(labels)
        if "100s" in joined or "centuries" in joined:
            out.append((table, "batting"))
        elif "wickets" in joined and "bbi" in joined:
            out.append((table, "bowling"))
    return out


def _parse_transposed_table(table: Tag, stats_out: dict, kind: str) -> None:
    """
    Parse a transposed career summary table.

    Layout:
      Row 0: ['', 'Test', 'ODI', 'T20', 'IPL']
      Row 1: ['Matches', 123, 314, 125, 283]
      Row 2: ['Innings', 210, 302, 117, 275]
      ...
    """
    rows = table.find_all("tr")
    if not rows:
        return
    # Format headers from row 0
    header_cells = rows[0].find_all(["th", "td"])
    formats: list[str] = []
    for cell in header_cells[1:]:  # skip the empty corner cell
        label = cell.get_text(strip=True)
        fmt_key = _map_format_label(label)
        if fmt_key and fmt_key in stats_out:
            formats.append(fmt_key)
        else:
            formats.append("")  # placeholder for unknown

    # Walk data rows: each is [stat_name, test_val, odi_val, t20_val, ipl_val]
    for row in rows[1:]:
        cells = row.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        stat_name = cells[0].get_text(strip=True).lower()
        values = [c.get_text(strip=True) for c in cells[1:]]

        for i, fmt_key in enumerate(formats):
            if not fmt_key or i >= len(values):
                continue
            target = stats_out[fmt_key]
            value = values[i]
            if kind == "batting":
                _apply_batting_stat(target, stat_name, value)
            else:
                _apply_bowling_stat(target, stat_name, value)


def _apply_batting_stat(target: dict, stat_name: str, value: str) -> None:
    if stat_name in ("matches", "match", "mat", "m"):
        target["Mat"] = _to_int(value)
    elif stat_name in ("innings", "inn", "i"):
        target["Inn"] = _to_int(value)
    elif stat_name in ("runs", "run", "r"):
        target["Runs"] = _to_int(value)
    elif stat_name in ("highest", "hs", "highest score"):
        target["HS"] = value or "0"
    elif stat_name in ("average", "avg"):
        target["Avg"] = _to_float(value)
    elif stat_name in ("sr", "strike rate", "strike_rate"):
        target["SR"] = _to_float(value)
    elif stat_name in ("50s", "50", "fifties", "fifty"):
        target["50"] = _to_int(value)
    elif stat_name in ("100s", "100", "hundreds", "hundred", "centuries"):
        target["100"] = _to_int(value)
    # Other batting stats (Not Out, Fours, Sixes, Ducks, 200s, 300s, 400s,
    # Balls) aren't part of the parser's output schema — they're interesting
    # but not needed for the battle engine. Skip intentionally.


def _apply_bowling_stat(target: dict, stat_name: str, value: str) -> None:
    if stat_name in ("matches", "match", "mat", "m"):
        target["Mat"] = _to_int(value)
    elif stat_name in ("innings", "inn", "i"):
        target["Inn"] = _to_int(value)
    elif stat_name in ("wickets", "wicket", "w", "wkts"):
        target["Wkts"] = _to_int(value)
    elif stat_name in ("econ", "economy", "eco"):
        target["Econ"] = _to_float(value)
    elif stat_name in ("bbi", "best bowling innings", "best bowling"):
        target["BBI"] = value or "-"
    # Bowling Avg, SR, Balls, Maidens, BBM, 4w, 5w, 10w: not in the
    # output schema, skip.


def _empty_format_row() -> dict:
    return {
        "Mat":  0, "Inn": 0, "Runs": 0, "Avg": 0.0, "SR": 0.0,
        "HS":   "0", "100": 0, "50": 0,
        "Wkts": 0, "Econ": 0.0, "BBI": "-",
    }


def _empty_player(cricbuzz_id: str, reason: str) -> dict:
    return {
        "id":           cricbuzz_id,
        "name":         f"Player {cricbuzz_id}",
        "country":      "Unknown",
        "role":         "Batter",
        "battingStyle": "Unknown",
        "bowlingStyle": "-",
        "image":        "",
        "stats":        {},
        "source":       "cricbuzz.com",
        "error":        reason,
        "fetchedAt":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ── get_live_matches ────────────────────────────────────────────────────────

def get_live_matches() -> list[dict]:
    cache_key = "live:matches"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    html = _http_get(_live_scores_url())
    if not html:
        return []

    soup = BeautifulSoup(html, "lxml")
    matches: list[dict] = []
    # Cricbuzz's live scores page: each match is wrapped in a div with class
    # containing "cb-mtch-lst". Inside is an anchor with class containing
    # "text-hvr-underline" whose href is the match URL.
    for match_div in soup.find_all("div", class_=re.compile(r"cb-mtch-lst")):
        anchor = match_div.find("a", class_=re.compile(r"text-hvr-underline"))
        if not anchor:
            continue
        text = anchor.get_text(strip=True)
        href = anchor.get("href", "")
        if href:
            matches.append({
                "match": text,
                "url":   _match_url(href),
            })

    # Live scores change fast — 60s cache.
    _cache.set(cache_key, matches, ttl_s=60)
    return matches


# ── get_match_scorecard ─────────────────────────────────────────────────────

def get_match_scorecard(match_url_or_id: str) -> dict:
    if match_url_or_id.isdigit():
        url = f"https://www.cricbuzz.com/live-cricket-scorecard/{match_url_or_id}"
    else:
        url = match_url_or_id

    cache_key = f"scorecard:{url}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    html = _http_get(url)
    if not html:
        return {"error": "fetch_failed", "url": url, "innings": []}

    soup = BeautifulSoup(html, "lxml")
    title_tag = soup.find("h1", class_=re.compile(r"cb-nav-hdr"))
    title = title_tag.get_text(strip=True) if title_tag else ""
    result_tag = soup.find("div", class_=re.compile(r"cb-nav-text"))
    result = result_tag.get_text(strip=True) if result_tag else ""

    innings_out: list[dict] = []
    for inning_div in soup.find_all("div", id=re.compile(r"^inning_\d+$")):
        inn: dict = {"title": "", "batting": [], "bowling": []}
        title_div = inning_div.find("div", class_=re.compile(r"cb-scrd-hdr-rw"))
        if title_div:
            inn["title"] = title_div.get_text(strip=True)

        for batsman in inning_div.find_all("div", class_=re.compile(r"cb-scrd-itms")):
            cols = batsman.find_all("div", class_=re.compile(r"cb-col"))
            if len(cols) < 7:
                continue
            player_name = cols[0].get_text(strip=True)
            if not player_name or "Extras" in player_name.lower():
                continue
            if "batter" in player_name.lower() or "batsman" in player_name.lower():
                continue
            inn["batting"].append({
                "player":    player_name,
                "dismissal": cols[1].get_text(strip=True) if len(cols) > 1 else "",
                "R":         _to_int(cols[2].get_text()) if len(cols) > 2 else 0,
                "B":         _to_int(cols[3].get_text()) if len(cols) > 3 else 0,
                "4s":        _to_int(cols[4].get_text()) if len(cols) > 4 else 0,
                "6s":        _to_int(cols[5].get_text()) if len(cols) > 5 else 0,
                "SR":        _to_float(cols[6].get_text()) if len(cols) > 6 else 0.0,
            })

        bowlers_section = inning_div.find("div", class_=re.compile(r"cb-col-bowlers"))
        if bowlers_section:
            for bowler in bowlers_section.find_all("div", class_=re.compile(r"cb-scrd-itms")):
                cols = bowler.find_all("div", class_=re.compile(r"cb-col"))
                if len(cols) < 6:
                    continue
                player_name = cols[0].get_text(strip=True)
                if not player_name or "bowler" in player_name.lower():
                    continue
                inn["bowling"].append({
                    "player": player_name,
                    "O":      cols[1].get_text(strip=True) if len(cols) > 1 else "",
                    "M":      cols[2].get_text(strip=True) if len(cols) > 2 else "",
                    "R":      _to_int(cols[3].get_text()) if len(cols) > 3 else 0,
                    "W":      _to_int(cols[4].get_text()) if len(cols) > 4 else 0,
                    "Econ":   _to_float(cols[5].get_text()) if len(cols) > 5 else 0.0,
                })

        innings_out.append(inn)

    payload = {
        "title":     title,
        "result":    result,
        "url":       url,
        "innings":   innings_out,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _cache.set(cache_key, payload)
    return payload


# ── get_live_commentary ─────────────────────────────────────────────────────

def get_live_commentary(match_id: str, limit: int = 20) -> dict:
    """
    Try Cricbuzz's JSON commentary endpoint first; fall back to HTML scraping.
    """
    api_url = f"https://www.cricbuzz.com/api/cricket-match/commentary/{match_id}"
    cache_key = f"commentary:{match_id}:{limit}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        r = requests.get(api_url, headers=HEADERS, timeout=REQUEST_TIMEOUT_S)
        if r.ok:
            data = r.json()
            if isinstance(data, dict) and data.get("commentaryList"):
                header = data.get("matchHeader", {}) or {}
                title_parts = [header.get("matchDescription", ""), header.get("status", "")]
                title = " - ".join([p for p in title_parts if p]) or None

                events: list[dict] = []
                for item in (data.get("commentaryList") or [])[: max(0, limit)]:
                    text = re.sub(r"[A-Z]\d\$", "", str(item.get("commText", ""))).strip()
                    text = re.sub(r"\s+", " ", text)
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
                    "source":    "cricbuzz-json-api",
                    "events":    events,
                    "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                _cache.set(cache_key, payload, ttl_s=30)  # live, cache briefly
                return payload
    except Exception as e:
        logger.debug(f"[scrape] JSON commentary failed for {match_id}: {e}")

    # HTML fallback
    html_url = f"https://www.cricbuzz.com/live-cricket-scorecard/{match_id}/commentary"
    html = _http_get(html_url)
    if not html:
        return {"error": "fetch_failed", "matchId": match_id, "events": []}

    soup = BeautifulSoup(html, "lxml")
    title_tag = soup.find("h1", class_=re.compile(r"cb-nav-hdr"))
    title = title_tag.get_text(strip=True) if title_tag else None

    events: list[dict] = []
    candidates = soup.find_all("div", class_=re.compile(r"cb-col\s+cb-col-90\s+cb-com-ln"))
    if not candidates:
        lst = soup.find("div", class_=re.compile(r"cb-com-lst"))
        if lst:
            candidates = lst.find_all("div", class_=re.compile(r"cb-col\s+cb-col-90"))
    for node in candidates:
        text = node.get_text(" ", strip=True)
        if not text or text.lower().startswith("commentary") or len(text) < 10:
            continue
        events.append({"text": text})
        if len(events) >= limit:
            break

    payload = {
        "title":     title,
        "source":    "cricbuzz-html",
        "matchId":   match_id,
        "events":    events,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _cache.set(cache_key, payload, ttl_s=30)
    return payload


# ── Cache introspection (for /scrape/health) ────────────────────────────────

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
