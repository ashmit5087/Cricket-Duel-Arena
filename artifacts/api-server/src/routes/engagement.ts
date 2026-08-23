import { Router, Request, Response } from "express";
import { cacheGet, cacheSet, publish, TTL, CHANNELS } from "../db/redis";
import { query } from "../db/postgres";
import { logger } from "../utils/logger";
import { PLAYER_ROSTER, computeAuraLabel, AURA_LABELS } from "../models/player";

export const engagementRouter = Router();

// ── AURA ──────────────────────────────────────────────────────────────────────

// GET /api/engagement/aura/:internalId
engagementRouter.get("/aura/:internalId", async (req: Request, res: Response) => {
  const { internalId } = req.params;
  const cacheKey = `aura:${internalId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const rows = await query(
      `SELECT ah.*, p.name FROM aura_history ah
       JOIN players p ON p.id = ah.player_id
       WHERE p.internal_id = $1
       ORDER BY ah.recorded_at DESC LIMIT 10`,
      [internalId]
    );

    // Current aura = most recent row
    const currentAura = rows[0] ?? null;
    const history = rows;

    const payload = {
      current: currentAura
        ? {
            label:      currentAura.aura_label,
            score:      parseFloat(currentAura.aura_score),
            color:      AURA_LABELS[currentAura.aura_label]?.color ?? "#888",
            reason:     currentAura.reason,
            recordedAt: currentAura.recorded_at,
          }
        : {
            label: "Rising", score: 50,
            color: AURA_LABELS["Rising"].color,
            reason: "Awaiting live data",
          },
      history: history.map((r: any) => ({
        label:      r.aura_label,
        score:      parseFloat(r.aura_score),
        recordedAt: r.recorded_at,
      })),
    };

    await cacheSet(cacheKey, payload, 300); // 5 min
    res.json(payload);
  } catch (e: any) {
    res.status(500).json({ error: "Aura fetch failed", detail: e.message });
  }
});

// GET /api/engagement/aura/leaderboard — top aura players
engagementRouter.get("/aura/leaderboard", async (_req: Request, res: Response) => {
  const cacheKey = "aura:leaderboard";
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const rows = await query(`
      SELECT DISTINCT ON (p.internal_id)
        p.internal_id, p.name, p.country, p.flag,
        ah.aura_label, ah.aura_score, ah.recorded_at
      FROM aura_history ah
      JOIN players p ON p.id = ah.player_id
      ORDER BY p.internal_id, ah.recorded_at DESC
    `);

    const ranked = rows
      .sort((a: any, b: any) => b.aura_score - a.aura_score)
      .slice(0, 10)
      .map((r: any, i: number) => ({
        rank:       i + 1,
        internalId: r.internal_id,
        name:       r.name,
        country:    r.country,
        flag:       r.flag,
        auraLabel:  r.aura_label,
        auraScore:  parseFloat(r.aura_score),
        color:      AURA_LABELS[r.aura_label]?.color ?? "#888",
      }));

    await cacheSet(cacheKey, ranked, 300);
    res.json(ranked);
  } catch (e: any) {
    res.status(500).json({ error: "Leaderboard failed", detail: e.message });
  }
});

// ── RIVALRY ───────────────────────────────────────────────────────────────────

// GET /api/engagement/rivalry/:p1Id/:p2Id
engagementRouter.get("/rivalry/:p1Id/:p2Id", async (req: Request, res: Response) => {
  const { p1Id, p2Id } = req.params;
  const cacheKey = `rivalry:${[p1Id,p2Id].sort().join("_")}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const rows = await query(
      `SELECT r.*, pa.name as p1_name, pb.name as p2_name,
              ph.name as streak_holder_name
       FROM rivalries r
       JOIN players pa ON pa.id = r.player_a_id
       JOIN players pb ON pb.id = r.player_b_id
       LEFT JOIN players ph ON ph.id = r.current_streak_holder
       WHERE (pa.internal_id = $1 AND pb.internal_id = $2)
          OR (pa.internal_id = $2 AND pb.internal_id = $1)
       LIMIT 1`,
      [p1Id, p2Id]
    );

    const rivalry = rows[0] ?? {
      battles_total: 0, player_a_wins: 0, player_b_wins: 0,
      dominance_score: 50, heat_score: 0, streak_count: 0,
    };

    const payload = {
      p1Id,
      p2Id,
      battlesTotal:    rivalry.battles_total ?? 0,
      p1Wins:          rivalry.player_a_wins ?? 0,
      p2Wins:          rivalry.player_b_wins ?? 0,
      dominanceScore:  rivalry.dominance_score ?? 50,
      heatScore:       rivalry.heat_score ?? 0,
      streakHolder:    rivalry.streak_holder_name ?? null,
      streakCount:     rivalry.streak_count ?? 0,
      lastBattleAt:    rivalry.last_battle_at ?? null,
    };

    await cacheSet(cacheKey, payload, 300);
    res.json(payload);
  } catch (e: any) {
    res.status(500).json({ error: "Rivalry fetch failed", detail: e.message });
  }
});

// GET /api/engagement/rivalry/hottest — top 5 hottest rivalries
engagementRouter.get("/rivalry/hottest", async (_req: Request, res: Response) => {
  const cacheKey = "rivalry:hottest";
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const rows = await query(`
      SELECT r.*, pa.name as p1_name, pa.flag as p1_flag,
             pb.name as p2_name, pb.flag as p2_flag
      FROM rivalries r
      JOIN players pa ON pa.id = r.player_a_id
      JOIN players pb ON pb.id = r.player_b_id
      ORDER BY r.heat_score DESC LIMIT 5
    `);

    const result = rows.map((r: any) => ({
      p1Name:       r.p1_name,
      p1Flag:       r.p1_flag,
      p2Name:       r.p2_name,
      p2Flag:       r.p2_flag,
      battlesTotal: r.battles_total,
      heatScore:    parseFloat(r.heat_score),
      dominance:    parseFloat(r.dominance_score),
    }));

    await cacheSet(cacheKey, result, 300);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: "Hottest rivalries failed", detail: e.message });
  }
});

// ── ELO RANKINGS ─────────────────────────────────────────────────────────────

// GET /api/engagement/rankings?format=overall
engagementRouter.get("/rankings", async (req: Request, res: Response) => {
  const format = (req.query.format as string) ?? "overall";
  const cacheKey = `rankings:${format}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const rows = await query(
      `SELECT er.*, p.name, p.internal_id, p.country, p.flag, p.role, p.archetype_id
       FROM elo_ratings er
       JOIN players p ON p.id = er.player_id
       WHERE er.format = $1
       ORDER BY er.rating DESC LIMIT 30`,
      [format]
    );

    const rankings = rows.map((r: any, i: number) => ({
      rank:        i + 1,
      internalId:  r.internal_id,
      name:        r.name,
      country:     r.country,
      flag:        r.flag,
      role:        r.role,
      archetypeId: r.archetype_id,
      eloRating:   parseFloat(r.rating),
      peakRating:  parseFloat(r.peak_rating),
      wins:        r.wins,
      losses:      r.losses,
    }));

    await cacheSet(cacheKey, rankings, TTL.SEARCH);
    res.json(rankings);
  } catch (e: any) {
    res.status(500).json({ error: "Rankings fetch failed", detail: e.message });
  }
});

// ── STREAKS ───────────────────────────────────────────────────────────────────

// GET /api/engagement/streaks/:internalId
engagementRouter.get("/streaks/:internalId", async (req: Request, res: Response) => {
  const { internalId } = req.params;
  try {
    const rows = await query(
      `SELECT s.* FROM streaks s
       JOIN players p ON p.id = s.player_id
       WHERE p.internal_id = $1`,
      [internalId]
    );

    const streaks = rows.reduce((acc: any, r: any) => {
      acc[r.streak_type] = {
        current:   r.current_count,
        best:      r.best_count,
        isActive:  r.is_active,
        startedAt: r.started_at,
      };
      return acc;
    }, {});

    res.json(streaks);
  } catch (e: any) {
    res.status(500).json({ error: "Streaks fetch failed", detail: e.message });
  }
});

// GET /api/engagement/streaks/active — players on active win streaks
engagementRouter.get("/streaks/active", async (_req: Request, res: Response) => {
  const cacheKey = "streaks:active";
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const rows = await query(`
      SELECT s.*, p.name, p.internal_id, p.flag
      FROM streaks s
      JOIN players p ON p.id = s.player_id
      WHERE s.streak_type = 'battle_win' AND s.is_active = true AND s.current_count >= 2
      ORDER BY s.current_count DESC LIMIT 10
    `);

    const result = rows.map((r: any) => ({
      internalId:    r.internal_id,
      name:          r.name,
      flag:          r.flag,
      streakCount:   r.current_count,
      bestStreak:    r.best_count,
      startedAt:     r.started_at,
    }));

    await cacheSet(cacheKey, result, 300);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: "Active streaks failed", detail: e.message });
  }
});
