import { Router, Request, Response } from "express";
import { getLiveMatches, getMatchScorecard, getLiveCommentary } from "../services/cricbuzz";
import { cacheGet, cacheSet, TTL } from "../db/redis";
import { query } from "../db/postgres";
import { logger } from "../utils/logger";

export const liveRouter = Router();

// GET /api/live/matches — all currently live matches
liveRouter.get("/matches", async (_req: Request, res: Response) => {
  const cacheKey = "live:all_matches";
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const matches = await getLiveMatches();
    await cacheSet(cacheKey, matches, TTL.LIVE_MATCH);
    res.json(matches);
  } catch (e: any) {
    logger.error("[live] Failed to fetch live matches", { error: e.message });
    res.status(502).json({ error: "Failed to fetch live matches", detail: e.message });
  }
});

// GET /api/live/match/:matchId — full scorecard
liveRouter.get("/match/:matchId", async (req: Request, res: Response) => {
  const { matchId } = req.params;
  const cacheKey = `live:match:${matchId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const scorecard = await getMatchScorecard(matchId);
    await cacheSet(cacheKey, scorecard, TTL.LIVE_MATCH);
    res.json(scorecard);
  } catch (e: any) {
    logger.error("[live] Scorecard fetch failed", { matchId, error: e.message });
    res.status(502).json({ error: "Scorecard fetch failed", detail: e.message });
  }
});

// GET /api/live/match/:matchId/commentary — latest commentary
liveRouter.get("/match/:matchId/commentary", async (req: Request, res: Response) => {
  const { matchId } = req.params;
  const cacheKey = `live:commentary:${matchId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const commentary = await getLiveCommentary(matchId);
    await cacheSet(cacheKey, commentary, TTL.LIVE_MATCH);
    res.json(commentary);
  } catch (e: any) {
    logger.error("[live] Commentary fetch failed", { matchId, error: e.message });
    res.status(502).json({ error: "Commentary fetch failed", detail: e.message });
  }
});

// GET /api/live/history — recent completed matches from DB
liveRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? "10");
    const matches = await query(
      `SELECT * FROM matches WHERE status = 'completed'
       ORDER BY updated_at DESC LIMIT $1`,
      [limit]
    );
    res.json(matches);
  } catch (e: any) {
    res.status(500).json({ error: "DB query failed", detail: e.message });
  }
});
