# ml/scraper.py
"""
Fetches player career stats from ESPN Cricinfo for the ML pipeline.
Saves to ml/data/raw_profiles.json — consumed by features.py.

Run once at startup if no cached data exists.
Run weekly via cron to keep data fresh.
"""

import requests
import json
import os
import time
from typing import Dict, Any, Optional

from features import PLAYER_BASE

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

RAW_PROFILES_PATH = os.path.join(DATA_DIR, "raw_profiles.json")

BASE = "https://hs-consumer-api.espncricinfo.com/v1/pages/player"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.espncricinfo.com/",
}


def _fetch(url: str, timeout: int = 10) -> Optional[dict]:
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  [fetch] FAILED {url}: {e}")
        return None


def _parse_career_row(row: dict, stat: str) -> dict:
    """Extract batting or bowling stats from one career row."""
    data = row.get(stat, {}) or {}
    return {
        "matches":  int(data.get("matches", 0) or 0),
        "runs":     int(data.get("runs", 0) or 0),
        "avg":      float(data.get("average", 0) or 0),
        "sr":       float(data.get("strikeRate", 0) or 0),
        "hundreds": int(data.get("hundreds", 0) or 0),
        "fifties":  int(data.get("fifties", 0) or 0),
        "hs":       str(data.get("highestScore", "0") or "0"),
        "wickets":  int(data.get("wickets", 0) or 0),
        "economy":  float(data.get("economy", 0) or 0),
        "bbm":      str(data.get("bestBowlingMatch", "") or ""),
    }


def fetch_one(cric_id: str) -> dict:
    """Fetch and parse one player's career stats from Cricinfo."""
    print(f"  Fetching {PLAYER_BASE.get(cric_id, {}).get('name', cric_id)} ({cric_id})...")

    batting_data = _fetch(f"{BASE}/career?playerId={cric_id}&type=batting")
    time.sleep(0.4)  # be polite
    bowling_data = _fetch(f"{BASE}/career?playerId={cric_id}&type=bowling")
    time.sleep(0.4)

    profile = {
        "cricInfoId": cric_id,
        "name":       PLAYER_BASE.get(cric_id, {}).get("name", "Unknown"),
        "role":       PLAYER_BASE.get(cric_id, {}).get("role", "batter"),
        "testStats":  {"matches":0,"runs":0,"avg":0,"sr":0,"hundreds":0,"fifties":0,"hs":"0"},
        "odiStats":   {"matches":0,"runs":0,"avg":0,"sr":0,"hundreds":0,"fifties":0,"hs":"0"},
        "t20Stats":   {"matches":0,"runs":0,"avg":0,"sr":0,"hundreds":0,"fifties":0,"hs":"0"},
        "iplStats":   {"matches":0,"runs":0,"avg":0,"sr":0,"hundreds":0,"fifties":0,"hs":"0"},
    }

    # matchType.id: 1=Test, 2=ODI, 3=T20I, 62=IPL
    FORMAT_MAP = {1: "testStats", 2: "odiStats", 3: "t20Stats", 62: "iplStats"}

    for dataset, stat_key in [(batting_data, "batting"), (bowling_data, "bowling")]:
        if not dataset:
            continue
        rows = dataset.get("content", {}).get("career", [])
        for row in rows:
            mt_id = row.get("matchType", {}).get("id")
            fmt = FORMAT_MAP.get(mt_id)
            if fmt:
                parsed = _parse_career_row(row, stat_key)
                # Merge: batting stats take priority for batters, bowling for bowlers
                existing = profile[fmt]
                if parsed["matches"] > existing.get("matches", 0):
                    profile[fmt].update(parsed)

    return profile


def load_or_fetch_all(force_refresh: bool = False) -> Dict[str, dict]:
    """
    Load cached profiles from disk, or fetch from Cricinfo if missing/stale.
    Returns { cricInfoId: profile_dict }
    """
    if os.path.exists(RAW_PROFILES_PATH) and not force_refresh:
        with open(RAW_PROFILES_PATH) as f:
            profiles = json.load(f)
        print(f"[scraper] Loaded {len(profiles)} cached profiles from disk")
        return profiles

    print(f"[scraper] Fetching {len(PLAYER_BASE)} players from Cricinfo...")
    profiles = {}

    for i, cric_id in enumerate(PLAYER_BASE.keys()):
        profile = fetch_one(cric_id)
        profiles[cric_id] = profile
        # Save progress every 10 players in case of failure
        if (i + 1) % 10 == 0:
            _save(profiles)
            print(f"  [progress] {i+1}/{len(PLAYER_BASE)} saved")

    _save(profiles)
    print(f"[scraper] Complete. {len(profiles)} profiles saved.")
    return profiles


def _save(profiles: dict):
    with open(RAW_PROFILES_PATH, "w") as f:
        json.dump(profiles, f, indent=2)


if __name__ == "__main__":
    import sys
    force = "--refresh" in sys.argv
    load_or_fetch_all(force_refresh=force)
