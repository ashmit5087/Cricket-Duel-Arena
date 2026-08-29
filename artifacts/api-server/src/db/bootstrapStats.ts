// src/db/bootstrapStats.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-off, IDEMPOTENT career-stats bootstrap.
//
// Fetches career stats (FREE via the Cricbuzz scraper; RapidAPI as 3-credit
// fallback when the scraper fails or returns empty data) for every player
// that has a cricbuzz_player_id but NO rows in player_career_stats yet. Safe
// to run on every deploy: once everyone is synced it spends 0 credits and
// exits.
//
// Run manually:   pnpm bootstrap:stats
// Or via Render:  baked into startCommand after migrate.js (see render.yaml)
//
// Failure handling:
//   • QuotaExhaustedError → stop cleanly; remaining players sync next month
//     (or re-run after quota reset).
//   • Per-player failures are marked in cache for 7 days so broken IDs don't
//     re-spend 3 credits on every deploy.
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import { pool, query } from "./postgres";
import { getPlayerStatsWithFallback, QuotaExhaustedError, QuotaBlockedError, getQuotaRemaining } from "../services/cricbuzz";
import { isScraperHealthy } from "../services/scraper";
import { upsertCareerStats } from "../lib/snapshot";
import { cacheGet, cacheSet } from "./redis";
import { logger } from "../utils/logger";

const FAIL_MARK_TTL = 7 * 86400; // don't retry a broken ID for 7 days

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait (bounded) for the ML scraper service to answer its health check. On a
 * fresh Render deploy the ML service is a separate instance that may still be
 * cold-starting (30-50s) when this bootstrap runs. Giving it a chance to wake
 * lets the FREE scraper path populate the DB on the very first deploy instead
 * of failing every player and leaving the battle results page empty.
 */
async function waitForScraper(maxWaitMs = 90_000, stepMs = 5_000): Promise<boolean> {
  if (await isScraperHealthy()) return true;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(stepMs);
    if (await isScraperHealthy()) return true;
  }
  return false;
}

async function bootstrap(): Promise<void> {
  // The backfill runs on the FREE Cricbuzz scraper (via the ML service) as its
  // primary source; RapidAPI is only an optional paid fallback. Gating the
  // whole bootstrap behind RAPIDAPI_KEY meant a scraper-only deploy NEVER
  // populated player_career_stats — so the battle results page had no real
  // data to compare, which is the headline bug. Run whenever EITHER the free
  // scraper is reachable OR a RapidAPI key is present.
  const hasKey = !!process.env.RAPIDAPI_KEY;
  const scraperUp = await waitForScraper();
  if (!scraperUp && !hasKey) {
    logger.warn(
      "[bootstrap] Neither the free scraper nor RAPIDAPI_KEY is available — skipping stats bootstrap. " +
      "The refresher + on-demand battle fetch will populate stats once a source comes online.",
    );
    return;
  }
  logger.info(
    `[bootstrap] Stats source: ${scraperUp ? "free scraper" : "RapidAPI only"}` +
    `${scraperUp && hasKey ? " (RapidAPI fallback available)" : ""}`,
  );

  // Idempotency: only players with NO career stats rows at all.
  const pending = await query<{ id: string; cricbuzz_player_id: string; name: string }>(
    `SELECT p.id, p.cricbuzz_player_id, p.name
       FROM players p
      WHERE p.cricbuzz_player_id IS NOT NULL
        AND p.cricbuzz_player_id <> ''
        AND NOT EXISTS (
          SELECT 1 FROM player_career_stats s WHERE s.player_id = p.id
        )
      ORDER BY p.name`
  );

  if (pending.length === 0) {
    logger.info("[bootstrap] All players already have career stats — nothing to do (0 credits spent)");
    return;
  }

  logger.info(
    `[bootstrap] ${pending.length} player(s) missing career stats — starting ` +
    `(free via scraper; RapidAPI fallback ~3 credits each only if the scraper fails)`
  );

  let done = 0;
  let failed = 0;
  let skipped = 0;

  for (const player of pending) {
    const failKey = `bootstrap:failed:${player.cricbuzz_player_id}`;
    if (await cacheGet(failKey)) {
      skipped++;
      continue; // recently failed — don't re-spend
    }

    try {
      // Scraper first (free), RapidAPI fallback. Records which source served.
      const { source, stats } = await getPlayerStatsWithFallback(player.cricbuzz_player_id);

      if (!stats.career.length) {
        // Fetched OK but Cricbuzz has no stats for this ID — mark so we
        // don't re-spend on every deploy.
        await cacheSet(failKey, { name: player.name, reason: "empty career" }, FAIL_MARK_TTL);
        skipped++;
        logger.warn(`[bootstrap] ⚠️  ${player.name}: no career data on Cricbuzz — skipped`);
        continue;
      }

      const rows = await upsertCareerStats(player.id, stats.career, source);
      done++;
      logger.info(`[bootstrap] ✅ ${player.name} (${done}/${pending.length})`, { formats: rows, source });
    } catch (e: any) {
      if (e instanceof QuotaExhaustedError || e instanceof QuotaBlockedError) {
        // Quota errors are NOT player failures — don't mark this ID as
        // failed, just stop. Remaining players sync on a later run.
        logger.warn(
          `[bootstrap] Monthly quota reached after ${done} player(s) — stopping. ` +
          `Remaining players will sync on a later run (idempotent).`
        );
        break;
      }
      failed++;
      // Only cache-mark as failed when a paid RapidAPI key is in play — that
      // protects the 3-credit budget from re-spending on a genuinely broken
      // ID every deploy. On the free scraper-only path, retries cost nothing,
      // so let transient errors (ML cold-start, network blips) retry next
      // cycle instead of poisoning the player for 7 days.
      if (hasKey) {
        await cacheSet(failKey, { name: player.name, reason: e.message }, FAIL_MARK_TTL);
      }
      logger.warn(`[bootstrap] ❌ ${player.name}: ${e.message}`);
    }
  }

  const remaining = await getQuotaRemaining();
  logger.info(
    `[bootstrap] Complete — ${done} synced, ${failed} failed, ${skipped} skipped; ~${remaining} credits left this month`
  );
}

bootstrap()
  .catch((e) => {
    logger.error("[bootstrap] Fatal error", { error: e.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
    // Redis/keep-alive handles can keep the loop alive; this is a script.
    process.exit(process.exitCode ?? 0);
  });
