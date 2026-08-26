// src/workers/refresher.ts
// ─────────────────────────────────────────────────────────────────────────────
// Snapshot-first refresher — the ONLY place external Cricbuzz calls happen.
//
// Replaces poller.ts (10s live polling) under a 200-credit/month budget:
//   • Every 12h: 1 credit for live matches → if any, 1 per scorecard,
//     extracting ALL batsmen/bowlers into players.recent_form.
//   • Career stats (3 credits) only for touched players whose snapshot is
//     older than CAREER_MIN_AGE_MS, plus a monthly-capped round-robin.
//   • Drains refresh_queue (roster-miss players queued by battle.ts).
//
// Cold-start safety: freshness is read from Postgres (MAX(last_synced)),
// never memory. A Redis SETNX lock prevents restart/manual-trigger races.
// ─────────────────────────────────────────────────────────────────────────────

import { getLiveMatches, getMatchScorecard, getPlayerStats } from "../services/cricbuzz";
import { query } from "../db/postgres";
import { redis } from "../db/redis";
import { upsertCareerStats } from "../lib/snapshot";
import { logger } from "../utils/logger";

const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS ?? String(12 * 60 * 60 * 1000), 10);
const LOCK_KEY = "refresher:lock";
const LOCK_TTL_SECONDS = 600; // 10 min — enough for one full cycle

// Career stats change slowly — even for a player mid-series, don't re-spend
// 3 credits unless their last_synced is older than this (default 20h).
const CAREER_MIN_AGE_MS = parseInt(process.env.CAREER_MIN_AGE_MS ?? String(20 * 60 * 60 * 1000), 10);

// Round-robin backfill: refresh the single stalest player per cycle, capped
// monthly so it can't eat the budget (21 players × 3 credits = 63/mo).
const ROUND_ROBIN_MONTHLY_CAP = parseInt(process.env.ROUND_ROBIN_MONTHLY_CAP ?? "21", 10);
const ROUND_ROBIN_MAX_AGE_DAYS = 30;

let interval: NodeJS.Timeout | null = null;
let running = false;

// ── Locking ───────────────────────────────────────────────────────────────────

async function acquireLock(): Promise<boolean> {
  try {
    return await redis.setnx(LOCK_KEY, Date.now().toString(), LOCK_TTL_SECONDS);
  } catch {
    return true; // Redis down — proceed unlocked; Postgres staleness check still guards spend
  }
}

async function releaseLock(): Promise<void> {
  try { await redis.del(LOCK_KEY); } catch { /* ignore */ }
}

// ── Staleness (Postgres-backed, cold-start safe) ─────────────────────────────

async function isStale(): Promise<boolean> {
  const res = await query(`SELECT MAX(last_synced) AS latest FROM player_career_stats`);
  const latest = res[0]?.latest;
  if (!latest) return true; // nothing ever synced
  const ageMs = Date.now() - new Date(latest).getTime();
  return ageMs >= REFRESH_INTERVAL_MS;
}

// ── Scorecard → recent_form for every participant ────────────────────────────

interface FormEntry {
  matchId: string;
  matchType: string;
  date: string;
  runs?: number;
  balls?: number;
  wickets?: number;
  overs?: number;
}

async function applyScorecard(matchId: string): Promise<Set<string>> {
  const card = await getMatchScorecard(matchId);
  const touched = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  type Participant = { cricbuzzPlayerId: string; entry: FormEntry };
  const participants: Participant[] = [];

  for (const inn of card.innings) {
    for (const b of inn.batsmen) {
      participants.push({
        cricbuzzPlayerId: b.playerId,
        entry: { matchId, matchType: card.matchType, date: today, runs: b.runs, balls: b.balls },
      });
    }
    for (const bw of inn.bowlers) {
      participants.push({
        cricbuzzPlayerId: bw.playerId,
        entry: { matchId, matchType: card.matchType, date: today, wickets: bw.wickets, overs: bw.overs },
      });
    }
  }

  for (const { cricbuzzPlayerId, entry } of participants) {
    if (!cricbuzzPlayerId) continue;
    touched.add(cricbuzzPlayerId);

    // Append to recent_form (keep last 10) via read-modify-write in JS —
    // Postgres has no native jsonb array slicing.
    const current = await query(
      `SELECT recent_form FROM players WHERE cricbuzz_player_id = $1`,
      [cricbuzzPlayerId]
    );

    if (current.length === 0) {
      // Unknown player in a scorecard — queue with the REAL cricbuzz id so
      // drainQueue can fetch their stats on a later cycle.
      await query(
        `INSERT INTO refresh_queue (internal_id, cricbuzz_player_id, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (internal_id) DO NOTHING`,
        [`cricbuzz-${cricbuzzPlayerId}`, cricbuzzPlayerId, "Unknown"]
      ).catch(() => {});
      continue;
    }

    const form = Array.isArray(current[0].recent_form) ? current[0].recent_form : [];
    form.push(entry);
    await query(
      `UPDATE players SET recent_form = $2::jsonb, updated_at = NOW()
        WHERE cricbuzz_player_id = $1`,
      [cricbuzzPlayerId, JSON.stringify(form.slice(-10))]
    );
  }

  logger.info("[refresher] Applied scorecard", { matchId, participants: participants.length });
  return touched;
}

// ── Career stats refresh for touched players ─────────────────────────────

/**
 * Freshness gate: career stats move slowly, so only re-spend 3 credits on a
 * player whose last_synced is older than CAREER_MIN_AGE_MS. This is what
 * keeps a busy cricket day (3 matches, ~60 touched players) from blowing
 * the monthly budget — most were already synced in the previous cycle.
 */
async function filterStalePlayers(cbIds: Set<string>): Promise<Set<string>> {
  if (cbIds.size === 0) return cbIds;
  const rows = await query<{ cricbuzz_player_id: string; latest: string | null }>(
    `SELECT p.cricbuzz_player_id, MAX(s.last_synced) AS latest
       FROM players p
       LEFT JOIN player_career_stats s ON s.player_id = p.id
      WHERE p.cricbuzz_player_id = ANY($1)
      GROUP BY p.cricbuzz_player_id`,
    [[...cbIds]]
  );
  const stale = new Set<string>();
  for (const r of rows) {
    const age = r.latest ? Date.now() - new Date(r.latest).getTime() : Infinity;
    if (age >= CAREER_MIN_AGE_MS) stale.add(r.cricbuzz_player_id);
  }
  return stale;
}

async function refreshCareerStats(cricbuzzPlayerIds: Set<string>): Promise<void> {
  for (const cbId of cricbuzzPlayerIds) {
    try {
      const res = await query<{ id: string }>(
        `SELECT id FROM players WHERE cricbuzz_player_id = $1`,
        [cbId]
      );
      const playerId = res[0]?.id;
      if (!playerId) continue;

      const stats = await getPlayerStats(cbId); // 3 credits
      await upsertCareerStats(playerId, stats.career);
    } catch (e: any) {
      logger.warn("[refresher] Career stats refresh failed", { cbId, error: e.message });
    }
  }
}

// ── Round-robin backfill (monthly-capped) ────────────────────────────────

/**
 * Refresh the single stalest player per cycle, capped at
 * ROUND_ROBIN_MONTHLY_CAP per calendar month. Players bootstrapped or
 * recently synced have fresh last_synced, so they're naturally skipped
 * for ~30 days — no double-spend.
 */
async function roundRobinRefresh(): Promise<void> {
  const monthKey = `cricbuzz:roundrobin:${new Date().toISOString().slice(0, 7)}`;
  const used = parseInt((await redis.get(monthKey)) ?? "0", 10);
  if (used >= ROUND_ROBIN_MONTHLY_CAP) return;

  const rows = await query<{ id: string; cricbuzz_player_id: string; name: string }>(
    `SELECT p.id, p.cricbuzz_player_id, p.name
       FROM players p
       LEFT JOIN player_career_stats s ON s.player_id = p.id
      WHERE p.cricbuzz_player_id IS NOT NULL AND p.cricbuzz_player_id <> ''
      GROUP BY p.id, p.cricbuzz_player_id, p.name
     HAVING MAX(s.last_synced) IS NULL
         OR MAX(s.last_synced) < NOW() - ($1 || ' days')::interval
      ORDER BY MAX(s.last_synced) ASC NULLS FIRST
      LIMIT 1`,
    [String(ROUND_ROBIN_MAX_AGE_DAYS)]
  );
  if (rows.length === 0) return;

  await refreshCareerStats(new Set([rows[0].cricbuzz_player_id]));
  await redis.incr(monthKey, ROUND_ROBIN_MONTHLY_CAP);
  await redis.expire(monthKey, 40 * 86400);
  logger.info("[refresher] Round-robin refreshed", { player: rows[0].name, monthUsed: used + 1 });
}

// ── Drain refresh_queue (roster misses queued by battle.ts) ──────────────────

async function drainQueue(): Promise<void> {
  // Only rows with a resolvable cricbuzz id — anything else would clog the
  // queue (LIMIT 5 would keep returning the same unresolvable rows).
  const res = await query(
    `SELECT id, cricbuzz_player_id, name, country
       FROM refresh_queue
      WHERE cricbuzz_player_id IS NOT NULL AND cricbuzz_player_id <> ''
      ORDER BY queued_at LIMIT 5`
  );
  for (const row of res) {
    await refreshCareerStats(new Set([row.cricbuzz_player_id]));
    // Move into players table properly if they were a placeholder
    await query(
      `INSERT INTO players (internal_id, cricbuzz_player_id, name, country)
       SELECT $1, $2, $3, COALESCE($4, 'Unknown')
       WHERE NOT EXISTS (SELECT 1 FROM players WHERE internal_id = $1)`,
      [row.internal_id, row.cricbuzz_player_id, row.name, row.country]
    );
    await query(`DELETE FROM refresh_queue WHERE id = $1`, [row.id]);
    logger.info("[refresher] Resolved queued player", { name: row.name });
  }
}

// ── Main cycle ────────────────────────────────────────────────────────────────

export async function runRefreshCycle(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const locked = await acquireLock();
    if (!locked) {
      logger.debug("[refresher] Another cycle holds the lock — skipping");
      return;
    }

    try {
      // 1 credit: live matches
      const liveMatches = await getLiveMatches().catch(() => []);
      const touched = new Set<string>();

      if (liveMatches.length > 0) {
        logger.info(`[refresher] ${liveMatches.length} live match(es)`);
        for (const m of liveMatches.slice(0, 3)) { // cap spend per cycle
          try {
            const ids = await applyScorecard(m.matchId); // 1 credit each
            ids.forEach((id) => touched.add(id));
          } catch (e: any) {
            logger.warn("[refresher] Scorecard failed", { matchId: m.matchId, error: e.message });
          }
        }
      } else {
        logger.info("[refresher] No live matches");
      }

      // 3 credits per touched player — career stats, but only if stale
      // (freshness gate keeps busy match days cheap)
      const staleTouched = await filterStalePlayers(touched);
      if (staleTouched.size < touched.size) {
        logger.debug(`[refresher] Career refresh: ${staleTouched.size}/${touched.size} touched players stale`);
      }
      await refreshCareerStats(staleTouched);

      // Round-robin backfill: one stale player per cycle, monthly-capped
      await roundRobinRefresh();

      // Roster-miss backlog
      await drainQueue();

      logger.info("[refresher] ✅ Cycle complete", { touchedPlayers: touched.size, careerRefreshed: staleTouched.size });
    } finally {
      await releaseLock();
    }
  } finally {
    running = false;
  }
}

// ── Start/stop (same pattern as keepAlive.ts) ─────────────────────────────────

export async function startRefresher(): Promise<void> {
  if (interval) return;

  // Cold-start guard: refresh only if Postgres says we're stale.
  if (await isStale()) {
    logger.info("[refresher] Snapshot stale on boot — running initial cycle");
    runRefreshCycle().catch((e) => logger.error("[refresher] Boot cycle failed", { error: e.message }));
  } else {
    logger.info("[refresher] Snapshot fresh — skipping boot cycle");
  }

  interval = setInterval(() => {
    runRefreshCycle().catch((e) => logger.error("[refresher] Cycle failed", { error: e.message }));
  }, REFRESH_INTERVAL_MS);

  logger.info(`[refresher] Started — refreshing every ${REFRESH_INTERVAL_MS / 3600000}h`);
}

export function stopRefresher(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
    logger.info("[refresher] Stopped");
  }
}
