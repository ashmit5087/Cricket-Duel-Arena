# ml/main.py
"""
FastAPI ML microservice — runs on port 8000.
The Express API server proxies to this.

Startup sequence:
  1. Try to load pre-fitted pipeline from disk (fast)
  2. If no disk cache → scrape Cricinfo → build vectors → fit models (slow, ~2-3 min first run)
  3. All endpoints are ready once startup completes

Start: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import os
import time

from scraper import load_or_fetch_all
from features import build_all_vectors, FEATURE_COLS
from pipeline import pipeline, ARCHETYPE_LABELS
from scraper.router import router as scraper_router
from keep_alive import start_keep_alive, stop_keep_alive

# ─── Lifespan (replaces deprecated on_event) ──────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run the ML pipeline at startup."""
    print("\n[startup] Cricket DNA ML Service starting...")
    t0 = time.time()

    # Try loading from disk first (instant)
    loaded = pipeline.load()

    if not loaded:
        print("[startup] No cached pipeline — running full fit (this takes ~2-3 min)...")
        # Run blocking work in a thread so we don't block the event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _fit_pipeline)

    print(f"[startup] Ready in {time.time()-t0:.1f}s — {len(pipeline.player_index)} players loaded\n")
    start_keep_alive()
    yield
    stop_keep_alive()
    print("[shutdown] ML service stopped")


def _fit_pipeline():
    """Blocking: fetch data + build vectors + fit all models."""
    profiles = load_or_fetch_all()
    df = build_all_vectors(profiles)
    pipeline.fit(df)


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Cricket DNA ML Service",
    description="K-Means clustering, DBSCAN outlier detection, KNN twin search, t-SNE constellation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Only the api-server (and local dev origins) should call the ML service
    # directly. The previous config mixed explicit origins with "*", which
    # is redundant at best (the wildcard already allows everything) and
    # actively wrong if credentials are ever turned on, since FastAPI/browsers
    # reject "*" combined with allow_credentials=True. Kept explicit so a
    # future credentialed call doesn't silently break.
    allow_origins=[
        "http://localhost:3001",
        "http://localhost:5173",
        os.environ.get("FRONTEND_URL", ""),
        os.environ.get("API_SERVER_URL", ""),
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Scraper router (replaces RapidAPI for career stats) ─────────────────────
# Mounted under /scrape. See scraper/router.py for the endpoint list.
# This router is the source-of-truth for player career stats, used by
# api-server's refresher worker (every 12h) and the frontend Hero ticker.
app.include_router(scraper_router)


def _check_ready():
    if not pipeline.fitted:
        raise HTTPException(status_code=503, detail="ML pipeline still initializing — try again in 30s")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok" if pipeline.fitted else "initializing",
        "players": len(pipeline.player_index),
        "fitted": pipeline.fitted,
    }


# ─── KNN — DNA twin search ────────────────────────────────────────────────────

@app.get("/knn/{player_id}")
def get_knn(player_id: str, k: int = Query(default=5, ge=1, le=20)):
    """
    Returns top-k DNA twins for a player.
    player_id: ESPN Cricinfo ID (e.g. "253802" for Kohli)
    """
    _check_ready()
    player_id = str(player_id)
    twins = pipeline.get_twins(player_id, k=k)
    if not twins and player_id not in pipeline.player_index:
        raise HTTPException(status_code=404, detail=f"Player {player_id} not in pipeline")

    # Find the player's own data
    rows = pipeline.df[pipeline.df["cricInfoId"] == player_id]
    if rows.empty:
        raise HTTPException(status_code=404, detail=f"Player {player_id} not found")

    row = rows.iloc[0]
    return {
        "player": {
            "cricInfoId":  player_id,
            "id":          row.get("id", player_id),
            "name":        row["name"],
            "archetypeId": row["archetype_id"],
            "archetype":   ARCHETYPE_LABELS.get(row["archetype_id"], {}).get("name", ""),
        },
        "twins": twins,
    }


# ─── Similarity between two players ──────────────────────────────────────────

@app.get("/similarity")
def get_similarity(p1: str = Query(...), p2: str = Query(...)):
    """
    Direct DNA similarity score between two players.
    Used by the Express battle route.
    """
    _check_ready()
    score = pipeline.get_similarity(str(p1), str(p2))
    if score < 0:
        raise HTTPException(status_code=404, detail="One or both players not found")
    return {"p1": p1, "p2": p2, "similarity": score}


# ─── Cluster assignment ───────────────────────────────────────────────────────

@app.get("/cluster/{player_id}")
def get_cluster(player_id: str):
    """Returns the archetype cluster assignment for a player."""
    _check_ready()
    player_id = str(player_id)
    rows = pipeline.df[pipeline.df["cricInfoId"] == player_id]
    if rows.empty:
        raise HTTPException(status_code=404, detail=f"Player {player_id} not found")

    row = rows.iloc[0]
    arch_id = row["archetype_id"]
    centroid_cols = FEATURE_COLS[:8]  # first 8 dims = the radar axes
    centroid = pipeline.df[pipeline.df["archetype_id"] == arch_id][centroid_cols].mean().tolist()

    return {
        "cricInfoId":   player_id,
        "archetypeId":  arch_id,
        "archetype":    ARCHETYPE_LABELS.get(arch_id, {}).get("name", ""),
        "color":        ARCHETYPE_LABELS.get(arch_id, {}).get("color", "#888"),
        "isOutlier":    bool(row.get("is_outlier", False)),
        "centroid":     [round(v, 1) for v in centroid],
        "playerVector": [round(float(row[c]), 1) for c in FEATURE_COLS[:8]],
        "dnaScore":     round(float(row["dim_19"]), 1),
    }


# ─── All clusters ─────────────────────────────────────────────────────────────

@app.get("/clusters")
def get_clusters():
    """All 8 archetype definitions with real K-Means centroid values."""
    _check_ready()
    return pipeline.get_clusters()


# ─── Constellation — t-SNE coordinates ───────────────────────────────────────

@app.get("/constellation")
def get_constellation():
    """
    All players with real t-SNE x,y coordinates.
    Replaces the hardcoded x,y in mockData.ts.
    """
    _check_ready()
    return pipeline.get_constellation()


# ─── Refit endpoint (call from weekly cron) ───────────────────────────────────

@app.post("/refit")
async def refit(force_scrape: bool = False):
    """
    Trigger a full pipeline refit.
    POST /refit           → use cached Cricinfo data, refit models
    POST /refit?force_scrape=true → re-scrape Cricinfo + refit
    Used by GitHub Actions weekly cron.
    """
    loop = asyncio.get_event_loop()

    async def _run():
        profiles = load_or_fetch_all(force_refresh=force_scrape)
        df = build_all_vectors(profiles)
        pipeline.fit(df)

    asyncio.create_task(_run())
    return {"status": "refit started", "force_scrape": force_scrape}


# ─── Debug: list all players in pipeline ─────────────────────────────────────

@app.get("/players")
def list_players():
    """Lists all players currently in the fitted pipeline."""
    _check_ready()
    return [
        {
            "cricInfoId":  row["cricInfoId"],
            "name":        row["name"],
            "archetypeId": row["archetype_id"],
            "isOutlier":   bool(row.get("is_outlier", False)),
            "dnaScore":    round(float(row["dim_19"]), 1),
        }
        for _, row in pipeline.df.iterrows()
    ]


# ─── 6-Model Battle Prediction ────────────────────────────────────────────────

from pydantic import BaseModel
from typing import List, Optional, Any

class CareerRow(BaseModel):
    format: str
    matches: int = 0
    innings: int = 0
    runs: int = 0
    avg: float = 0
    sr: float = 0
    hundreds: int = 0
    fifties: int = 0
    highest: str = "0"
    wickets: int = 0
    economy: float = 0
    bestBowl: str = "-"

class BattlePredictRequest(BaseModel):
    p1: str                                # ESPN Cricinfo ID
    p2: str
    name1: Optional[str] = ""
    name2: Optional[str] = ""
    p1Career: Optional[List[CareerRow]] = None
    p2Career: Optional[List[CareerRow]] = None


@app.post("/battle-predict")
def battle_predict(req: BattlePredictRequest):
    """
    Run 6 independent ML models for a player vs player battle.

    Returns per-model verdicts + judge summary with agreement rate.

    Called by the Express api-server's battle route to populate
    the algorithmVerdicts field in the battle response.

    p1/p2: ESPN Cricinfo IDs (must be in the fitted pipeline).
    p1Career/p2Career: career stats arrays from Postgres (used by
    the Statistical Composite model; other 5 models use only pipeline data).
    """
    _check_ready()
    career1 = [r.model_dump() for r in req.p1Career] if req.p1Career else None
    career2 = [r.model_dump() for r in req.p2Career] if req.p2Career else None
    result = pipeline.predict_battle(
        id1=req.p1, id2=req.p2,
        career1=career1, career2=career2,
        name1=req.name1 or "", name2=req.name2 or "",
    )
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result
