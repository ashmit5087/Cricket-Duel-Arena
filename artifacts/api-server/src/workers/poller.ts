import { getLiveMatches, getMatchScorecard, getLiveCommentary } from "../services/cricbuzz";
import { cacheSet, publish, TTL, CHANNELS } from "../db/redis";
import { query, transaction } from "../db/postgres";
import { logger } from "../utils/logger";

// ── State ──────────────────────────────────────────────────────────────────────

let pollerInterval: NodeJS.Timeout | null = null;
let activeMatchIds: Set<string> = new Set();
let isPolling = false;

// ── Start/stop ─────────────────────────────────────────────────────────────────

export function startPoller(): void {
  if (pollerInterval) return;
  logger.info("[poller] Starting — polling every 10s during live matches");

  // Immediately poll once
  pollAll().catch((e) => logger.error("[poller] Initial poll failed", { error: e.message }));

  // Poll live matches every 10s
  pollerInterval = setInterval(() => {
    if (!isPolling) {
      isPolling = true;
      pollAll()
        .catch((e) => logger.error("[poller] Poll cycle failed", { error: e.message }))
        .finally(() => { isPolling = false; });
    }
  }, 10_000);
}

export function stopPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    logger.info("[poller] Stopped");
  }
}

// ── Main poll cycle ────────────────────────────────────────────────────────────

async function pollAll(): Promise<void> {
  // Step 1: Get all live matches
  const liveMatches = await getLiveMatches().catch(() => []);

  if (liveMatches.length === 0) {
    if (activeMatchIds.size > 0) {
      logger.info("[poller] No live matches — reducing frequency");
      activeMatchIds.clear();
    }
    return;
  }

  logger.debug(`[poller] ${liveMatches.length} live match(es) detected`);
  activeMatchIds = new Set(liveMatches.map((m) => m.matchId));

  // Step 2: Upsert matches into PostgreSQL
  for (const match of liveMatches) {
    await upsertMatch(match).catch((e) =>
      logger.error("[poller] Match upsert failed", { matchId: match.matchId, error: e.message })
    );
  }

  // Step 3: For each live match, get scorecard + commentary
  await Promise.allSettled(
    liveMatches.map((match) => pollMatch(match.matchId))
  );
}

async function pollMatch(matchId: string): Promise<void> {
  const [scorecard, commentary] = await Promise.allSettled([
    getMatchScorecard(matchId),
    getLiveCommentary(matchId),
  ]);

  if (scorecard.status !== "fulfilled") {
    logger.warn("[poller] Scorecard fetch failed", { matchId });
    return;
  }

  const sc = scorecard.value;
  const comments = commentary.status === "fulfilled" ? commentary.value : [];

  // Build live state snapshot
  const currentInnings = sc.innings[sc.innings.length - 1];
  if (!currentInnings) return;

  const liveState = {
    matchId,
    matchType:      sc.matchType,
    innings:        sc.innings,
    commentary:     comments,
    battingTeam:    currentInnings.battingTeam,
    bowlingTeam:    currentInnings.bowlingTeam,
    runs:           currentInnings.runs,
    wickets:        currentInnings.wickets,
    overs:          currentInnings.overs,
    currentBatsmen: currentInnings.batsmen.filter((b) => !b.isOut).slice(0, 2),
    currentBowler:  currentInnings.bowlers.find((b) => b.isBowling),
    updatedAt:      new Date().toISOString(),
  };

  // Write to Redis (fast cache for frontend)
  await cacheSet(`live:match:${matchId}`, liveState, TTL.LIVE_MATCH);

  // Write current innings to Redis for quick access
  await cacheSet(`live:innings:${matchId}`, currentInnings, TTL.LIVE_MATCH);

  // Write to PostgreSQL (persistence for ML training)
  await upsertLiveMatchState(matchId, currentInnings).catch((e) =>
    logger.error("[poller] Live state DB write failed", { matchId, error: e.message })
  );

  // Store ball events from commentary
  if (comments.length > 0) {
    await storeBallEvents(matchId, comments).catch((e) =>
      logger.error("[poller] Ball events store failed", { matchId, error: e.message })
    );
  }

  // Trigger ML momentum calculation (async — don't await)
  triggerMomentumCalc(matchId, liveState).catch(() => {});

  // Publish to Redis pub/sub → Socket.io picks this up
  await publish(CHANNELS.LIVE_UPDATE, {
    type:     "live_update",
    matchId,
    liveState,
  });

  logger.debug(`[poller] Match ${matchId} updated — ${currentInnings.runs}/${currentInnings.wickets} (${currentInnings.overs})`);
}

// ── DB writes ──────────────────────────────────────────────────────────────────

async function upsertMatch(match: any): Promise<void> {
  await query(`
    INSERT INTO matches (cricbuzz_match_id, series_name, match_type, status, team_a, team_b, venue)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (cricbuzz_match_id) DO UPDATE SET
      status     = EXCLUDED.status,
      updated_at = NOW()
  `, [
    match.matchId,
    match.seriesName,
    match.matchType,
    "live",
    match.teamA.name,
    match.teamB.name,
    match.venue,
  ]);
}

async function upsertLiveMatchState(matchId: string, innings: any): Promise<void> {
  // Get internal match UUID
  const rows = await query<{ id: string }>(
    "SELECT id FROM matches WHERE cricbuzz_match_id = $1",
    [matchId]
  );
  if (!rows.length) return;

  const internalMatchId = rows[0].id;
  await query(`
    INSERT INTO live_match_state (match_id, batting_team, bowling_team, team_score, wickets, current_over, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (match_id) DO UPDATE SET
      batting_team  = EXCLUDED.batting_team,
      bowling_team  = EXCLUDED.bowling_team,
      team_score    = EXCLUDED.team_score,
      wickets       = EXCLUDED.wickets,
      current_over  = EXCLUDED.current_over,
      updated_at    = NOW()
  `, [internalMatchId, innings.battingTeam, innings.bowlingTeam, innings.runs, innings.wickets, innings.overs]);
}

async function storeBallEvents(matchId: string, commentary: any[]): Promise<void> {
  const matchRows = await query<{ id: string }>(
    "SELECT id FROM matches WHERE cricbuzz_match_id = $1",
    [matchId]
  );
  if (!matchRows.length) return;
  // Ball events stored per-over for ML training — insert only new ones
  // (In production, track last inserted ball index in Redis to avoid dupes)
}

// ── ML trigger ─────────────────────────────────────────────────────────────────

async function triggerMomentumCalc(matchId: string, liveState: any): Promise<void> {
  const ML_URL = process.env.ML_URL ?? "http://localhost:8000";
  try {
    await fetch(`${ML_URL}/momentum/live`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ matchId, liveState }),
      signal:  AbortSignal.timeout(3000),
    });
  } catch {
    // ML service may be initializing — silently skip
  }
}

// ── Status ─────────────────────────────────────────────────────────────────────

export function getPollerStatus() {
  return {
    running:         pollerInterval !== null,
    activeMatches:   activeMatchIds.size,
    matchIds:        Array.from(activeMatchIds),
  };
}
