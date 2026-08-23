import { Router, Request, Response, type IRouter } from "express";
import { getPlayerStats, searchPlayer } from "../services/cricbuzz";
import { searchCricDataPlayer, getCricDataPlayer, CricDataBudgetExceededError } from "../services/cricdata";
import { cacheGet, cacheSet, TTL, redis } from "../db/redis";
import { query } from "../db/postgres";
import { logger } from "../utils/logger";
import {
  PLAYER_ROSTER,
  emptyCareerStats,
  defaultMomentum,
  defaultAura,
  defaultBattle,
  getCricbuzzImageUrl,
  computeAuraLabel,
  AURA_LABELS,
  type NormalisedPlayer,
} from "../models/player";

export const playersRouter: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function toFrontendStats(career: import("../services/cricdata").CricDataCareerRow[], format: string) {
  const row = career.find((c) => c.format === format);
  return {
    matches:  row?.matches  ?? 0,
    runs:     row?.runs     ?? 0,
    avg:      row?.avg      ?? 0,
    sr:       row?.sr       ?? 0,
    hundreds: row?.hundreds ?? 0,
    fifties:  row?.fifties  ?? 0,
    hs:       parseInt(row?.highest?.replace("*", "") ?? "0"),
  };
}

// ── Build normalised player from DB + Cricbuzz ────────────────────────────────

async function buildNormalisedPlayer(
  internalId: string
): Promise<NormalisedPlayer | null> {
  const roster = PLAYER_ROSTER.find((p) => p.internalId === internalId);
  if (!roster) return null;

  const cacheKey = `player:full:${internalId}`;
  const cached = await cacheGet<NormalisedPlayer>(cacheKey);
  if (cached) return cached;

  // Fetch live career stats from Cricbuzz
  let liveStats = null;
  try {
    liveStats = await getPlayerStats(roster.cricbuzzPlayerId);
  } catch (e: any) {
    logger.warn("[players] Cricbuzz stats unavailable", { internalId, error: e.message });
  }

  // Parse career stats
  const getFormat = (fmt: string) =>
    liveStats?.career?.find((c) => c.format === fmt);

  const toStats = (raw: ReturnType<typeof getFormat>) => ({
    matches:  raw?.matches  ?? 0,
    innings:  raw?.innings  ?? 0,
    runs:     raw?.runs     ?? 0,
    avg:      raw?.avg      ?? 0,
    sr:       raw?.sr       ?? 0,
    hundreds: raw?.hundreds ?? 0,
    fifties:  raw?.fifties  ?? 0,
    highest:  raw?.highest  ?? "0",
    wickets:  raw?.wickets  ?? 0,
    economy:  raw?.economy  ?? 0,
    bestBowl: raw?.bestBowl ?? "-",
  });

  // Fetch ML metrics from Python service
  const ML_URL = process.env.ML_URL ?? "http://localhost:8000";
  let dnaScore    = 70;
  let radarValues = [70, 70, 70, 70, 70, 70, 70, 70];
  let auraScore   = 50;
  let eloRating   = 1500;

  try {
    const [mlCluster, mlElo] = await Promise.allSettled([
      fetch(`${ML_URL}/cluster/${roster.cricbuzzPlayerId}`).then((r) => r.json()),
      fetch(`${ML_URL}/elo/${roster.cricbuzzPlayerId}`).then((r) => r.json()),
    ]);
    if (mlCluster.status === "fulfilled") {
      dnaScore    = mlCluster.value?.dnaScore    ?? dnaScore;
      radarValues = mlCluster.value?.playerVector ?? radarValues;
    }
    if (mlElo.status === "fulfilled") {
      eloRating = mlElo.value?.rating ?? eloRating;
      auraScore = Math.min(100, Math.round((eloRating - 1000) / 10));
    }
  } catch {
    // ML not yet running — use defaults
  }

  // Fetch rivalry data from DB
  const rivalryRows = await query(
    `SELECT r.*, p.name as opponent_name
     FROM rivalries r
     JOIN players p ON p.id = CASE
       WHEN r.player_a_id = (SELECT id FROM players WHERE internal_id = $1)
         THEN r.player_b_id ELSE r.player_a_id END
     WHERE r.player_a_id = (SELECT id FROM players WHERE internal_id = $1)
        OR r.player_b_id = (SELECT id FROM players WHERE internal_id = $1)
     ORDER BY r.heat_score DESC LIMIT 3`,
    [internalId]
  ).catch(() => []);

  // Fetch streak data from DB
  const streakRow = await query(
    `SELECT * FROM streaks WHERE player_id = (SELECT id FROM players WHERE internal_id = $1)
     AND streak_type = 'battle_win' AND is_active = true LIMIT 1`,
    [internalId]
  ).catch(() => []);

  const auraLabel = computeAuraLabel(auraScore);

  const normalised: NormalisedPlayer = {
    internalId,
    cricbuzzPlayerId: roster.cricbuzzPlayerId,
    name:             liveStats?.playerName ?? roster.name,
    country:          liveStats?.country    ?? roster.country,
    flag:             roster.flag,
    role:             liveStats?.role       ?? roster.role,
    battingStyle:     liveStats?.battingStyle,
    bowlingStyle:     liveStats?.bowlingStyle,
    archetypeId:      roster.archetypeId,
    archetypeName:    roster.archetypeName,
    testStats:        toStats(getFormat("TEST")),
    odiStats:         toStats(getFormat("ODI")),
    t20Stats:         toStats(getFormat("T20I")),
    iplStats:         toStats(getFormat("IPL")),
    dnaScore,
    radarValues,
    momentum:         defaultMomentum(),
    aura: {
      label:  auraLabel,
      score:  auraScore,
      color:  AURA_LABELS[auraLabel]?.color ?? "#888",
      reason: "Based on recent form and Elo rating",
    },
    battle: {
      eloRating,
      wins:          streakRow[0]?.best_count ?? 0,
      losses:        0,
      winRate:       0,
      currentStreak: streakRow[0]?.current_count ?? 0,
      streakType:    streakRow[0]?.is_active ? "win" : "none",
    },
    topRivalries: rivalryRows.map((r: any) => ({
      opponentId:   r.opponent_name?.toLowerCase().replace(/ /g, "-") ?? "",
      opponentName: r.opponent_name ?? "Unknown",
      battlesTotal: r.battles_total,
      playerWins:   r.player_a_wins,
      dominance:    r.dominance_score,
      heatScore:    r.heat_score,
    })),
    imageUrl:   getCricbuzzImageUrl(roster.cricbuzzPlayerId),
    lastSynced: new Date().toISOString(),
  };

  await cacheSet(cacheKey, normalised, TTL.PLAYER_PROFILE);
  return normalised;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/players — full roster list
playersRouter.get("/", (_req: Request, res: Response) => {
  const list = PLAYER_ROSTER.map((p) => ({
    internalId:       p.internalId,
    cricbuzzPlayerId: p.cricbuzzPlayerId,
    name:             p.name,
    country:          p.country,
    flag:             p.flag,
    role:             p.role,
    archetypeId:      p.archetypeId,
    archetypeName:    p.archetypeName,
    imageUrl:         getCricbuzzImageUrl(p.cricbuzzPlayerId),
  }));
  res.json(list);
});

// GET /api/players/search?q=kohli
playersRouter.get("/search", async (req: Request, res: Response) => {
  const q = ((req.query.q as string) ?? "").trim();
  if (q.length < 2) return res.json([]);

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  // First search local roster
  const local = PLAYER_ROSTER
    .filter((p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.country.toLowerCase().includes(q.toLowerCase())
    )
    .slice(0, 10)
    .map((p) => ({
      internalId:       p.internalId,
      cricbuzzPlayerId: p.cricbuzzPlayerId,
      name:             p.name,
      country:          p.country,
      flag:             p.flag,
      role:             p.role,
      archetypeId:      p.archetypeId,
      imageUrl:         getCricbuzzImageUrl(p.cricbuzzPlayerId),
    }));

  // Always extend local results with live Cricbuzz search.
  let results = local;
  try {
    const cricbuzzResults = await searchPlayer(q);
    const seen = new Set(local.map((player) => player.cricbuzzPlayerId));
    const extra = cricbuzzResults
      .filter((player) => !seen.has(player.id))
      .map((player) => ({
        internalId:       player.name.toLowerCase().replace(/ /g, "-"),
        cricbuzzPlayerId: player.id,
        name:             player.name,
        country:          player.country,
        flag:             "🏏",
        role:             "Unknown",
        archetypeId:      "A",
        imageUrl:         getCricbuzzImageUrl(player.id),
      }));
    results = [...local, ...extra].slice(0, 10);
  } catch {
    // Cricbuzz search failed — return local only
  }

  await cacheSet(cacheKey, results, TTL.SEARCH);
  res.json(results);
});

// GET /api/players/:internalId — full normalised player profile
playersRouter.get("/:internalId", async (req: Request, res: Response) => {
  const { internalId } = req.params;
  try {
    const player = await buildNormalisedPlayer(internalId);
    if (!player) return res.status(404).json({ error: `Player '${internalId}' not found` });
    res.json(player);
  } catch (e: any) {
    logger.error("[players] Profile build failed", { internalId, error: e.message });
    res.status(502).json({ error: "Failed to build player profile", detail: e.message });
  }
});

// GET /api/players/:internalId/stats — career stats only (lighter endpoint)
playersRouter.get("/:internalId/stats", async (req: Request, res: Response) => {
  const { internalId } = req.params;

  // Accept both internalId ("virat-kohli") and cricbuzzPlayerId ("253802")
  const roster = PLAYER_ROSTER.find(
    (p) => p.internalId === internalId || p.cricbuzzPlayerId === internalId
  );
  if (!roster) return res.status(404).json({ error: "Player not found" });

  const cacheKey = `player:stats:${roster.internalId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  // Look up or discover CricData UUID for this player
  let cricdataId: string | null = await cacheGet<string>(`cricdata:id:${roster.internalId}`);
  if (!cricdataId) {
    try {
      const results = await searchCricDataPlayer(roster.name);
      const match = results[0];
      if (match) {
        cricdataId = match.id;
        // Cache the ID permanently
        await redis.set(`cricdata:id:${roster.internalId}`, cricdataId);
      }
    } catch (e: any) {
      if (e instanceof CricDataBudgetExceededError) {
        return res.status(429).json({ error: "Daily API budget exceeded", budgetExceeded: true });
      }
      logger.warn("[players] CricData search failed", { name: roster.name, error: e.message });
    }
  }

  if (!cricdataId) {
    return res.status(404).json({ error: "Player not found in CricData" });
  }

  try {
    const player = await getCricDataPlayer(cricdataId);
    const normalized = {
      cricInfoId:  roster.cricbuzzPlayerId,
      name:        player.name,
      country:     player.country,
      role:        player.role,
      age:         0,
      testStats:   toFrontendStats(player.career, "TEST"),
      odiStats:    toFrontendStats(player.career, "ODI"),
      t20Stats:    toFrontendStats(player.career, "T20I"),
      iplStats:    toFrontendStats(player.career, "IPL"),
      recentForm:  [],
    };
    await cacheSet(cacheKey, normalized, TTL.CAREER_STATS);
    res.json(normalized);
  } catch (e: any) {
    if (e instanceof CricDataBudgetExceededError) {
      return res.status(429).json({ error: "Daily API budget exceeded", budgetExceeded: true });
    }
    logger.error("[players] Stats fetch failed", { internalId, error: e.message });
    res.status(502).json({ error: "Stats fetch failed", detail: e.message });
  }
});

// GET /api/players/:internalId/momentum — live momentum from Redis
playersRouter.get("/:internalId/momentum", async (req: Request, res: Response) => {
  const { internalId } = req.params;
  const cached = await cacheGet(`player:momentum:${internalId}`);
  res.json(cached ?? defaultMomentum());
});
