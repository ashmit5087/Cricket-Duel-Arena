// src/lib/features.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure mapping function: CareerStats → ML service PlayerFeatures shape.
// Used when building the request body for POST {ML_URL}/battle/predict.
// ─────────────────────────────────────────────────────────────────────────────

import type { CareerStats } from "../models/player";

export interface MLPlayerFeatures {
  odiStats: { avg: number; sr: number; hundreds: number; fifties: number; matches: number; economy: number; wickets: number };
  testStats: { avg: number; sr: number; hundreds: number; fifties: number; matches: number; economy: number; wickets: number };
  t20Stats: { avg: number; sr: number; hundreds: number; fifties: number; matches: number; economy: number; wickets: number };
  iplStats: { avg: number; sr: number; hundreds: number; fifties: number; matches: number; economy: number; wickets: number };
  dnaScore: number;
  momentumScore: number;
  clutchScore: number;
}

function mapFormat(stats: CareerStats | null | undefined): {
  avg: number; sr: number; hundreds: number; fifties: number;
  matches: number; economy: number; wickets: number;
} {
  if (!stats) {
    return { avg: 0, sr: 0, hundreds: 0, fifties: 0, matches: 0, economy: 0, wickets: 0 };
  }
  return {
    avg:      stats.avg      ?? 0,
    sr:       stats.sr       ?? 0,
    hundreds: stats.hundreds ?? 0,
    fifties:  stats.fifties  ?? 0,
    matches:  stats.matches  ?? 0,
    economy:  stats.economy  ?? 0,
    wickets:  stats.wickets  ?? 0,
  };
}

/**
 * Maps the internal CareerStats per format into the shape the ML service expects.
 * Identity fields (name, country, id) are intentionally excluded so the ML model
 * has no mechanism to learn or favour a specific player's identity.
 */
export function mapStatsToFeatures(
  testStats: CareerStats | null | undefined,
  odiStats:  CareerStats | null | undefined,
  t20Stats:  CareerStats | null | undefined,
  iplStats:  CareerStats | null | undefined,
  dnaScore?: number,
  momentumScore?: number,
  clutchScore?: number,
): MLPlayerFeatures {
  return {
    testStats: mapFormat(testStats),
    odiStats:  mapFormat(odiStats),
    t20Stats:  mapFormat(t20Stats),
    iplStats:  mapFormat(iplStats),
    dnaScore:      dnaScore      ?? 50,
    momentumScore: momentumScore ?? 50,
    clutchScore:   clutchScore   ?? 50,
  };
}
