// src/db/migrate.ts
// Run with: pnpm db:migrate
// Seeds the players table from PLAYER_ROSTER and initialises Elo ratings

import { pool, query, transaction } from "./postgres";
import { PLAYER_ROSTER, getCricbuzzImageUrl } from "../models/player";
import { logger } from "../utils/logger";

async function migrate() {
  logger.info("[migrate] Starting database seed...");

  await transaction(async (client) => {

    // ── Upsert every player in the roster ──────────────────────────────────

    for (const p of PLAYER_ROSTER) {
      await client.query(
        `INSERT INTO players
           (internal_id, cricbuzz_player_id, name, country, flag, role,
            archetype_id, archetype_name, image_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (internal_id) DO UPDATE SET
           cricbuzz_player_id = EXCLUDED.cricbuzz_player_id,
           name               = EXCLUDED.name,
           country            = EXCLUDED.country,
           flag               = EXCLUDED.flag,
           role               = EXCLUDED.role,
           archetype_id       = EXCLUDED.archetype_id,
           archetype_name     = EXCLUDED.archetype_name,
           image_url          = EXCLUDED.image_url,
           updated_at         = NOW()`,
        [
          p.internalId,
          p.cricbuzzPlayerId,
          p.name,
          p.country,
          p.flag,
          p.role,
          p.archetypeId,
          p.archetypeName,
          getCricbuzzImageUrl(p.cricbuzzPlayerId),
        ]
      );
    }

    logger.info(`[migrate] Upserted ${PLAYER_ROSTER.length} players`);

    // ── Seed Elo ratings for every player ──────────────────────────────────

    await client.query(`
      INSERT INTO elo_ratings (player_id, rating, format, peak_rating)
      SELECT id, 1500, 'overall', 1500 FROM players
      ON CONFLICT (player_id, format) DO NOTHING
    `);

    logger.info("[migrate] Elo ratings initialised");

    // ── Seed streaks for every player ──────────────────────────────────────

    for (const streakType of ["battle_win", "form", "clutch", "pressure"]) {
      await client.query(`
        INSERT INTO streaks (player_id, streak_type, current_count, best_count)
        SELECT id, $1, 0, 0 FROM players
        ON CONFLICT (player_id, streak_type) DO NOTHING
      `, [streakType]);
    }

    logger.info("[migrate] Streaks initialised");

    // ── Create quiz_attempts table if not exists ──────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        quiz_id     TEXT NOT NULL,
        user_id     TEXT,
        score       INT NOT NULL,
        max_score   INT NOT NULL,
        percentage  INT NOT NULL,
        tier        TEXT NOT NULL,
        answers     JSONB NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz
        ON quiz_attempts(quiz_id, score DESC)
    `);

    logger.info("[migrate] quiz_attempts table ensured");

    // ── Add ml_verdicts column to battle_outcomes if missing ──────────────

    await client.query(`
      ALTER TABLE battle_outcomes
        ADD COLUMN IF NOT EXISTS ml_verdicts JSONB
    `).catch(() => {
      // Column may already exist — safe to ignore
    });

    logger.info("[migrate] ml_verdicts column ensured");
  });

  logger.info("[migrate] ✅ Migration complete");
  await pool.end();
}

migrate().catch((e) => {
  logger.error("[migrate] FAILED", { error: e.message });
  process.exit(1);
});
