import { logger } from "../utils/logger";
import { redis } from "../db/redis";
import { fetchPlayerStatsFromScraper, type ScraperPlayerStats } from "./scraper";

// ── Config ────────────────────────────────────────────────────────────────────

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY ?? "";
const RAPIDAPI_HOST = "cricbuzz-cricket.p.rapidapi.com";
const BASE_URL      = `https://${RAPIDAPI_HOST}`;
const MIN_REQUEST_GAP_MS = parseInt(process.env.CRICBUZZ_MIN_REQUEST_GAP_MS ?? "250", 10);
const MAX_RETRIES = parseInt(process.env.CRICBUZZ_MAX_RETRIES ?? "1", 10);
const DEFAULT_BACKOFF_MS = parseInt(process.env.CRICBUZZ_BACKOFF_MS ?? "5000", 10);
const QUOTA_BLOCK_MS = parseInt(process.env.CRICBUZZ_QUOTA_BLOCK_MS ?? String(60 * 60 * 1000), 10);

// Monthly RapidAPI free-tier budget — self-block before the provider does.
const MONTHLY_QUOTA_LIMIT = parseInt(process.env.CRICBUZZ_MONTHLY_QUOTA ?? "190", 10);
const MONTHLY_KEY_PREFIX = "cricbuzz:quota:";   // cricbuzz:quota:2026-08

export class QuotaExhaustedError extends Error {
  constructor() { super("Cricbuzz monthly quota exhausted locally"); }
}

/** RapidAPI told us the monthly plan quota is gone (429), or we self-blocked. */
export class QuotaBlockedError extends Error {
  constructor(message: string) { super(message); }
}

/**
 * Atomically spend one credit. Returns false if the monthly budget is gone.
 * Key rolls over by calendar month; in-memory fallback resets on restart.
 */
async function spendCredit(): Promise<boolean> {
  const monthKey = `${MONTHLY_KEY_PREFIX}${new Date().toISOString().slice(0, 7)}`;
  try {
    const count = await redis.incr(monthKey, MONTHLY_QUOTA_LIMIT);
    // Roll over at month boundary: first incr of a new month key starts fresh
    if (count === 1) await redis.expire(monthKey, 40 * 86400);
    return count <= MONTHLY_QUOTA_LIMIT;
  } catch {
    return true; // never hard-block battles because Redis hiccupped
  }
}

/** How many credits remain this month (for /api/budget + escape-hatch gating). */
export async function getQuotaRemaining(): Promise<number> {
  const monthKey = `${MONTHLY_KEY_PREFIX}${new Date().toISOString().slice(0, 7)}`;
  const used = parseInt((await redis.get(monthKey)) ?? "0", 10);
  return Math.max(0, MONTHLY_QUOTA_LIMIT - used);
}

/** Local view of the monthly RapidAPI budget (backs GET /api/quota). */
export async function getQuotaStatus(): Promise<{ limit: number; used: number; remaining: number }> {
  const monthKey = `${MONTHLY_KEY_PREFIX}${new Date().toISOString().slice(0, 7)}`;
  const used = parseInt((await redis.get(monthKey)) ?? "0", 10);
  return { limit: MONTHLY_QUOTA_LIMIT, used, remaining: Math.max(0, MONTHLY_QUOTA_LIMIT - used) };
}

const HEADERS = {
  "x-rapidapi-key":  RAPIDAPI_KEY,
  "x-rapidapi-host": RAPIDAPI_HOST,
  "Accept":          "application/json",
};

// ── Rate limit state ──────────────────────────────────────────────────────────

let nextRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();
let quotaBlockedUntil = 0;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function endpointLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

async function parseJsonResponse(res: Response): Promise<any> {
  const raw = await res.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

async function throttleRequest(): Promise<void> {
  const run = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs > 0) await delay(waitMs);
    nextRequestAt = Date.now() + MIN_REQUEST_GAP_MS;
  });

  requestQueue = run.catch(() => {});
  await run;
}

async function rateLimitedFetch(url: string, attempt = 0): Promise<any> {
  if (!RAPIDAPI_KEY) {
    throw new Error("RAPIDAPI_KEY not set in environment");
  }

  // Check the local block BEFORE spending a credit, so blocked calls
  // don't inflate the monthly counter.
  if (Date.now() < quotaBlockedUntil) {
    throw new QuotaBlockedError(
      `Cricbuzz API 429: RapidAPI monthly quota exceeded; blocked locally until ${new Date(quotaBlockedUntil).toISOString()}`
    );
  }

  if (!(await spendCredit())) {
    throw new QuotaExhaustedError();
  }

  await throttleRequest();
  const res = await fetch(url, { headers: HEADERS });
  const endpoint = endpointLabel(url);

  if (res.status === 429) {
    const body = await parseJsonResponse(res);
    const message = String(body?.message ?? "rate limited");
    const isMonthlyQuota = /monthly quota|quota/i.test(message);

    if (isMonthlyQuota) {
      quotaBlockedUntil = Date.now() + QUOTA_BLOCK_MS;
      logger.warn("[cricbuzz] RapidAPI monthly quota exceeded; pausing external calls", {
        endpoint,
        blockedUntil: new Date(quotaBlockedUntil).toISOString(),
      });
      throw new QuotaBlockedError(`Cricbuzz API 429: ${message}`);
    }

    if (attempt >= MAX_RETRIES) {
      throw new Error(`Cricbuzz API 429 after ${attempt + 1} attempt(s): ${message}`);
    }

    const backoffMs = parseRetryAfter(res.headers.get("retry-after")) ?? DEFAULT_BACKOFF_MS;
    logger.warn("[cricbuzz] Rate limited; backing off before retry", {
      endpoint,
      attempt: attempt + 1,
      backoffMs,
      message,
    });
    await delay(backoffMs);
    return rateLimitedFetch(url, attempt + 1);
  }

  if (!res.ok) {
    const body = await parseJsonResponse(res);
    throw new Error(`Cricbuzz API ${res.status}: ${endpoint} - ${body?.message ?? res.statusText}`);
  }

  return parseJsonResponse(res);
}

// ── Typed response shapes ─────────────────────────────────────────────────────

export interface CricbuzzMatch {
  matchId:       string;
  seriesName:    string;
  matchType:     string;
  status:        string;
  teamA:         { name: string; shortName: string };
  teamB:         { name: string; shortName: string };
  venue:         string;
  startTime?:    number;
}

export interface CricbuzzScorecard {
  matchId:    string;
  matchType:  string;
  innings:    CricbuzzInnings[];
}

export interface CricbuzzInnings {
  inningsId:    number;
  battingTeam:  string;
  bowlingTeam:  string;
  runs:         number;
  wickets:      number;
  overs:        number;
  batsmen:      CricbuzzBatsman[];
  bowlers:      CricbuzzBowler[];
}

export interface CricbuzzBatsman {
  playerId:   string;
  playerName: string;
  runs:       number;
  balls:      number;
  fours:      number;
  sixes:      number;
  strikeRate: number;
  isOnStrike: boolean;
  isOut:      boolean;
  dismissal?: string;
}

export interface CricbuzzBowler {
  playerId:   string;
  playerName: string;
  overs:      number;
  wickets:    number;
  runs:       number;
  economy:    number;
  isBowling:  boolean;
}

export interface CricbuzzPlayerStats {
  playerId:     string;
  playerName:   string;
  country:      string;
  role:         string;
  battingStyle: string;
  bowlingStyle: string;
  intlDebut?:   string;
  career: {
    format:   string;
    matches:  number;
    innings:  number;
    runs:     number;
    avg:      number;
    sr:       number;
    hundreds: number;
    fifties:  number;
    highest:  string;
    wickets?: number;
    economy?: number;
    bestBowl?:string;
  }[];
}

export interface CricbuzzCommentary {
  matchId:   string;
  ballIndex: number;
  over:      number;
  ball:      number;
  runs:      number;
  isWicket:  boolean;
  text:      string;
  bowler:    string;
  batsman:   string;
}

// ── API Functions ─────────────────────────────────────────────────────────────

/** All currently live matches */
export async function getLiveMatches(): Promise<CricbuzzMatch[]> {
  const data = await rateLimitedFetch(`${BASE_URL}/matches/v1/live`);

  // Cricbuzz returns nested type groups
  const allMatches: CricbuzzMatch[] = [];
  for (const typeGroup of data?.typeMatches ?? []) {
    for (const seriesMatch of typeGroup?.seriesMatches ?? []) {
      for (const match of seriesMatch?.seriesAdWrapper?.matches ?? []) {
        const mi = match?.matchInfo;
        if (!mi) continue;
        allMatches.push({
          matchId:    String(mi.matchId),
          seriesName: mi.seriesName ?? "Unknown Series",
          matchType:  mi.matchFormat ?? "T20",
          status:     mi.state ?? "live",
          teamA:      { name: mi.team1?.teamName ?? "Team A", shortName: mi.team1?.teamSName ?? "A" },
          teamB:      { name: mi.team2?.teamName ?? "Team B", shortName: mi.team2?.teamSName ?? "B" },
          venue:      mi.venueInfo?.ground ?? "Unknown Venue",
          startTime:  mi.startDate,
        });
      }
    }
  }
  return allMatches;
}

/** Live scorecard for a specific match */
export async function getMatchScorecard(matchId: string): Promise<CricbuzzScorecard> {
  const data = await rateLimitedFetch(`${BASE_URL}/mcenter/v1/${matchId}/hscard`);

  const innings: CricbuzzInnings[] = [];
  for (const inn of data?.scoreCard ?? []) {
    innings.push({
      inningsId:   inn.inningsId ?? 1,
      battingTeam: inn.batTeamDetails?.batTeamName ?? "Unknown",
      bowlingTeam: "Unknown",
      runs:        inn.scoreDetails?.runs ?? 0,
      wickets:     inn.scoreDetails?.wickets ?? 0,
      overs:       inn.scoreDetails?.overs ?? 0,
      batsmen:     (inn.batTeamDetails?.batsmenData
        ? Object.values(inn.batTeamDetails.batsmenData)
        : []).map((b: any) => ({
          playerId:   String(b.batId),
          playerName: b.batName,
          runs:       b.runs ?? 0,
          balls:      b.balls ?? 0,
          fours:      b.fours ?? 0,
          sixes:      b.sixes ?? 0,
          strikeRate: b.strikeRate ?? 0,
          isOnStrike: b.isStriker ?? false,
          isOut:      b.outDesc !== undefined && b.outDesc !== "",
          dismissal:  b.outDesc,
        })),
      bowlers: (inn.bowlTeamDetails?.bowlersData
        ? Object.values(inn.bowlTeamDetails.bowlersData)
        : []).map((b: any) => ({
          playerId:   String(b.bowlId),
          playerName: b.bowlName,
          overs:      b.overs ?? 0,
          wickets:    b.wickets ?? 0,
          runs:       b.runs ?? 0,
          economy:    b.economy ?? 0,
          isBowling:  b.isBowling ?? false,
        })),
    });
  }

  return { matchId, matchType: data?.matchHeader?.matchFormat ?? "T20", innings };
}

/** Career stats for a player */
async function getPlayerStats(cricbuzzPlayerId: string): Promise<CricbuzzPlayerStats> {
  const [info, batting, bowling] = await Promise.allSettled([
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}`),
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}/batting`),
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}/bowling`),
  ]);

  const playerInfo = info.status === "fulfilled" ? info.value : {};
  const battingData = batting.status === "fulfilled" ? batting.value : {};
  const bowlingData = bowling.status === "fulfilled" ? bowling.value : {};

  // If EVERY call failed (quota block, 429, network), propagate the error.
  // Returning an empty career here would look identical to "no data" and
  // would wrongly mark the player as failed for 7 days in bootstrap.
  if (info.status === "rejected" && batting.status === "rejected" && bowling.status === "rejected") {
    throw batting.reason ?? new Error("All Cricbuzz stat calls failed");
  }

  // Parse career rows
  const FORMAT_MAP: Record<string, string> = {
    "testMatches": "TEST",
    "odiMatches":  "ODI",
    "t20Matches":  "T20I",
    "ipl":         "IPL",
  };

  const careerStats: CricbuzzPlayerStats["career"] = [];

  for (const [key, format] of Object.entries(FORMAT_MAP)) {
    const bat = battingData?.stats?.[key];
    const bowl = bowlingData?.stats?.[key];
    if (!bat && !bowl) continue;
    careerStats.push({
      format,
      matches:  parseInt(bat?.Mat ?? bowl?.Mat ?? "0"),
      innings:  parseInt(bat?.Inn ?? "0"),
      runs:     parseInt(bat?.Runs ?? "0"),
      avg:      parseFloat(bat?.Avg ?? "0") || 0,
      sr:       parseFloat(bat?.SR ?? "0") || 0,
      hundreds: parseInt(bat?.["100"] ?? "0"),
      fifties:  parseInt(bat?.["50"] ?? "0"),
      highest:  bat?.HS ?? "0",
      wickets:  parseInt(bowl?.Wkts ?? "0"),
      economy:  parseFloat(bowl?.Econ ?? "0") || 0,
      bestBowl: bowl?.BBI ?? "-",
    });
  }

  return {
    playerId:     cricbuzzPlayerId,
    playerName:   playerInfo?.name ?? "Unknown",
    country:      playerInfo?.country ?? "Unknown",
    role:         playerInfo?.role ?? "Batter",
    battingStyle: playerInfo?.battingStyle ?? "Unknown",
    bowlingStyle: playerInfo?.bowlingStyle ?? "-",
    career:       careerStats,
  };
}

/** Search for a player by name on Cricbuzz */
export async function searchPlayer(name: string): Promise<{ id: string; name: string; country: string }[]> {
  const data = await rateLimitedFetch(
    `${BASE_URL}/stats/v1/player/search?plrN=${encodeURIComponent(name)}`
  );
  return (data?.plrs ?? []).slice(0, 8).map((p: any) => ({
    id:      String(p.id),
    name:    p.fullName ?? p.name,
    country: p.ctrName ?? "Unknown",
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 3: Scraper-first fallback chain for career stats.
//
// Tries the free Cricbuzz scraper (ml-service /scrape/player-stats/{id})
// first. If it returns well-formed data (≥1 format row with matches>0), use
// it. Otherwise fall back to the metered RapidAPI path.
//
// Returns both the parsed stats AND which source served them, so callers
// (bootstrap, refresher) can record stats_source on each row.
// ─────────────────────────────────────────────────────────────────────────────

export type StatsSource = "scraper" | "cricinfo" | "rapidapi";

export interface PlayerStatsWithSource {
  source: StatsSource;
  stats:  CricbuzzPlayerStats;
}

const FORMAT_KEY_MAP: Record<keyof ScraperPlayerStats["stats"], "TEST" | "ODI" | "T20I" | "IPL"> = {
  testMatches: "TEST",
  odiMatches:  "ODI",
  t20Matches:  "T20I",
  ipl:         "IPL",
};

function adaptScraperToCricbuzzShape(
  cbId: string,
  scraper: ScraperPlayerStats
): CricbuzzPlayerStats {
  const career: CricbuzzPlayerStats["career"] = [];
  for (const key of Object.keys(FORMAT_KEY_MAP) as (keyof ScraperPlayerStats["stats"])[]) {
    const format = FORMAT_KEY_MAP[key];
    const row = scraper.stats?.[key];
    if (!row || (row.Mat ?? 0) <= 0) continue;
    career.push({
      format,
      matches:  row.Mat  ?? 0,
      innings:  row.Inn  ?? 0,
      runs:     row.Runs ?? 0,
      avg:      row.Avg  ?? 0,
      sr:       row.SR   ?? 0,
      hundreds: row["100"] ?? 0,
      fifties:  row["50"]  ?? 0,
      highest:  row.HS   ?? "0",
      wickets:  row.Wkts ?? 0,
      economy:  row.Econ ?? 0,
      bestBowl: row.BBI  ?? "-",
    });
  }
  return {
    playerId:     cbId,
    playerName:   scraper.name  || "Unknown",
    country:      scraper.country || "Unknown",
    role:         scraper.role  || "Batter",
    battingStyle: scraper.battingStyle || "Unknown",
    bowlingStyle: scraper.bowlingStyle || "-",
    career,
  };
}

function isValidScraperResult(s: CricbuzzPlayerStats): boolean {
  if (!s.career || s.career.length === 0) return false;
  // At least one format must have a positive match count — guards against
  // an SPA-style empty page being returned with status 200.
  return s.career.some((c) => c.matches > 0);
}

/**
 * Fetch career stats from the ESPN Cricinfo scraper endpoint on the ML service.
 * The ML service's /scrape/cricinfo/player-stats/{id} endpoint uses
 * cricinfo_loader.fetch_one() which works reliably from Render datacenter IPs
 * (unlike the willow-static.cricbuzz.com endpoint which returns 404 from cloud IPs).
 *
 * Returns null if the ML service is unreachable or returns no data.
 */
async function fetchFromCricinfoScraper(
  cricbuzzPlayerId: string
): Promise<CricbuzzPlayerStats | null> {
  const ML_URL = process.env.ML_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(
      `${ML_URL}/scrape/cricinfo/player-stats/${cricbuzzPlayerId}`,
      { signal: AbortSignal.timeout(30_000) }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    // The cricinfo endpoint returns { odiStats, testStats, t20Stats, iplStats, ... }
    // Transform to our CricbuzzPlayerStats career array shape.
    const FORMAT_CRICINFO: Record<string, string> = {
      testStats: "TEST", odiStats: "ODI", t20Stats: "T20I", iplStats: "IPL",
    };
    const career: CricbuzzPlayerStats["career"] = [];
    for (const [key, format] of Object.entries(FORMAT_CRICINFO)) {
      const row = data[key];
      if (!row || (row.matches ?? 0) <= 0) continue;
      career.push({
        format,
        matches:  row.matches  ?? 0,
        innings:  row.innings  ?? row.matches ?? 0,
        runs:     row.runs     ?? 0,
        avg:      row.avg      ?? 0,
        sr:       row.sr       ?? 0,
        hundreds: row.hundreds ?? 0,
        fifties:  row.fifties  ?? 0,
        highest:  row.hs       ?? "0",
        wickets:  row.wickets  ?? 0,
        economy:  row.economy  ?? 0,
        bestBowl: row.bbm      ?? "-",
      });
    }
    if (career.length === 0 || !career.some((c) => c.matches > 0)) return null;
    return {
      playerId:     cricbuzzPlayerId,
      playerName:   data.name || "Unknown",
      country:      data.country || "Unknown",
      role:         data.role || "Batter",
      battingStyle: "Unknown",
      bowlingStyle: "-",
      career,
    };
  } catch (e: any) {
    logger.debug("[cricbuzz] Cricinfo ML scraper failed", { cbId: cricbuzzPlayerId, error: e.message });
    return null;
  }
}

export async function getPlayerStatsWithFallback(
  cricbuzzPlayerId: string
): Promise<PlayerStatsWithSource> {
  // 1) Try the free Cricbuzz willow-static scraper first.
  try {
    const scraper = await fetchPlayerStatsFromScraper(cricbuzzPlayerId);
    const adapted = adaptScraperToCricbuzzShape(cricbuzzPlayerId, scraper);
    if (isValidScraperResult(adapted)) {
      return { source: "scraper", stats: adapted };
    }
    logger.debug("[cricbuzz] Cricbuzz scraper returned empty — trying Cricinfo", { cbId: cricbuzzPlayerId });
  } catch (e: any) {
    logger.debug("[cricbuzz] Cricbuzz scraper failed — trying Cricinfo", { cbId: cricbuzzPlayerId, error: e.message });
  }

  // 2) ESPN Cricinfo via ML service (works from Render datacenter IPs).
  //    Free, no credits, covers retired players well.
  const cricinfo = await fetchFromCricinfoScraper(cricbuzzPlayerId);
  if (cricinfo && isValidScraperResult(cricinfo)) {
    logger.debug("[cricbuzz] Cricinfo scraper succeeded", { cbId: cricbuzzPlayerId, formats: cricinfo.career.length });
    return { source: "cricinfo", stats: cricinfo };
  }

  // 3) Fall back to RapidAPI (spends 3 credits).
  const stats = await getPlayerStats(cricbuzzPlayerId);
  return { source: "rapidapi", stats };
}

