import { Router, Request, Response, type IRouter } from "express";
import { getPlayerStats } from "../services/cricbuzz";
import { searchPlayer } from "../services/cricbuzz";
import { getCricDataPlayer, searchCricDataPlayer, CricDataBudgetExceededError } from "../services/cricdata";
import { cacheGet, cacheSet, publish, TTL, CHANNELS, redis } from "../db/redis";
import { query, transaction } from "../db/postgres";
import { logger } from "../utils/logger";
import { PLAYER_ROSTER, getCricbuzzImageUrl } from "../models/player";
import { mapStatsToFeatures } from "../lib/features";

export const battleRouter: IRouter = Router();

const ML_URL = process.env.ML_URL ?? "http://localhost:8000";

async function persistDynamicPlayer(player: {
  internalId: string;
  cricbuzzPlayerId: string;
  name: string;
  country: string;
  flag: string;
  role: string;
}): Promise<void> {
  await query(
    `INSERT INTO players (internal_id, cricbuzz_player_id, name, country, flag, role, archetype_id)
     VALUES ($1,$2,$3,$4,$5,$6,'A')
     ON CONFLICT (internal_id) DO NOTHING`,
    [
      player.internalId,
      player.cricbuzzPlayerId,
      player.name,
      player.country,
      player.flag,
      player.role,
    ]
  );

  await query(
    `INSERT INTO elo_ratings (player_id, rating, format)
     SELECT id, 1500, 'overall' FROM players WHERE internal_id = $1
     ON CONFLICT DO NOTHING`,
    [player.internalId]
  );
}

async function resolvePlayer(idOrName: string): Promise<{
  internalId: string;
  cricbuzzPlayerId: string;
  name: string;
  country: string;
  flag: string;
  role: string;
  archetypeId: string;
  archetypeName: string;
}> {
  const normalized = idOrName.trim();
  const known = PLAYER_ROSTER.find(
    (player) =>
      player.internalId === normalized ||
      player.cricbuzzPlayerId === normalized ||
      player.name.toLowerCase() === normalized.toLowerCase()
  );
  if (known) return known;

  const results = await searchPlayer(normalized);
  if (!results.length) throw new Error(`Player '${idOrName}' not found`);

  const player = {
    internalId: results[0].name.toLowerCase().replace(/ /g, "-"),
    cricbuzzPlayerId: results[0].id,
    name: results[0].name,
    country: results[0].country,
    flag: "🏏",
    role: "Unknown",
    archetypeId: "A",
    archetypeName: "Unknown",
  };

  await persistDynamicPlayer(player);
  return player;
}

// ── Core battle computation ───────────────────────────────────────────────────

async function computeBattle(p1Id: string, p2Id: string, algorithms: string[] = ["xgboost", "random_forest"]) {
  const [roster1, roster2] = await Promise.all([
    resolvePlayer(p1Id),
    resolvePlayer(p2Id),
  ]);

  const cacheKey = `battle:${p1Id}:${p2Id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // ── Resolve CricData UUIDs (1 search call per player if not cached)
  async function resolveCricDataId(roster: typeof roster1): Promise<string | null> {
    const idKey = `cricdata:id:${roster.internalId}`;
    const cached = await cacheGet<string>(idKey);
    if (cached) return cached;
    try {
      const results = await searchCricDataPlayer(roster.name);
      if (results[0]) {
        await redis.set(idKey, results[0].id);   // permanent cache
        return results[0].id;
      }
    } catch { /* budget exceeded or network — fall through */ }
    return null;
  }

  const [cdId1, cdId2] = await Promise.all([
    resolveCricDataId(roster1),
    resolveCricDataId(roster2),
  ]);

  // ── Fetch live career stats via CricData (1 call per player if UUID known)
  const [stats1res, stats2res] = await Promise.allSettled([
    cdId1 ? getCricDataPlayer(cdId1) : Promise.reject("no-id"),
    cdId2 ? getCricDataPlayer(cdId2) : Promise.reject("no-id"),
  ]);

  const stats1 = stats1res.status === "fulfilled" ? stats1res.value : null;
  const stats2 = stats2res.status === "fulfilled" ? stats2res.value : null;

  // ── ML: Multi-algorithm battle prediction
  let mlResult: any = null;
  try {
    // Build identity-blind feature vectors for the ML service
    const p1StatsForML = stats1 ? mapStatsToFeatures(
      stats1.career?.find((c: any) => c.format === 'TEST'),
      stats1.career?.find((c: any) => c.format === 'ODI'),
      stats1.career?.find((c: any) => c.format === 'T20I'),
      stats1.career?.find((c: any) => c.format === 'IPL'),
    ) : undefined;
    const p2StatsForML = stats2 ? mapStatsToFeatures(
      stats2.career?.find((c: any) => c.format === 'TEST'),
      stats2.career?.find((c: any) => c.format === 'ODI'),
      stats2.career?.find((c: any) => c.format === 'T20I'),
      stats2.career?.find((c: any) => c.format === 'IPL'),
    ) : undefined;

    const mlRes = await fetch(`${ML_URL}/battle/predict`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p1Id: roster1.cricbuzzPlayerId,
        p2Id: roster2.cricbuzzPlayerId,
        algorithms: algorithms,
        p1Stats: p1StatsForML,
        p2Stats: p2StatsForML,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (mlRes.ok) mlResult = await mlRes.json();
  } catch {
    logger.warn("[battle] ML service unavailable — using stat-based comparison");
  }

  // ── Stat-based comparison (fallback when ML is unavailable)
  const odiAvg1 = stats1?.career?.find((c) => c.format === "ODI")?.avg ?? 0;
  const odiAvg2 = stats2?.career?.find((c) => c.format === "ODI")?.avg ?? 0;
  const gap = Math.abs(odiAvg1 - odiAvg2).toFixed(1);
  const statWinner = odiAvg1 >= odiAvg2 ? p1Id : p2Id;

    // ── Gemini API narrative generation
    let narrative = buildStatNarrative(roster1.name, roster2.name, odiAvg1, odiAvg2, mlResult);
    try {
    narrative = await generateNarrative(roster1.name, roster2.name, stats1, stats2, mlResult);
    } catch {
    // Gemini unavailable — use stat narrative
    }

  const result = {
    p1: {
      internalId:       roster1.internalId,
      cricbuzzPlayerId: roster1.cricbuzzPlayerId,
      name:             roster1.name,
      country:          roster1.country,
      flag:             roster1.flag,
      role:             roster1.role,
      archetypeId:      roster1.archetypeId,
      archetypeName:    roster1.archetypeName,
      imageUrl:         getCricbuzzImageUrl(roster1.cricbuzzPlayerId),
      stats:            stats1,
    },
    p2: {
      internalId:       roster2.internalId,
      cricbuzzPlayerId: roster2.cricbuzzPlayerId,
      name:             roster2.name,
      country:          roster2.country,
      flag:             roster2.flag,
      role:             roster2.role,
      archetypeId:      roster2.archetypeId,
      archetypeName:    roster2.archetypeName,
      imageUrl:         getCricbuzzImageUrl(roster2.cricbuzzPlayerId),
      stats:            stats2,
    },
    ml: {
      available:       mlResult !== null,
      dnaSimilarity:   mlResult?.dnaSimilarity   ?? null,
      winnerPredicted: mlResult?.predictedWinner ?? statWinner,
      confidence:      mlResult?.confidence       ?? null,
      momentumP1:      mlResult?.momentumP1       ?? 50,
      momentumP2:      mlResult?.momentumP2       ?? 50,
      xgboostScore:    mlResult?.xgboostScore     ?? null,
    },
    narrative,
    statComparison: {
      winner:      statWinner,
      gap,
      reason: gap === "0.0"
        ? "Statistically identical. The DNA decides."
        : `${statWinner === p1Id ? roster1.name : roster2.name} leads by ${gap} in ODI average.`,
    },
    algorithmVerdicts: mlResult?.algorithms ?? [],
    judge: mlResult?.judge ?? null,
    computedAt: new Date().toISOString(),
  };

  // Cache 1 hour
  await cacheSet(cacheKey, result, TTL.BATTLE_RESULT);

  // Persist to DB (fire and forget)
  persistBattleOutcome(result).catch((e) =>
    logger.error("[battle] DB persist failed", { error: e.message })
  );

  // Broadcast to any active battle rooms
  await publish(CHANNELS.BATTLE_UPDATE, {
    p1Id, p2Id,
    winner:       result.ml.winnerPredicted,
    dnaSimilarity: result.ml.dnaSimilarity,
    narrative:    result.narrative,
  });

  return result;
}

// ── Gemini narrative generation ────────────────────────────────────────────────

async function generateNarrative(
  name1: string,
  name2: string,
  stats1: any,
  stats2: any,
  mlResult: any
): Promise<string> {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return buildStatNarrative(
    name1, name2,
    stats1?.career?.find((c: any) => c.format === "ODI")?.avg ?? 0,
    stats2?.career?.find((c: any) => c.format === "ODI")?.avg ?? 0,
    mlResult
  );

  const odi1 = stats1?.career?.find((c: any) => c.format === "ODI");
  const odi2 = stats2?.career?.find((c: any) => c.format === "ODI");

  const prompt = `You are a cricket analyst writing a dramatic one-paragraph battle narrative (max 80 words).

Player 1: ${name1} — ODI avg: ${odi1?.avg ?? "N/A"}, 100s: ${odi1?.hundreds ?? 0}, SR: ${odi1?.sr ?? "N/A"}
Player 2: ${name2} — ODI avg: ${odi2?.avg ?? "N/A"}, 100s: ${odi2?.hundreds ?? 0}, SR: ${odi2?.sr ?? "N/A"}
DNA Similarity: ${mlResult?.dnaSimilarity ?? "N/A"}%
Predicted winner: ${mlResult?.predictedWinner ?? "Unknown"}

Write a punchy, cinematic cricket battle narrative. Reference their actual playing styles and strengths. No bullet points. Pure storytelling.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 200,
          temperature:     0.8,
        },
      }),
      signal: AbortSignal.timeout(8000),
    }
  );

  if (!res.ok) throw new Error(`Gemini API ${res.status}`);
  const data = await res.json();
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    buildStatNarrative(name1, name2, odi1?.avg ?? 0, odi2?.avg ?? 0, mlResult)
  );
}

function buildStatNarrative(
  name1: string, name2: string,
  avg1: number, avg2: number,
  mlResult: any
): string {
  const leader = avg1 >= avg2 ? name1 : name2;
  const follower = avg1 >= avg2 ? name2 : name1;
  const sim = mlResult?.dnaSimilarity;
  if (sim && sim > 80) {
    return `${name1} and ${name2} share ${sim}% DNA — two players forged in the same fire, separated only by jersey colour. The numbers are almost identical. The difference? The moments that defined each.`;
  }
  return `${leader} holds the statistical edge, but ${follower} has never read a spreadsheet in their career. Two legends, one arena. The data leans one way — cricket has a habit of ignoring data.`;
 
}

// ── Persist battle outcome to DB ──────────────────────────────────────────────

async function persistBattleOutcome(result: any): Promise<void> {
  try {
    // Look up internal player UUIDs
    const [p1Rows, p2Rows] = await Promise.all([
      query<{ id: string }>("SELECT id FROM players WHERE internal_id = $1 OR cricbuzz_player_id = $1 LIMIT 1", [result.p1.internalId]),
      query<{ id: string }>("SELECT id FROM players WHERE internal_id = $1 OR cricbuzz_player_id = $1 LIMIT 1", [result.p2.internalId]),
    ]);

    if (!p1Rows.length || !p2Rows.length) {
      logger.warn("[battle] Cannot persist — player(s) not found in DB");
      return;
    }

    const winnerId = result.ml.winnerPredicted === result.p1.internalId
      ? p1Rows[0].id
      : result.ml.winnerPredicted === result.p2.internalId
        ? p2Rows[0].id
        : null;

    await query(
      `INSERT INTO battle_outcomes
         (player_a_id, player_b_id, battle_context, winner_id,
          dna_similarity, ml_confidence, narrative, ml_verdicts,
          momentum_a, momentum_b)
       VALUES ($1,$2,'career',$3,$4,$5,$6,$7,$8,$9)`,
      [
        p1Rows[0].id,
        p2Rows[0].id,
        winnerId,
        result.ml.dnaSimilarity,
        result.ml.confidence,
        result.narrative,
        JSON.stringify({
          algorithms: result.algorithmVerdicts ?? [],
          judge: result.judge ?? null,
        }),
        result.ml.momentumP1 ?? 50,
        result.ml.momentumP2 ?? 50,
      ]
    );

    logger.debug("[battle] Outcome persisted to DB");
  } catch (e: any) {
    logger.error("[battle] persistBattleOutcome failed", { error: e.message });
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /api/battle?p1=virat-kohli&p2=rohit-sharma&algorithms=xgboost,random_forest
battleRouter.get("/", async (req: Request, res: Response) => {
  const { p1, p2 } = req.query as { p1: string; p2: string };
  if (!p1 || !p2) return res.status(400).json({ error: "p1 and p2 player IDs or names required" });

  // Parse algorithms from query param (default: xgboost + random_forest)
  const algoParam = (req.query.algorithms as string) ?? "";
  const algorithms = algoParam
    ? algoParam.split(",").map((a) => a.trim()).filter(Boolean)
    : ["xgboost", "random_forest"];

  try {
    const result = await computeBattle(p1, p2, algorithms);
    res.json(result);
  } catch (e: any) {
    if (e instanceof CricDataBudgetExceededError) {
      return res.status(429).json({ error: "Daily API budget exceeded", budgetExceeded: true });
    }
    logger.error("[battle] Compute failed", { p1, p2, error: e.message });
    res.status(502).json({ error: "Battle computation failed", detail: e.message });
  }
});

// GET /api/battle/moments?p1=virat-kohli&p2=rohit-sharma
battleRouter.get("/moments", async (req: Request, res: Response) => {
  const { p1, p2 } = req.query as { p1: string; p2: string };
  if (!p1 || !p2) return res.status(400).json({ error: "p1 and p2 required" });

  const cacheKey = `moments:${p1}:${p2}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Pull battle outcomes from DB filtered to knockout matches
    const rows = await query(
      `SELECT bo.*, p.name as winner_name
       FROM battle_outcomes bo
       LEFT JOIN players p ON p.id = bo.winner_id
       WHERE (bo.player_a_id = (SELECT id FROM players WHERE internal_id=$1)
          OR  bo.player_b_id = (SELECT id FROM players WHERE internal_id=$1))
         AND bo.battle_context = 'career'
       ORDER BY bo.created_at DESC LIMIT 5`,
      [p1]
    );

    // Always include Kohli 2022 WC moment when Kohli is involved
    const moments: any[] = [];
    if (p1 === "virat-kohli" || p2 === "virat-kohli") {
      moments.push({
        playerName: "Virat Kohli",
        match:      "ICC Men's T20 World Cup 2022 — India vs Pakistan, MCG",
        score:      "82* (53)",
        context:    "Required 16 off the last over. Two sixes off Haris Rauf. India won by 4 wickets.",
        date:       "2022-10-23",
        isKnockout: true,
      });
    }

    await cacheSet(cacheKey, moments, TTL.BATTLE_RESULT);
    res.json(moments);
  } catch (e: any) {
    res.status(500).json({ error: "Moments fetch failed", detail: e.message });
  }
});

// GET /api/battle/history/:internalId — past battles for a player
battleRouter.get("/history/:internalId", async (req: Request, res: Response) => {
  const { internalId } = req.params;
  try {
    const rows = await query(
      `SELECT bo.*, pa.name as player_a_name, pb.name as player_b_name, pw.name as winner_name
       FROM battle_outcomes bo
       JOIN players pa ON pa.id = bo.player_a_id
       JOIN players pb ON pb.id = bo.player_b_id
       LEFT JOIN players pw ON pw.id = bo.winner_id
       WHERE pa.internal_id = $1 OR pb.internal_id = $1
       ORDER BY bo.created_at DESC LIMIT 20`,
      [internalId]
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: "History fetch failed", detail: e.message });
  }
});
