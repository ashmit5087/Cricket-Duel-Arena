"""
Cricket DNA ML Service — FastAPI surface matching the existing Express contract.

Endpoints:
  GET  /health              — liveness check
  GET  /algorithms          — available ML algorithms for the UI
  POST /battle/predict      — multi-algorithm battle prediction
  GET  /cluster/{playerId}  — player archetype/DNA score (stub)
  GET  /elo/{playerId}      — player Elo rating (stub)
  POST /momentum/live       — live momentum update (stub)
"""

import os
import logging
import asyncio
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from battle_engine import (
    BattleEngine,
    PlayerFeatures,
    Algorithm,
    ALGORITHM_INTUITION,
)
from roster_client import fetch_roster, build_features_from_stats

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml_service")

# ── Global state ─────────────────────────────────────────────────────────────

engine: Optional[BattleEngine] = None


async def refresh_engine():
    """Fetch roster and (re)build the BattleEngine."""
    global engine
    roster = await fetch_roster(force=True)
    if engine is None:
        engine = BattleEngine(roster)
    else:
        engine.update_roster(roster)
    logger.info(f"Engine refreshed with {len(roster)} players")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: build the engine from the live roster."""
    try:
        await refresh_engine()
    except Exception as e:
        logger.warning(f"Initial roster fetch failed (will retry on first request): {e}")
        # Start with fallback roster
        from roster_client import _build_fallback_roster
        global engine
        engine = BattleEngine(_build_fallback_roster())
    yield


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Cricket DNA ML Service",
    description="Multi-algorithm battle prediction engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request/Response models ──────────────────────────────────────────────────

class BattleRequest(BaseModel):
    p1Id: str
    p2Id: str
    algorithms: list[str] = ["xgboost", "random_forest"]
    # Optional: direct stat overrides (used when Express sends stats inline)
    p1Stats: Optional[dict] = None
    p2Stats: Optional[dict] = None


class AlgorithmInfo(BaseModel):
    id: str
    description: str


class BattleAlgorithmResult(BaseModel):
    algorithm: str
    predicted_winner: str
    confidence: float
    intuition: str


class JudgeResult(BaseModel):
    recommended_algorithm: str
    recommended_winner: str
    agreement_rate: float
    reasoning: str


class BattleResponse(BaseModel):
    dnaSimilarity: float
    predictedWinner: str
    confidence: float
    momentumP1: float
    momentumP2: float
    xgboostScore: Optional[float] = None
    algorithms: list[dict]
    judge: dict


class MomentumRequest(BaseModel):
    matchId: str
    liveState: dict


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "cricket-dna-ml",
        "engine_ready": engine is not None,
        "roster_size": len(engine.roster_features) if engine else 0,
    }


@app.get("/algorithms", response_model=list[AlgorithmInfo])
def list_algorithms():
    """Powers the Battle Configuration UI's algorithm picker cards."""
    return [
        AlgorithmInfo(id=a.value, description=ALGORITHM_INTUITION[a])
        for a in Algorithm
    ]


@app.post("/battle/predict", response_model=BattleResponse)
async def predict_battle(req: BattleRequest):
    """
    Multi-algorithm battle prediction.
    Backward compatible: old callers without `algorithms` field get
    xgboost + random_forest by default.
    """
    global engine

    if engine is None:
        await refresh_engine()
    if engine is None:
        raise HTTPException(503, "ML engine not initialized")

    # Parse requested algorithms
    try:
        algos = [Algorithm(a) for a in req.algorithms]
    except ValueError as e:
        raise HTTPException(
            400,
            f"Unknown algorithm id: {e}. GET /algorithms for valid options."
        )

    if len(algos) < 2:
        raise HTTPException(400, "Select at least 2 algorithms to run a comparison.")

    # Build features for the two players
    p1_features = _resolve_player_features(req.p1Id, req.p1Stats)
    p2_features = _resolve_player_features(req.p2Id, req.p2Stats)

    try:
        verdict = engine.run_battle(req.p1Id, p1_features, req.p2Id, p2_features, algos)
    except Exception as e:
        logger.error(f"Battle engine error: {e}")
        raise HTTPException(500, f"Battle computation failed: {str(e)}")

    # Find XGBoost score if present
    xgboost_score = None
    for r in verdict.algorithm_results:
        if r.algorithm == Algorithm.XGBOOST.value:
            xgboost_score = r.confidence
            break

    # Top confidence for backward compat
    top = max(verdict.algorithm_results, key=lambda r: r.confidence)

    return BattleResponse(
        dnaSimilarity=verdict.dna_similarity,
        predictedWinner=verdict.judge_recommendation.recommended_winner,
        confidence=top.confidence,
        momentumP1=verdict.momentum_p1,
        momentumP2=verdict.momentum_p2,
        xgboostScore=xgboost_score,
        algorithms=[{
            "algorithm": r.algorithm,
            "predicted_winner": r.predicted_winner,
            "confidence": r.confidence,
            "intuition": r.intuition,
        } for r in verdict.algorithm_results],
        judge={
            "recommended_algorithm": verdict.judge_recommendation.recommended_algorithm,
            "recommended_winner": verdict.judge_recommendation.recommended_winner,
            "agreement_rate": verdict.judge_recommendation.agreement_rate,
            "reasoning": verdict.judge_recommendation.reasoning,
        },
    )


def _resolve_player_features(
    player_id: str,
    inline_stats: Optional[dict] = None,
) -> PlayerFeatures:
    """
    Resolve PlayerFeatures for a player. Priority:
    1. Inline stats from the request (Express sends these when it has live data)
    2. Cached roster features
    3. Default fallback
    """
    if inline_stats:
        return build_features_from_stats(
            odi_stats=inline_stats.get("odiStats"),
            test_stats=inline_stats.get("testStats"),
            t20_stats=inline_stats.get("t20Stats"),
            ipl_stats=inline_stats.get("iplStats"),
            dna_score=float(inline_stats.get("dnaScore", 50)),
            momentum_score=float(inline_stats.get("momentumScore", 50)),
            clutch_score=float(inline_stats.get("clutchScore", 50)),
        )

    if engine and player_id in engine.roster_features:
        return engine.roster_features[player_id]

    # Fallback: default features
    return PlayerFeatures(
        avg=30, strike_rate=75, hundreds=5, fifties=15,
        matches=100, economy=0, wickets=0,
        dna_score=50, momentum_score=50, clutch_score=50,
    )


# ── Stubs for endpoints already called by api-server ─────────────────────────

@app.get("/cluster/{player_id}")
def get_cluster(player_id: str):
    """Player archetype/DNA score. Stub until full K-Means pipeline is built."""
    features = _resolve_player_features(player_id)
    return {
        "playerId": player_id,
        "dnaScore": features.dna_score,
        "playerVector": [
            features.avg, features.strike_rate, features.hundreds,
            features.fifties, features.matches, features.economy,
            features.wickets, features.dna_score,
        ],
        "archetypeId": "A",
        "archetypeName": "The Pressure Architect",
    }


@app.get("/elo/{player_id}")
def get_elo(player_id: str):
    """Player Elo rating. Stub returning a default rating."""
    return {
        "playerId": player_id,
        "rating": 1500,
        "format": "overall",
    }


@app.post("/momentum/live")
def momentum_live(req: MomentumRequest):
    """Live momentum update from the poller. Stub — acknowledged but not processed."""
    return {"status": "acknowledged", "matchId": req.matchId}


# ── Roster refresh endpoint ──────────────────────────────────────────────────

@app.post("/admin/refresh-roster")
async def admin_refresh():
    """Force a roster refresh (useful for development)."""
    await refresh_engine()
    return {
        "status": "refreshed",
        "roster_size": len(engine.roster_features) if engine else 0,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
