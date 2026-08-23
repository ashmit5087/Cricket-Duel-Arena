import { logger } from "../utils/logger";

// ── Config ────────────────────────────────────────────────────────────────────

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY ?? "";
const RAPIDAPI_HOST = "cricbuzz-cricket.p.rapidapi.com";
const BASE_URL      = `https://${RAPIDAPI_HOST}`;
const MIN_REQUEST_GAP_MS = parseInt(process.env.CRICBUZZ_MIN_REQUEST_GAP_MS ?? "250", 10);
const MAX_RETRIES = parseInt(process.env.CRICBUZZ_MAX_RETRIES ?? "1", 10);
const DEFAULT_BACKOFF_MS = parseInt(process.env.CRICBUZZ_BACKOFF_MS ?? "5000", 10);
const QUOTA_BLOCK_MS = parseInt(process.env.CRICBUZZ_QUOTA_BLOCK_MS ?? String(60 * 60 * 1000), 10);

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

  if (Date.now() < quotaBlockedUntil) {
    throw new Error(
      `Cricbuzz API 429: RapidAPI monthly quota exceeded; blocked locally until ${new Date(quotaBlockedUntil).toISOString()}`
    );
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
      throw new Error(`Cricbuzz API 429: ${message}`);
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

/** Live commentary for a match — latest 10 events */
export async function getLiveCommentary(matchId: string): Promise<CricbuzzCommentary[]> {
  const data = await rateLimitedFetch(`${BASE_URL}/mcenter/v1/${matchId}/comm`);

  return (data?.commentaryList ?? []).slice(0, 10).map((c: any) => ({
    matchId,
    ballIndex: c.ballNbr ?? 0,
    over:      Math.floor(c.overNumber ?? 0),
    ball:      c.ballNbr ?? 0,
    runs:      c.batsmanStriker?.runs ?? 0,
    isWicket:  c.wicket ?? false,
    text:      c.commText ?? "",
    bowler:    c.bowlerStriker?.bowlName ?? "Unknown",
    batsman:   c.batsmanStriker?.batName ?? "Unknown",
  }));
}

/** Career stats for a player */
export async function getPlayerStats(cricbuzzPlayerId: string): Promise<CricbuzzPlayerStats> {
  const [info, batting, bowling] = await Promise.allSettled([
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}`),
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}/batting`),
    rateLimitedFetch(`${BASE_URL}/stats/v1/player/${cricbuzzPlayerId}/bowling`),
  ]);

  const playerInfo = info.status === "fulfilled" ? info.value : {};
  const battingData = batting.status === "fulfilled" ? batting.value : {};
  const bowlingData = bowling.status === "fulfilled" ? bowling.value : {};

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
