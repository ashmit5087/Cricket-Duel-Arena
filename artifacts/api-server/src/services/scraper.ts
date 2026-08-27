// src/services/scraper.ts
// ─────────────────────────────────────────────────────────────────────────────
// Thin client to the ml-service Cricbuzz scraper. Centralized so:
//   1. refresher.ts can swap getPlayerStats() to scraper-first → RapidAPI-
//      fallback in one place (Task 3)
//   2. The frontend's /api/scrape/* proxy and the refresher share the same
//      call path, so behavior is consistent
//   3. Cache / timeout / retry semantics live in one file, not scattered
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "../utils/logger";

const ML_URL = process.env.ML_URL ?? "http://localhost:8000";
const SCRAPER_TIMEOUT_MS = 15_000;

export interface ScraperPlayerStats {
  id: string;
  name: string;
  country: string;
  role: string;
  battingStyle: string;
  bowlingStyle: string;
  image: string;
  stats: {
    testMatches?: FormatRow;
    odiMatches?:  FormatRow;
    t20Matches?:  FormatRow;
    ipl?:         FormatRow;
  };
  source: string;
  fetchedAt: string;
  error?: string;
}

export interface FormatRow {
  Mat:  number;
  Inn:  number;
  Runs: number;
  Avg:  number;
  SR:   number;
  HS:   string;
  100:  number;
  50:   number;
  Wkts: number;
  Econ: number;
  BBI:  string;
}

export interface ScraperLiveMatch {
  match: string;
  url:   string;
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Scraper returned ${r.status}: ${body.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

/** Scrape a player's career stats from Cricbuzz (free, no RapidAPI credit). */
export async function fetchPlayerStatsFromScraper(cricbuzzId: string): Promise<ScraperPlayerStats> {
  return getJson<ScraperPlayerStats>(
    `${ML_URL}/scrape/player-stats/${cricbuzzId}`,
    SCRAPER_TIMEOUT_MS,
  );
}

/** Get currently live matches (for the Hero ticker). */
export async function fetchLiveMatchesFromScraper(): Promise<{ count: number; matches: ScraperLiveMatch[] }> {
  return getJson<{ count: number; matches: ScraperLiveMatch[] }>(
    `${ML_URL}/scrape/live-matches`,
    SCRAPER_TIMEOUT_MS,
  );
}

/** True if the scraper is reachable — used by refresher.ts to choose source. */
export async function isScraperHealthy(): Promise<boolean> {
  try {
    const r = await fetch(`${ML_URL}/scrape/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}
