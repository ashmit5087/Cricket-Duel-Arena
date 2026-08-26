// src/db/bootstrapStats.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-off, IDEMPOTENT career-stats bootstrap.
//
// Fetches Cricbuzz career stats (3 credits each) for every player that has a
// cricbuzz_player_id but NO rows in player_career_stats yet. Safe to run on
// every deploy: once everyone is synced it spends 0 credits and exits.
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
import { getPlayerStats, QuotaExhaustedError, getQuotaRemaining } from "../services/cricbuzz";
import { upsertCareerStats } from "../lib/snapshot";
import { cacheGet, cacheSet } from "./redis";
import { logger } from "../utils/logger";

const FAIL_MARK_TTL = 7 * 86400; // don't retry a broken ID for 7 days

async function bootstrap(): Promise<void> {
  if (!process.env.RAPIDAPI_KEY) {
    logger.info("[bootstrap] RAPIDAPI_KEY not set — skipping stats bootstrap");
    return;
  }

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
    `[bootstrap] ${pending.length} player(s) missing career stats — starting (3 credits each, ~${pending.length * 3} total)`
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
      const stats = await getPlayerStats(player.cricbuzz_player_id); // 3 credits

      if (!stats.career.length) {
        // Fetched OK but Cricbuzz has no stats for this ID — mark so we
        // don't re-spend on every deploy.
        await cacheSet(failKey, { name: player.name, reason: "empty career" }, FAIL_MARK_TTL);
        skipped++;
        logger.warn(`[bootstrap] ⚠️  ${player.name}: no career data on Cricbuzz — skipped`);
        continue;
      }

      const rows = await upsertCareerStats(player.id, stats.career);
      done++;
      logger.info(`[bootstrap] ✅ ${player.name} (${done}/${pending.length})`, { formats: rows });
    } catch (e: any) {
      if (e instanceof QuotaExhaustedError) {
        logger.warn(
          `[bootstrap] Monthly quota reached after ${done} player(s) — stopping. ` +
          `Remaining players will sync on a later run (idempotent).`
        );
        break;
      }
      failed++;
      await cacheSet(failKey, { name: player.name, reason: e.message }, FAIL_MARK_TTL);
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
