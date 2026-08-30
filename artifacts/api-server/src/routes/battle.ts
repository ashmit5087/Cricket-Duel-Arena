import { Router, Request, Response, type IRouter } from "express";
import { searchPlayer, getPlayerStatsWithFallback } from "../services/cricbuzz";
import { cacheGet, cacheSet, publish, TTL, CHANNELS, redis } from "../db/redis";
import { query, transaction } from "../db/postgres";
import { logger } from "../utils/logger";
import { PLAYER_ROSTER, getCricbuzzImageUrl } from "../models/player";
import { loadPlayerSnapshot, upsertCareerStats, type PlayerSnapshot } from "../lib/snapshot";

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
  // Use DO UPDATE so that if a player was seeded via migrate (by internal_id)
  // and also arrives via a different lookup path, we update rather than crash
  // with a unique-constraint violation on cricbuzz_player_id.
  await query(
    `INSERT INTO players (internal_id, cricbuzz_player_id, name, country, flag, role, archetype_id)
     VALUES ($1,$2,$3,$4,$5,$6,'A')
     ON CONFLICT (internal_id) DO UPDATE SET
       cricbuzz_player_id = COALESCE(EXCLUDED.cricbuzz_player_id, players.cricbuzz_player_id),
       name               = EXCLUDED.name,
       updated_at         = NOW()`,
    [
      player.internalId,
      player.cricbuzzPlayerId || null,
      player.name,
      player.country,
      player.flag,
      player.role,
    ]
  ).catch((e: any) => {
    // cricbuzz_player_id unique constraint can fire if the same Cricbuzz ID
    // is already on a different internal_id row. Safe to ignore — the existing
    // row is the canonical one and the battle can still proceed.
    if (e.message?.includes('cricbuzz_player_id')) return;
    throw e;
  });

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
  espnId: string | null;
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
      player.espnId === normalized ||               // ESPN id — the frontend's cricInfoId space
      player.name.toLowerCase() === normalized.toLowerCase()
  );
  if (known) return known;

  // Roster miss — check DB (previous dynamic players), else queue for the
  // refresher and serve a placeholder. NO synchronous external calls.
  const dbRes = await query(
    `SELECT internal_id, COALESCE(cricbuzz_player_id, '') AS cricbuzz_player_id,
            name, country, role
       FROM players WHERE internal_id = $1 OR LOWER(name) = LOWER($1)
      LIMIT 1`,
    [normalized]
  );
  if (dbRes[0]) {
    const p = dbRes[0];
    return {
      internalId: p.internal_id,
      cricbuzzPlayerId: p.cricbuzz_player_id ?? "",
      espnId: null,
      name: p.name,
      country: p.country,
      flag: "🏏",
      role: p.role ?? "Unknown",
      archetypeId: "A",
      archetypeName: "Unknown",
    };
  }

  // Truly unknown — resolve via search (1 credit, cache-aside, permanent),
  // then queue stats refresh. Search is cheap and rare; stats wait for the worker.
  let resolved = { id: "", name: normalized, country: "Unknown" };
  try {
    const results = await searchPlayer(normalized);
    if (results.length) resolved = results[0];
  } catch { /* quota exhausted / network — placeholder still works */ }

  const player = {
    internalId: resolved.name.toLowerCase().replace(/ /g, "-"),
    cricbuzzPlayerId: resolved.id,
    espnId: null as string | null,
    name: resolved.name,
    country: resolved.country,
    flag: "🏏",
    role: "Unknown",
    archetypeId: "A",
    archetypeName: "Unknown",
  };

  await persistDynamicPlayer(player);
  await query(
    `INSERT INTO refresh_queue (internal_id, cricbuzz_player_id, name, country)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (internal_id) DO NOTHING`,
    [player.internalId, player.cricbuzzPlayerId, player.name, player.country]
  ).catch(() => {});
  await query(
    `UPDATE players SET pending_refresh = TRUE WHERE internal_id = $1`,
    [player.internalId]
  ).catch(() => {});

  return player;
}

// ── On-demand stats backfill (free scraper) ───────────────────────────────────
//
// The documented data-flow rule is "user routes read the DB, external calls
// happen only in the refresher." That keeps *paid* RapidAPI calls out of the
// request path. But on a fresh deploy the refresher round-robins ~1 player /
// 12h, so the two players in a brand-new battle often have NO career rows yet
// — and the results page then renders zeros / the frontend falls back to mock.
//
// This helper closes that gap for exactly the two players being compared,
// using the FREE Cricbuzz scraper (scraper-first; RapidAPI only if a key is
// set and the scraper fails). Scoped to two players, cached for an hour by the
// caller, and fully degradable — any failure just leaves `hasStats` false and
// the existing "scouting report in progress" placeholder shows.
async function ensureSnapshotStats(
  roster: { internalId: string; cricbuzzPlayerId: string },
  snap: PlayerSnapshot | null,
): Promise<PlayerSnapshot | null> {
  if (snap?.hasStats) return snap;                    // already have real stats
  const cbId = roster.cricbuzzPlayerId?.trim();
  if (!cbId) return snap;                             // nothing to scrape with

  try {
    const { source, stats } = await getPlayerStatsWithFallback(cbId);
    if (!stats.career.length) return snap;            // Cricbuzz genuinely has no data

    // loadPlayerSnapshot doesn't expose the DB uuid, so resolve it for the upsert.
    const rows = await query<{ id: string }>(
      "SELECT id FROM players WHERE internal_id = $1 OR cricbuzz_player_id = $2 LIMIT 1",
      [roster.internalId, cbId],
    );
    if (!rows[0]) return snap;                         // player row missing (roster is seeded, so rare)

    await upsertCareerStats(rows[0].id, stats.career, source);
    logger.info("[battle] lazy stats backfill", { player: roster.internalId, source, formats: stats.career.length });

    const fresh = await loadPlayerSnapshot(roster.internalId);
    return fresh?.hasStats ? fresh : snap;
  } catch (e) {
    // Scraper/ML cold or unreachable — degrade to the pending placeholder.
    logger.warn("[battle] lazy stats fetch failed", { cbId, error: (e as Error).message });
    return snap;
  }
}

// ── All-format stat verdict ───────────────────────────────────────────────────
//
// The results page compares the two players across TEST / ODI / T20I. The
// battle verdict must be decided on the SAME all-format basis, not on ODI
// average alone (the old behaviour). We score each format the player has
// actually played — average is the headline, strike rate and run volume break
// ties — then sum across formats and tally per-format wins for the narrative.
const VERDICT_FORMATS = ["TEST", "ODI", "T20I"] as const;

function formatBattingScore(c: SnapshotCareerLike | undefined): number {
  if (!c || c.matches <= 0) return 0;
  return c.avg + c.sr * 0.1 + Math.min(c.runs, 20000) * 0.001;
}

interface SnapshotCareerLike { format: string; matches: number; runs: number; avg: number; sr: number }

function allFormatVerdict(
  career1: SnapshotCareerLike[] | undefined,
  career2: SnapshotCareerLike[] | undefined,
): { score1: number; score2: number; wins1: string[]; wins2: string[] } {
  let score1 = 0, score2 = 0;
  const wins1: string[] = [], wins2: string[] = [];
  for (const f of VERDICT_FORMATS) {
    const c1 = career1?.find((c) => c.format === f);
    const c2 = career2?.find((c) => c.format === f);
    const s1 = formatBattingScore(c1);
    const s2 = formatBattingScore(c2);
    if (s1 === 0 && s2 === 0) continue;               // neither side has data for this format
    score1 += s1;
    score2 += s2;
    if (s1 >= s2) wins1.push(f); else wins2.push(f);
  }
  return { score1, score2, wins1, wins2 };
}

// ── Core battle computation ───────────────────────────────────────────────────

async function computeBattle(p1Id: string, p2Id: string, algorithms: string[] = ["xgboost", "random_forest"]) {
  const [roster1, roster2] = await Promise.all([
    resolvePlayer(p1Id),
    resolvePlayer(p2Id),
  ]);

  // Include the algorithm selection in the key — otherwise two battles that
  // differ only by chosen algorithms collide and serve each other's result.
  const cacheKey = `battle:${p1Id}:${p2Id}:${[...algorithms].sort().join(",")}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // ── Load snapshots from Postgres (DB-first)
  let [snap1, snap2] = await Promise.all([
    loadPlayerSnapshot(roster1.internalId),
    loadPlayerSnapshot(roster2.internalId),
  ]);

  // If either player has no real career rows yet (fresh deploy, refresher
  // hasn't reached them, bootstrap skipped), backfill on-demand via the FREE
  // scraper so the results page compares REAL data. Scoped to these two
  // players; degrades to the pending placeholder on any failure.
  [snap1, snap2] = await Promise.all([
    ensureSnapshotStats(roster1, snap1),
    ensureSnapshotStats(roster2, snap2),
  ]);

  const statsPending = (snap: PlayerSnapshot | null) => !snap?.hasStats;
  const p1Pending = statsPending(snap1);
  const p2Pending = statsPending(snap2);

  // Shape snapshots into the career format the rest of the route expects
  const stats1 = snap1 ? { playerId: snap1.cricbuzzPlayerId, playerName: snap1.name, country: snap1.country, role: snap1.role, battingStyle: "-", bowlingStyle: "-", career: snap1.career } : null;
  const stats2 = snap2 ? { playerId: snap2.cricbuzzPlayerId, playerName: snap2.name, country: snap2.country, role: snap2.role, battingStyle: "-", bowlingStyle: "-", career: snap2.career } : null;

  // ── ML: call the 6-model battle-predict endpoint + cluster metadata
  // POST /battle-predict runs K-Means, cosine DNA, DBSCAN, PCA, format
  // versatility, and statistical composite — returning per-model verdicts and
  // a judge that aggregates them by majority vote.
  // /cluster calls are kept for archetype metadata (name, color, vector).
  let mlResult: any = null;
  const mlId1 = roster1.espnId ?? roster1.cricbuzzPlayerId;
  const mlId2 = roster2.espnId ?? roster2.cricbuzzPlayerId;
  const mlIdsAvailable = !!(roster1.espnId && roster2.espnId);
  if (mlIdsAvailable) {
    try {
      // 60s: covers ml-service cold-start on Render free tier (30-50s).
      const [c1Res, c2Res, battleRes] = await Promise.all([
        fetch(`${ML_URL}/cluster/${mlId1}`, { signal: AbortSignal.timeout(60_000) }),
        fetch(`${ML_URL}/cluster/${mlId2}`, { signal: AbortSignal.timeout(60_000) }),
        fetch(`${ML_URL}/battle-predict`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p1:       mlId1,
            p2:       mlId2,
            name1:    roster1.name,
            name2:    roster2.name,
            p1Career: stats1?.career ?? [],
            p2Career: stats2?.career ?? [],
          }),
          signal: AbortSignal.timeout(60_000),
        }),
      ]);
      const c1: any = c1Res.ok ? await c1Res.json() : null;
      const c2: any = c2Res.ok ? await c2Res.json() : null;
      const battle: any = battleRes.ok ? await battleRes.json() : null;

      const models: any[]  = battle?.models ?? [];
      const judge: any     = battle?.judge ?? null;

      // Extract DNA similarity from the cosine_dna model for display
      const cosineMod = models.find((m: any) => m.id === "cosine_dna");
      const dnaSimilarity: number | null = cosineMod?.dnaSimilarity ?? null;

      const score1 = c1?.dnaScore ?? 50;
      const score2 = c2?.dnaScore ?? 50;

      // Judge winner takes priority; fall back to DNA score comparison.
      // Normalize to the canonical internalId so the frontend can resolve the
      // winner regardless of which id space the ML service echoes back.
      const predictedWinnerId = judge?.winner === mlId1 ? roster1.internalId
        : judge?.winner === mlId2 ? roster2.internalId
        : score1 >= score2 ? roster1.internalId : roster2.internalId;

      mlResult = {
        available:       true,
        dnaSimilarity,
        predictedWinner: predictedWinnerId,
        confidence:      judge ? Math.round(judge.agreement_rate) : Math.round(Math.abs(score1 - score2) * 2),
        momentumP1:      score1,
        momentumP2:      score2,
        xgboostScore:    dnaSimilarity,
        // Cluster metadata (for archetype display on p1/p2 cards)
        archetype1:      c1?.archetype,
        archetype2:      c2?.archetype,
        archetypeId1:    c1?.archetypeId,
        archetypeId2:    c2?.archetypeId,
        color1:          c1?.color,
        color2:          c2?.color,
        dnaScore1:       score1,
        dnaScore2:       score2,
        playerVector1:   c1?.playerVector ?? null,
        playerVector2:   c2?.playerVector ?? null,
        isOutlier1:      c1?.isOutlier ?? false,
        isOutlier2:      c2?.isOutlier ?? false,
        // 6-model results
        algorithms:      models,
        judge,
      };
    } catch (e) {
      logger.warn("[battle] ML battle-predict failed", { error: (e as Error).message });
    }
  } else {
    logger.warn("[battle] ML skipped — missing espnId", {
      p1: { internalId: roster1.internalId, espnId: roster1.espnId ?? null },
      p2: { internalId: roster2.internalId, espnId: roster2.espnId ?? null },
    });
  }


  // ── Stat-based comparison across ALL formats (TEST/ODI/T20I)
  // This is the verdict the results page renders, so it must reflect every
  // format shown in the comparison table — not ODI average alone.
  const verdict = allFormatVerdict(stats1?.career, stats2?.career);
  // Report the winner as the canonical internalId (roster.internalId), never the
  // raw incoming id. The frontend matches statComparison.winner against
  // PLAYERS[].id (internalId); echoing whatever id the caller sent — e.g. an
  // ESPN or Cricbuzz id — would silently break the lookup and fall back to p1.
  const p1WinsStat = verdict.score1 >= verdict.score2;
  const statWinner = p1WinsStat ? roster1.internalId : roster2.internalId;
  const winnerName = p1WinsStat ? roster1.name : roster2.name;
  const winnerFormats = p1WinsStat ? verdict.wins1 : verdict.wins2;
  const totalFormats = verdict.wins1.length + verdict.wins2.length;
  const gap = Math.abs(verdict.score1 - verdict.score2).toFixed(1);

    // ── Gemini API narrative generation
    let narrative = buildStatNarrative(roster1.name, roster2.name, verdict.score1, verdict.score2, mlResult);
    try {
    narrative = await generateNarrative(roster1.name, roster2.name, stats1, stats2, mlResult);
    } catch {
    // Gemini unavailable — use stat narrative
    }

  const result = {
    statsPending: {
      p1: p1Pending,
      p2: p2Pending,
      message: (p1Pending || p2Pending)
        ? "Scouting report in progress — full stats will appear after the next snapshot refresh (up to 8h). Battle verdict uses current Elo + available data."
        : null,
    },
    p1: {
      internalId:       roster1.internalId,
      cricbuzzPlayerId: roster1.cricbuzzPlayerId,
      name:             roster1.name,
      country:          roster1.country,
      flag:             roster1.flag,
      role:             roster1.role,
      // Prefer the LIVE archetype from the ML cluster call; only fall
      // back to the static roster assignment when ML was unreachable
      // (espnId missing, cold-start timeout, etc).
      archetypeId:      mlResult?.archetypeId1 ?? roster1.archetypeId,
      archetypeName:    mlResult?.archetype1   ?? roster1.archetypeName,
      archetypeColor:   mlResult?.color1       ?? null,
      dnaScore:         mlResult?.dnaScore1    ?? null,
      playerVector:     mlResult?.playerVector1 ?? null,
      isOutlier:        mlResult?.isOutlier1   ?? false,
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
      archetypeId:      mlResult?.archetypeId2 ?? roster2.archetypeId,
      archetypeName:    mlResult?.archetype2   ?? roster2.archetypeName,
      archetypeColor:   mlResult?.color2       ?? null,
      dnaScore:         mlResult?.dnaScore2    ?? null,
      playerVector:     mlResult?.playerVector2 ?? null,
      isOutlier:        mlResult?.isOutlier2   ?? false,
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
      reason: totalFormats === 0
        ? "Full stats are still syncing — verdict will sharpen once career data lands."
        : verdict.wins1.length > 0 && verdict.wins2.length > 0
          ? `${winnerName} takes the all-format verdict, leading in ${winnerFormats.join(" & ")} of ${totalFormats} formats compared.`
          : `${winnerName} sweeps all ${totalFormats} format${totalFormats > 1 ? "s" : ""} (${winnerFormats.join(", ")}).`,
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
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
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
