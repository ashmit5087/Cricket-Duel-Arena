// src/lib/snapshot.ts
// ─────────────────────────────────────────────────────────────────────────────
// DB-only player snapshot loader.
//
// Reads career stats + recent form + Elo from Postgres. NO external API
// calls — those happen exclusively in workers/refresher.ts. This is what
// makes battles instant, unbiased (same snapshot for both sides), and
// quota-free per request.
// ─────────────────────────────────────────────────────────────────────────────

import { query } from "../db/postgres";
import type { CricbuzzPlayerStats } from "../services/cricbuzz";

// ── Write path (used by refresher worker + one-off bootstrap script) ─────────

import type { StatsSource } from "../services/cricbuzz";

/**
 * Upsert parsed Cricbuzz career rows into player_career_stats.
 * Bumps last_synced — that timestamp drives staleness checks everywhere.
 * The `source` arg records which backend served the row ("scraper" or
 * "rapidapi") for observability + cost auditing (Task 3).
 */
export async function upsertCareerStats(
  playerId: string,
  career: CricbuzzPlayerStats["career"],
  source: StatsSource = "rapidapi"
): Promise<number> {
  let written = 0;
  for (const c of career) {
    await query(
      `INSERT INTO player_career_stats
         (player_id, format, matches, innings, runs, avg, sr, hundreds, fifties,
          highest, wickets, economy, best_bowl, last_synced, stats_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14)
       ON CONFLICT (player_id, format) DO UPDATE SET
         matches = EXCLUDED.matches, innings = EXCLUDED.innings,
         runs = EXCLUDED.runs, avg = EXCLUDED.avg, sr = EXCLUDED.sr,
         hundreds = EXCLUDED.hundreds, fifties = EXCLUDED.fifties,
         highest = EXCLUDED.highest, wickets = EXCLUDED.wickets,
         economy = EXCLUDED.economy, best_bowl = EXCLUDED.best_bowl,
         last_synced = NOW(),
         stats_source = EXCLUDED.stats_source`,
      [playerId, c.format, c.matches, c.innings, c.runs, c.avg, c.sr,
       c.hundreds, c.fifties, c.highest, c.wickets ?? 0, c.economy ?? 0, c.bestBowl ?? "-",
       source]
    );
    written++;
  }
  return written;
}

export interface SnapshotCareerRow {
  format:   string;
  matches:  number;
  innings:  number;
  runs:     number;
  avg:      number;
  sr:       number;
  hundreds: number;
  fifties:  number;
  highest:  string;
  wickets:  number;
  economy:  number;
  bestBowl: string;
}

export interface PlayerSnapshot {
  internalId:        string;
  cricbuzzPlayerId:  string;
  name:              string;
  country:           string;
  role:              string;
  imageUrl?:         string;
  career:            SnapshotCareerRow[];
  recentForm:        unknown[];
  radarAxes:         unknown | null;
  eloRating:         number;
  hasStats:          boolean;   // false → "stats pending" placeholder
}

export async function loadPlayerSnapshot(internalIdOrCricbuzzId: string): Promise<PlayerSnapshot | null> {
  const res = await query(
    `SELECT p.id, p.internal_id, p.cricbuzz_player_id, p.name, p.country, p.role,
            p.image_url, p.recent_form, p.radar_axes,
            COALESCE(e.rating, 1500) AS elo_rating
       FROM players p
       LEFT JOIN elo_ratings e ON e.player_id = p.id AND e.format = 'overall'
      WHERE p.internal_id = $1 OR p.cricbuzz_player_id = $1
      LIMIT 1`,
    [internalIdOrCricbuzzId]
  );

  const row = res[0];
  if (!row) return null;

  const statsRows = await query(
    `SELECT format, matches, innings, runs, avg, sr, hundreds, fifties,
            highest, wickets, economy, best_bowl
       FROM player_career_stats
      WHERE player_id = $1`,
    [row.id]
  );

  const career: SnapshotCareerRow[] = statsRows.map((r: any) => ({
    format:   r.format,
    matches:  Number(r.matches ?? 0),
    innings:  Number(r.innings ?? 0),
    runs:     Number(r.runs ?? 0),
    avg:      Number(r.avg ?? 0),
    sr:       Number(r.sr ?? 0),
    hundreds: Number(r.hundreds ?? 0),
    fifties:  Number(r.fifties ?? 0),
    highest:  r.highest ?? "0",
    wickets:  Number(r.wickets ?? 0),
    economy:  Number(r.economy ?? 0),
    bestBowl: r.best_bowl ?? "-",
  }));

  return {
    internalId:       row.internal_id,
    cricbuzzPlayerId: row.cricbuzz_player_id ?? "",
    name:             row.name,
    country:          row.country,
    role:             row.role,
    imageUrl:         row.image_url ?? undefined,
    career,
    recentForm:       row.recent_form ?? [],
    radarAxes:        row.radar_axes ?? null,
    eloRating:        Number(row.elo_rating ?? 1500),
    hasStats:         career.length > 0 && career.some((c) => c.matches > 0),
  };
}
