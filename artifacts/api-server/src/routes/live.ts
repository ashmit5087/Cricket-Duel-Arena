import { Router, Request, Response } from "express";
import { cacheGet } from "../db/redis";
import { query } from "../db/postgres";

// ─────────────────────────────────────────────────────────────────────────────
// Live routes — DB/cache ONLY. The refresher worker (8h cadence) is the sole
// writer of match data; these endpoints never trigger external API calls.
// "Live" therefore means "as of the last snapshot refresh".
// ─────────────────────────────────────────────────────────────────────────────

export const liveRouter: Router = Router();

// GET /api/live/matches — matches known at the last refresh
liveRouter.get("/matches", async (_req: Request, res: Response) => {
  try {
    const cached = await cacheGet("live:all_matches");
    if (cached) return res.json(cached);

    const matches = await query(
      `SELECT cricbuzz_match_id AS "matchId", series_name AS "seriesName",
              match_type AS "matchType", status, team_a, team_b, venue,
              start_time AS "startTime"
         FROM matches
        WHERE status IN ('live', 'upcoming')
        ORDER BY start_time DESC NULLS LAST`
    );
    res.json(matches);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load matches", detail: e.message });
  }
});

// GET /api/live/match/:matchId — scorecard snapshot from DB innings
liveRouter.get("/match/:matchId", async (req: Request, res: Response) => {
  const { matchId } = req.params;
  try {
    const cached = await cacheGet(`live:match:${matchId}`);
    if (cached) return res.json(cached);

    const match = await query(`SELECT id FROM matches WHERE cricbuzz_match_id = $1`, [matchId]);
    if (!match[0]) return res.status(404).json({ error: "Match not in snapshot" });

    const innings = await query(
      `SELECT innings_number AS "inningsId", batting_team AS "battingTeam",
              bowling_team AS "bowlingTeam", runs, wickets, overs
         FROM innings WHERE match_id = $1 ORDER BY innings_number`,
      [match[0].id]
    );
    res.json({ matchId, innings });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to load scorecard", detail: e.message });
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
