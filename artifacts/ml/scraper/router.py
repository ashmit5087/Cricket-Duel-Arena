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

logger = logging.getLogger("ml_service.scraper.router")

router = APIRouter(prefix="/scrape", tags=["scraper"])


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
