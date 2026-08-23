"""
Roster client — fetches live player data from the Express backend
and maps CareerStats into PlayerFeatures for z-score normalization.
"""

import time
import logging
from typing import Optional
import httpx
from battle_engine import PlayerFeatures

logger = logging.getLogger("ml_service.roster_client")

# Express backend base URL
API_BASE = "http://localhost:3001"

# Cache: refreshed every 6 hours
_roster_cache: dict[str, PlayerFeatures] = {}
_roster_cache_time: float = 0
CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours


def _map_career_stats_to_features(player: dict) -> PlayerFeatures:
    """
    Maps a player's career stats from the Express API response into
    the identity-blind PlayerFeatures used by the ML engine.
    Only numeric stats are included — name, country, ID are excluded.
    """
    # Prefer ODI stats as the primary format, fall back to T20 then Test
    def get_stats(format_key: str) -> dict:
        """Get stats for a format, returning zeros if not present."""
        stats = player.get(f"{format_key}Stats", {})
        if not stats or not isinstance(stats, dict):
            return {}
        return stats

    odi = get_stats("odi")
    t20 = get_stats("t20")
    test = get_stats("test")
    ipl = get_stats("ipl")

    # Composite avg: weighted average across formats the player has played
    avg_values = []
    weights = []
    for stats, weight in [(odi, 1.0), (test, 0.8), (t20, 0.7), (ipl, 0.5)]:
        a = stats.get("avg", 0) or 0
        if a > 0:
            avg_values.append(float(a))
            weights.append(weight)

    composite_avg = (
        sum(a * w for a, w in zip(avg_values, weights)) / sum(weights)
        if weights else 0
    )

    # Composite strike rate
    sr_values = []
    for stats in [odi, t20, ipl]:
        sr = stats.get("sr", 0) or 0
        if sr > 0:
            sr_values.append(float(sr))
    composite_sr = sum(sr_values) / len(sr_values) if sr_values else 0

    # Aggregate counts
    total_hundreds = sum(
        (s.get("hundreds", 0) or 0) for s in [odi, test, t20, ipl]
    )
    total_fifties = sum(
        (s.get("fifties", 0) or 0) for s in [odi, test, t20, ipl]
    )
    total_matches = sum(
        (s.get("matches", 0) or 0) for s in [odi, test, t20, ipl]
    )
    total_wickets = sum(
        (s.get("wickets", 0) or 0) for s in [odi, test, t20, ipl]
    )

    # Economy: bowling economy averaged across formats
    eco_values = []
    for stats in [odi, t20, ipl]:
        e = stats.get("economy", 0) or 0
        if e > 0:
            eco_values.append(float(e))
    composite_economy = sum(eco_values) / len(eco_values) if eco_values else 0

    # DNA score and momentum/clutch from ML-computed fields (defaults if absent)
    dna_score = float(player.get("dnaScore", 50) or 50)
    momentum_score = float(
        player.get("momentum", {}).get("score", 50) if isinstance(player.get("momentum"), dict) else 50
    )
    clutch_score = float(
        player.get("momentum", {}).get("clutchScore", 50) if isinstance(player.get("momentum"), dict) else 50
    )

    return PlayerFeatures(
        avg=composite_avg,
        strike_rate=composite_sr,
        hundreds=float(total_hundreds),
        fifties=float(total_fifties),
        matches=float(total_matches),
        economy=composite_economy,
        wickets=float(total_wickets),
        dna_score=dna_score,
        momentum_score=momentum_score,
        clutch_score=clutch_score,
    )


async def fetch_roster(force: bool = False) -> dict[str, PlayerFeatures]:
    """
    Fetches the full player roster from the Express backend and maps
    each player into PlayerFeatures. Cached for 6 hours.
    """
    global _roster_cache, _roster_cache_time

    if not force and _roster_cache and (time.time() - _roster_cache_time) < CACHE_TTL_SECONDS:
        return _roster_cache

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # First get the roster list
            resp = await client.get(f"{API_BASE}/api/players")
            resp.raise_for_status()
            players = resp.json()

            roster: dict[str, PlayerFeatures] = {}

            # For each player, try to get their full profile with stats
            for player in players:
                internal_id = player.get("internalId", "")
                if not internal_id:
                    continue

                try:
                    profile_resp = await client.get(
                        f"{API_BASE}/api/players/{internal_id}"
                    )
                    if profile_resp.status_code == 200:
                        full_player = profile_resp.json()
                        roster[internal_id] = _map_career_stats_to_features(full_player)
                    else:
                        # Use basic data from the roster listing
                        roster[internal_id] = PlayerFeatures(
                            avg=0, strike_rate=0, hundreds=0, fifties=0,
                            matches=0, economy=0, wickets=0,
                            dna_score=50, momentum_score=50, clutch_score=50,
                        )
                except Exception as e:
                    logger.warning(f"Failed to fetch profile for {internal_id}: {e}")
                    roster[internal_id] = PlayerFeatures(
                        avg=0, strike_rate=0, hundreds=0, fifties=0,
                        matches=0, economy=0, wickets=0,
                        dna_score=50, momentum_score=50, clutch_score=50,
                    )

            if roster:
                _roster_cache = roster
                _roster_cache_time = time.time()
                logger.info(f"Roster refreshed: {len(roster)} players loaded")
            else:
                logger.warning("Roster fetch returned no players, using fallback")
                roster = _build_fallback_roster()
                _roster_cache = roster
                _roster_cache_time = time.time()

            return roster

    except Exception as e:
        logger.error(f"Failed to fetch roster from Express backend: {e}")
        if _roster_cache:
            logger.info("Using stale roster cache")
            return _roster_cache
        logger.info("Building fallback roster")
        fallback = _build_fallback_roster()
        _roster_cache = fallback
        _roster_cache_time = time.time()
        return fallback


def _build_fallback_roster() -> dict[str, PlayerFeatures]:
    """
    Fallback roster with representative stats for normalization baseline
    when the Express backend is unreachable. These are approximate and
    only used to prevent division-by-zero — real stats replace them
    once the backend comes online.
    """
    players = {
        "virat-kohli":      PlayerFeatures(avg=57.3, strike_rate=93.2, hundreds=80, fifties=72, matches=500, economy=0, wickets=4, dna_score=95, momentum_score=70, clutch_score=85),
        "rohit-sharma":     PlayerFeatures(avg=48.6, strike_rate=89.5, hundreds=49, fifties=68, matches=450, economy=0, wickets=1, dna_score=90, momentum_score=65, clutch_score=72),
        "sachin-tendulkar": PlayerFeatures(avg=53.8, strike_rate=86.2, hundreds=100, fifties=114, matches=664, economy=5.1, wickets=201, dna_score=98, momentum_score=50, clutch_score=80),
        "ms-dhoni":         PlayerFeatures(avg=50.6, strike_rate=87.6, hundreds=16, fifties=84, matches=538, economy=0, wickets=1, dna_score=88, momentum_score=50, clutch_score=95),
        "joe-root":         PlayerFeatures(avg=50.1, strike_rate=56.8, hundreds=35, fifties=60, matches=350, economy=0, wickets=50, dna_score=82, momentum_score=60, clutch_score=70),
        "kane-williamson":  PlayerFeatures(avg=47.5, strike_rate=52.1, hundreds=32, fifties=40, matches=300, economy=0, wickets=30, dna_score=80, momentum_score=55, clutch_score=75),
        "babar-azam":       PlayerFeatures(avg=48.8, strike_rate=88.4, hundreds=33, fifties=45, matches=280, economy=0, wickets=0, dna_score=83, momentum_score=60, clutch_score=68),
        "ab-de-villiers":   PlayerFeatures(avg=50.7, strike_rate=101.1, hundreds=44, fifties=70, matches=400, economy=0, wickets=7, dna_score=92, momentum_score=50, clutch_score=88),
        "ben-stokes":       PlayerFeatures(avg=36.7, strike_rate=70.2, hundreds=12, fifties=30, matches=250, economy=5.8, wickets=200, dna_score=78, momentum_score=65, clutch_score=90),
        "jasprit-bumrah":   PlayerFeatures(avg=8.5, strike_rate=55.0, hundreds=0, fifties=0, matches=150, economy=4.2, wickets=350, dna_score=85, momentum_score=75, clutch_score=82),
    }
    return players


def build_features_from_stats(
    odi_stats: Optional[dict] = None,
    test_stats: Optional[dict] = None,
    t20_stats: Optional[dict] = None,
    ipl_stats: Optional[dict] = None,
    dna_score: float = 50,
    momentum_score: float = 50,
    clutch_score: float = 50,
) -> PlayerFeatures:
    """
    Build PlayerFeatures from raw format-specific stat dicts.
    Used when constructing features for a specific battle request
    where individual format stats are provided directly.
    """
    player_data = {
        "odiStats": odi_stats or {},
        "testStats": test_stats or {},
        "t20Stats": t20_stats or {},
        "iplStats": ipl_stats or {},
        "dnaScore": dna_score,
        "momentum": {"score": momentum_score, "clutchScore": clutch_score},
    }
    return _map_career_stats_to_features(player_data)
