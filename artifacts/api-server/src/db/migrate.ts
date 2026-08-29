// src/db/migrate.ts
// Run with: pnpm db:migrate
// 1. Applies schema.sql (CREATE TABLE IF NOT EXISTS — safe to re-run)
// 2. Seeds the players table from PLAYER_ROSTER
// 3. Initialises Elo ratings and streaks

import * as fs from "fs";
import * as path from "path";
import { pool, query, transaction } from "./postgres";
import { PLAYER_ROSTER, getCricbuzzImageUrl } from "../models/player";
import { logger } from "../utils/logger";

// Players whose career is final — never re-fetch stats to save scraper quota.
// ESPN IDs (espnId) used as the canonical key since they match PLAYER_ROSTER.
const RETIRED_ESPN_IDS = new Set([
  "35320",  // Sachin Tendulkar
  "28114",  // Rahul Dravid
  "30176",  // Anil Kumble
  "13552",  // Shane Warne
  "4188",   // Glenn McGrath
  "44936",  // AB de Villiers
  "7133",   // Ricky Ponting
  "49536",  // Lasith Malinga
  "50710",  // Kumar Sangakkara
  "52337",  // Brian Lara
  "51880",  // Chris Gayle
  "45789",  // Jacques Kallis
  "28779",  // Sourav Ganguly
  "35263",  // Virender Sehwag
  "43209",  // Harbhajan Singh
  "43429",  // Imran Khan
  "44828",  // Dale Steyn
  "8917",   // Wasim Akram
  "40439",  // Younis Khan
  "43290",  // Shahid Afridi
  "43263",  // Shoaib Akhtar
  "8166",   // Brett Lee
  "48749",  // Mahela Jayawardene
  "42656",  // Hashim Amla
  "84985",  // Brendon McCullum
  "49636",  // Muttiah Muralitharan
  "31905",  // Adam Gilchrist
  "28081",  // MS Dhoni (retired from Tests/ODIs/T20Is)
]);


async function applySchema(): Promise<void> {
  // schema.sql lives next to this file at src/db/schema.sql
  // After tsc it compiles to dist/db/ so __dirname points there;
  // walk up to find schema.sql in both src and dist layouts.
  const candidates = [
    path.join(__dirname, "schema.sql"),                          // dist/db/schema.sql
    path.join(__dirname, "..", "..", "src", "db", "schema.sql"), // from dist/ back to src/
  ];

  let schemaPath: string | null = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { schemaPath = c; break; }
  }

  if (!schemaPath) {
    throw new Error("schema.sql not found — cannot apply database schema");
  }

  const sql = fs.readFileSync(schemaPath, "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    logger.info("[migrate] ✅ Schema applied from " + schemaPath);
  } finally {
    client.release();
  }
}

async function migrate() {
  logger.info("[migrate] Starting migration...");

  // ── Step 1: Apply schema (idempotent — uses IF NOT EXISTS) ─────────────────
  await applySchema();

  // ── Step 2: Seed players + Elo ratings + streaks ─────────────────────
  await transaction(async (client) => {

    // ── Upsert every player in the roster ──────────────────────────────────────

    for (const p of PLAYER_ROSTER) {
      const isRetired = p.espnId ? RETIRED_ESPN_IDS.has(p.espnId) : false;
      await client.query(
        `INSERT INTO players
           (internal_id, cricbuzz_player_id, name, country, flag, role,
            archetype_id, archetype_name, image_url, is_retired)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (internal_id) DO UPDATE SET
           cricbuzz_player_id = EXCLUDED.cricbuzz_player_id,
           name               = EXCLUDED.name,
           country            = EXCLUDED.country,
           flag               = EXCLUDED.flag,
           role               = EXCLUDED.role,
           archetype_id       = EXCLUDED.archetype_id,
           archetype_name     = EXCLUDED.archetype_name,
           image_url          = EXCLUDED.image_url,
           is_retired         = EXCLUDED.is_retired,
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
          isRetired,
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

    // ── stats_source column on player_career_stats (Task 3) ──────────────
    // Records which backend served each row: 'scraper' (free, primary) or
    // 'rapidapi' (3-credit fallback when scraper fails). Defaults to
    // 'rapidapi' for backward-compat with rows written before this column
    // existed — they were fetched via getPlayerStats().

    await client.query(`
      ALTER TABLE player_career_stats
        ADD COLUMN IF NOT EXISTS stats_source TEXT NOT NULL DEFAULT 'rapidapi'
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_career_stats_source
        ON player_career_stats(stats_source)
    `);

    logger.info("[migrate] stats_source column ensured");

    // ── Add ml_verdicts column to battle_outcomes if missing ──────────────

    await client.query(`
      ALTER TABLE battle_outcomes
        ADD COLUMN IF NOT EXISTS ml_verdicts JSONB
    `).catch(() => {
      // Column may already exist — safe to ignore
    });

    logger.info("[migrate] ml_verdicts column ensured");

    // ── Snapshot-first architecture columns ────────────────────────────────
    // recent_form / radar_axes live on players; elo stays in elo_ratings.

    await client.query(`
      ALTER TABLE players
        ADD COLUMN IF NOT EXISTS recent_form JSONB,
        ADD COLUMN IF NOT EXISTS radar_axes JSONB,
        ADD COLUMN IF NOT EXISTS pending_refresh BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS is_retired BOOLEAN NOT NULL DEFAULT FALSE
    `);

    logger.info("[migrate] players snapshot columns ensured");

    // Queue of roster-miss players awaiting their first stats refresh.

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_queue (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        internal_id TEXT UNIQUE NOT NULL,
        cricbuzz_player_id TEXT,
        name        TEXT NOT NULL,
        country     TEXT,
        queued_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    logger.info("[migrate] refresh_queue table ensured");
  });

  logger.info("[migrate] ✅ Migration complete");
  // Only close the pool when running as a standalone script.
  // When called programmatically from index.ts the server reuses the pool.
  if (require.main === module) await pool.end();
}

if (require.main === module) {
  migrate().catch((e) => {
    logger.error("[migrate] FAILED", { error: e.message });
    process.exit(1);
  });
}

export { migrate };
