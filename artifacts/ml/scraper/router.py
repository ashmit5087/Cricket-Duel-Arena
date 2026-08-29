"""
FastAPI router exposing the Cricbuzz scraper as HTTP endpoints.

Mounted in main.py under /scrape. Consumed by:
  • api-server's refresher worker (background, every 12h)
  • Frontend ticker (live Hero page) via api-server's /api/scrape/* proxy

These endpoints cost zero RapidAPI credits. The only network spend is on
Cricbuzz's HTML pages, which are throttled by the in-process LRU+TTL cache
and a per-request delay.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from . import cricbuzz_scrape
from .cricinfo_loader import fetch_one as cricinfo_fetch_one

logger = logging.getLogger("ml_service.scraper.router")

router = APIRouter(prefix="/scrape", tags=["scraper"])

# ── Cricbuzz ID → ESPN Cricinfo ID lookup ─────────────────────────────────────
# Populated from the PLAYER_ROSTER in api-server. Used by /scrape/cricinfo so
# the api-server can call it with a Cricbuzz player ID (the only ID it has
# during bootstrapStats) and still get ESPN Cricinfo data back.
# Add entries whenever a new player is added to PLAYER_ROSTER.

CRICBUZZ_TO_ESPN: dict[str, str] = {
    "1413":   "253802",   # Virat Kohli
    "576":    "34102",    # Rohit Sharma
    "9311":   "625371",   # Jasprit Bumrah
    "265":    "28081",    # MS Dhoni
    "25":     "35320",    # Sachin Tendulkar
    "27":     "28114",    # Rahul Dravid
    "98":     "30176",    # Anil Kumble
    "8019":   "303669",   # Joe Root
    "6326":   "277906",   # Kane Williamson
    "8359":   "348144",   # Babar Azam
    "370":    "44936",    # AB de Villiers
    "1739":   "219889",   # David Warner
    "38":     "7133",     # Ricky Ponting
    "8095":   "324418",   # Pat Cummins
    "7710":   "311631",   # Mitchell Starc
    "6557":   "311158",   # Ben Stokes
    "111":    "49536",    # Lasith Malinga
    "104":    "50710",    # Kumar Sangakkara
    "135":    "13552",    # Shane Warne
    "240":    "52337",    # Brian Lara
    "247":    "51880",    # Chris Gayle
    "1593":   "49428",    # R. Ashwin
    "587":    "234675",   # Ravindra Jadeja
    "10744":  "931581",   # Rishabh Pant
    "11808":  "1125619",  # Shubman Gill
    "14561":  "1175515",  # Haris Rauf
    "14247":  "1233557",  # Naseem Shah
    "7662":   "420889",   # Glenn Maxwell
    "7915":   None,       # Suryakumar Yadav — no ESPN ID yet
    "8497":   None,       # Travis Head — no ESPN ID yet
}


# ── ESPN Cricinfo career stats ────────────────────────────────────────────────


@router.get("/cricinfo/player-stats/{player_id}")
def get_cricinfo_player_stats(player_id: str) -> dict:
    """
    Career stats for one player from ESPN Cricinfo.

    Accepts EITHER an ESPN Cricinfo ID (e.g. '253802' for Kohli) OR a
    Cricbuzz player ID (e.g. '1413') — the latter is looked up in the
    CRICBUZZ_TO_ESPN table and translated automatically.

    The api-server's bootstrapStats/refresher calls this with a Cricbuzz ID
    (the only ID available there); the ML pipeline calls with ESPN IDs.
    """
    if not player_id or not player_id.isdigit():
        raise HTTPException(status_code=400, detail="player_id must be a numeric string")

    # Translate Cricbuzz ID → ESPN ID if needed
    espn_id = CRICBUZZ_TO_ESPN.get(player_id, player_id)
    if espn_id is None:
        raise HTTPException(status_code=404, detail=f"No ESPN Cricinfo ID known for Cricbuzz player {player_id}")

    try:
        result = cricinfo_fetch_one(espn_id)
        # Annotate with the original request ID so the caller knows which player this is
        result.setdefault("cricbuzzId", player_id)
        result.setdefault("espnId", espn_id)
        return result
    except Exception as e:
        logger.exception(f"[scrape] cricinfo player-stats failed for {player_id} (ESPN: {espn_id})")
        raise HTTPException(status_code=502, detail=f"Cricinfo scrape failed: {e}") from e



# ── Player career stats ──────────────────────────────────────────────────────


@router.get("/player-stats/{cricbuzz_id}")
def get_player_stats(cricbuzz_id: str) -> dict:
    """
    Career stats for one player, scraped from cricbuzz.com.
    Returns the same shape as the existing RapidAPI parser so downstream
    code in api-server is source-agnostic.
    """
    if not cricbuzz_id or not cricbuzz_id.isdigit():
        raise HTTPException(status_code=400, detail="cricbuzz_id must be a numeric string")

    try:
        return cricbuzz_scrape.get_player_stats(cricbuzz_id)
    except Exception as e:
        logger.exception(f"[scrape] player-stats failed for {cricbuzz_id}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}") from e


# ── Live matches ─────────────────────────────────────────────────────────────


@router.get("/live-matches")
def get_live_matches() -> dict:
    """
    Currently live matches from cricbuzz.com/live-scores.
    Cached for 60s. Powers the hero ticker.
    """
    try:
        matches = cricbuzz_scrape.get_live_matches()
        return {"count": len(matches), "matches": matches}
    except Exception as e:
        logger.exception("[scrape] live-matches failed")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}") from e


# ── Scorecard ────────────────────────────────────────────────────────────────


@router.get("/match/{match_id}/scorecard")
def get_scorecard(match_id: str) -> dict:
    """
    Full scorecard for a match (by Cricbuzz numeric id or full URL).
    """
    try:
        return cricbuzz_scrape.get_match_scorecard(match_id)
    except Exception as e:
        logger.exception(f"[scrape] scorecard failed for {match_id}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}") from e


# ── Commentary ───────────────────────────────────────────────────────────────


@router.get("/match/{match_id}/commentary")
def get_commentary(
    match_id: str,
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    """
    Recent live commentary events. Tries Cricbuzz's JSON endpoint first
    (reliable), falls back to HTML scraping.
    """
    try:
        return cricbuzz_scrape.get_live_commentary(match_id, limit=limit)
    except Exception as e:
        logger.exception(f"[scrape] commentary failed for {match_id}")
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e}") from e


# ── Health / cache introspection ─────────────────────────────────────────────


@router.get("/health")
def scrape_health() -> dict:
    """
    Liveness + cache stats. Cheap endpoint the api-server can poll to
    decide whether to use the scraper or fall back to RapidAPI.
    """
    try:
        return {
            "status":  "ok",
            "service": "cricbuzz-scraper",
            "cache":   cricbuzz_scrape.cache_stats(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/cache/clear")
def clear_cache() -> dict:
    """
    Force-clear the in-memory cache. Mainly for ops/testing.
    """
    cricbuzz_scrape._cache.clear()  # noqa: SLF001
    return {"status": "cleared"}
