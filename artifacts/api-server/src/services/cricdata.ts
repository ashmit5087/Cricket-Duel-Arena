import { redis, budgetIncr, getBudgetCount } from "../db/redis";
import { logger } from "../utils/logger";

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY    = process.env.CRICDATA_API_KEY ?? "";
const BASE_URL   = process.env.CRICDATA_BASE_URL   ?? "https://api.cricapi.com";
const DAILY_LIMIT = parseInt(process.env.CRICDATA_DAILY_LIMIT ?? "100", 10);

// ── In-memory fallback for when Redis is unavailable ─────────────────────────

const memoryBudget = new Map<string, number>();

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayKey(): string {
  return `cricdata:daily:${new Date().toISOString().slice(0, 10)}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Exported types ─────────────────────────────────────────────────────────────

export interface CricDataPlayerSummary {
  id: string;       // UUID from CricAPI
  name: string;
  country: string;
}

export interface CricDataCareerRow {
  format: "TEST" | "ODI" | "T20I" | "IPL";
  matches: number;
  innings: number;
  runs: number;
  avg: number;
  sr: number;
  hundreds: number;
  fifties: number;
  highest: string;
  wickets: number;
  economy: number;
  bestBowl: string;
}

export interface CricDataPlayer {
  id: string;
  name: string;
  country: string;
  role: string;
  battingStyle: string;
  bowlingStyle: string;
  career: CricDataCareerRow[];
}

export interface BudgetStatus {
  date: string;       // YYYY-MM-DD
  used: number;
  remaining: number;
  limit: number;
}

// ── Custom error ───────────────────────────────────────────────────────────────

export class CricDataBudgetExceededError extends Error {
  constructor(used: number, limit: number) {
    super(`CricData daily budget exceeded: ${used}/${limit} requests used`);
    this.name = "CricDataBudgetExceededError";
  }
}

// ── Budget status ──────────────────────────────────────────────────────────────

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const key  = todayKey();
  const date = todayDate();

  let used = 0;
  try {
    used = await getBudgetCount(key);
  } catch {
    // Redis unavailable — use in-memory fallback
    used = memoryBudget.get(key) ?? 0;
  }

  return {
    date,
    used,
    remaining: Math.max(0, DAILY_LIMIT - used),
    limit: DAILY_LIMIT,
  };
}

// ── Internal fetch with budget gate ───────────────────────────────────────────

async function cricDataFetch<T>(path: string): Promise<T> {
  const key = todayKey();
  let count: number;

  try {
    count = await budgetIncr(key, DAILY_LIMIT);
  } catch {
    // Redis unavailable — fall back to in-memory counter
    const current = memoryBudget.get(key) ?? 0;
    count = current + 1;
    memoryBudget.set(key, count);
  }

  if (count > DAILY_LIMIT) {
    throw new CricDataBudgetExceededError(count, DAILY_LIMIT);
  }

  const url = `${BASE_URL}${path}&apikey=${API_KEY}`;
  const response = await fetch(url);

  logger.info("[cricdata] Request made", {
    path,
    budgetUsed: count,
    budgetLimit: DAILY_LIMIT,
    budgetRemaining: Math.max(0, DAILY_LIMIT - count),
  });

  if (!response.ok) {
    throw new Error(
      `CricData API error: ${response.status} ${response.statusText} — ${path}`
    );
  }

  return response.json() as Promise<T>;
}

// ── Stat parser helper ────────────────────────────────────────────────────────

interface RawStat {
  fn: string;
  matchtype: string;
  stat: string;
  value: string;
}

function getStat(
  stats: RawStat[],
  fn: string,
  matchtype: string,
  stat: string
): string {
  const entry = stats.find(
    (s) => s.fn === fn && s.matchtype === matchtype && s.stat === stat
  );
  return entry?.value ?? "0";
}

// Maps CricAPI matchtype strings to our format labels.
// CricAPI uses "t20" for T20 Internationals (not "t20i") — map both to be safe.
const MATCHTYPE_MAP: Record<string, CricDataCareerRow["format"] | null> = {
  test:  "TEST",
  odi:   "ODI",
  t20i:  "T20I",
  t20:   "T20I",   // CricAPI uses "t20" for T20 Internationals
  ipl:   "IPL",
};

function parseCareer(stats: RawStat[]): CricDataCareerRow[] {
  const matchtypes = [...new Set(stats.map((s) => s.matchtype))];

  // Build one row per raw matchtype, then deduplicate mapped formats
  // (e.g. both "t20" and "t20i" → "T20I": keep the one with more matches)
  const byFormat = new Map<CricDataCareerRow["format"], CricDataCareerRow>();

  for (const mt of matchtypes) {
    const format = MATCHTYPE_MAP[mt];
    if (!format) continue;

    const row: CricDataCareerRow = {
      format,
      matches:  parseInt(getStat(stats, "batting", mt, "mat"),  10) || 0,
      innings:  parseInt(getStat(stats, "batting", mt, "inns"), 10) || 0,
      runs:     parseInt(getStat(stats, "batting", mt, "runs"), 10) || 0,
      avg:      parseFloat(getStat(stats, "batting", mt, "avg"))    || 0,
      sr:       parseFloat(getStat(stats, "batting", mt, "sr"))     || 0,
      hundreds: parseInt(getStat(stats, "batting", mt, "100"),  10) || 0,
      fifties:  parseInt(getStat(stats, "batting", mt, "50"),   10) || 0,
      highest:  getStat(stats, "batting", mt, "hs") || "0",
      wickets:  parseInt(getStat(stats, "bowling", mt, "wkts"), 10) || 0,
      economy:  parseFloat(getStat(stats, "bowling", mt, "econ"))   || 0,
      bestBowl: getStat(stats, "bowling", mt, "bbi") || "-",
    };

    const existing = byFormat.get(format);
    // Keep the row with more matches when duplicates exist
    if (!existing || row.matches > existing.matches) {
      byFormat.set(format, row);
    }
  }

  return [...byFormat.values()];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Search for players by name. Returns up to 8 results.
 */
export async function searchCricDataPlayer(
  name: string
): Promise<CricDataPlayerSummary[]> {
  const data = await cricDataFetch<{
    status: string;
    data: Array<{ id: string; name: string; country: string }>;
  }>(`/v1/players?search=${encodeURIComponent(name)}`);

  return (data.data ?? []).slice(0, 8).map((p) => ({
    id:      p.id,
    name:    p.name,
    country: p.country,
  }));
}

/**
 * Fetch full player profile including career stats.
 */
export async function getCricDataPlayer(id: string): Promise<CricDataPlayer> {
  const data = await cricDataFetch<{
    data: {
      id: string;
      name: string;
      country: string;
      playerInfo: {
        role: string;
        battingStyle: string;
        bowlingStyle: string;
      };
      stats: RawStat[];
    };
  }>(`/v1/players_info?id=${id}`);

  const p = data.data;

  return {
    id:           p.id,
    name:         p.name,
    country:      p.country,
    role:         p.playerInfo?.role         ?? "",
    battingStyle: p.playerInfo?.battingStyle ?? "",
    bowlingStyle: p.playerInfo?.bowlingStyle ?? "",
    career:       parseCareer(p.stats ?? []),
  };
}
