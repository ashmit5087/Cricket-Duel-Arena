// src/lib/api.ts
// ─────────────────────────────────────────────────────────────────────────────
// All fetch functions that talk to the Express API server.
// Import these in React Query hooks — never call fetch directly in components.
//
// Set VITE_API_URL in .env.local for dev, Vercel env vars for production.
// Falls back to localhost:3001 if not set.
// ─────────────────────────────────────────────────────────────────────────────

const API = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

// ─── Generic fetch wrapper ────────────────────────────────────────────────────

/** Thrown when the server returns 429 (API quota exhausted). */
export class BudgetExceededError extends Error {
  constructor() { super("API quota exceeded — showing cached data"); }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (res.status === 429) {
    // Budget exhausted — React Query will keep showing placeholder/stale data
    throw new BudgetExceededError();
  }
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types mirroring Express API responses ────────────────────────────────────

export interface LiveCareerStats {
  matches: number;
  runs: number;
  avg: number;
  sr: number;
  hundreds: number;
  fifties: number;
  hs: number;
  wickets?: number;
  economy?: number;
  bbm?: string;
}

export interface LivePlayerProfile {
  cricInfoId: string;
  name: string;
  country: string;
  role: string;
  age: number;
  testStats: LiveCareerStats;
  odiStats: LiveCareerStats;
  t20Stats: LiveCareerStats;
  iplStats: { matches: number; runs: number; avg: number; sr: number; sixes: number; fours: number };
  recentForm: { match: string; score: number; date: string }[];
  // Live ML/DNA fields — only populated when the source is a battle
  // response with a successful ML cluster lookup. Optional so other
  // LivePlayerProfile producers (e.g. /api/players/:id/stats) don't
  // need to fill them in.
  archetypeId?: string;
  archetypeName?: string;
  archetypeColor?: string | null;
  dnaScore?: number | null;
  playerVector?: number[] | null;
  isOutlier?: boolean;
}

export interface KNNTwin {
  id: string;
  name: string;
  cricInfoId: string;
  similarity: number;        // 0–100
  archetypeId: string;
  archetype: string;
  country: string;
  flag: string;
}

export interface KNNResult {
  player: { id: string; name: string; archetypeId: string; archetype: string };
  twins: KNNTwin[];
}

export interface ConstellationPoint {
  id: string;
  name: string;
  cricInfoId: string;
  archetypeId: string;
  x: number;                 // real t-SNE coordinate
  y: number;
  dnaScore: number;
  flag: string;
}

export interface BattleData {
  p1: LivePlayerProfile;
  p2: LivePlayerProfile;
  dnaSimilarity: number;
  archetypeMatch: boolean;
  reason: string;
  statComparison?: {
    winner: string;
    reason: string;
  };
  judge?: JudgeSummary;
  algorithmVerdicts?: AlgorithmVerdict[];
  statementMoments: StatementMoment[];
  headToHead: HeadToHead | null;
}

export interface AlgorithmVerdict {
  id: string;
  name: string;
  description: string;
  winner: string;          // ESPN Cricinfo ID of predicted winner
  winnerName: string;
  confidence: number;      // 0-100
  reasoning: string;
  dnaSimilarity?: number;  // only on cosine_dna model
  isOutlier1?: boolean;    // only on dbscan_outlier model
  isOutlier2?: boolean;
}

export interface JudgeSummary {
  winner: string;
  winnerName: string;
  agreement_rate: number;
  models_agreed: number;
  models_total: number;
  reasoning: string;
}

export interface StatementMoment {
  playerId: string;
  playerName: string;
  match: string;
  score: string;
  context: string;
  date: string;
  isKnockout: boolean;
}

export interface HeadToHead {
  matchesTogether: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  summary: string;
}

export interface SearchResult {
  internalId: string;
  name: string;
  cricbuzzPlayerId: string;
  country: string;
  flag: string;
  role: string;
  archetypeId: string;
  archetypeName?: string;
}

export interface ClusterData {
  id: string;
  name: string;
  color: string;
  description: string;
  memberCount: number;
  centroidValues: number[];
  examplePlayers: string[];
}

// ─── Player endpoints ─────────────────────────────────────────────────────────

/**
 * Full live career stats for one player.
 * Cached 24h server-side — fast after first hit.
 */
export const fetchPlayerStats = (cricInfoId: string) =>
  apiFetch<LivePlayerProfile>(`/api/player/${cricInfoId}/stats`);

/**
 * Fuzzy name search — used in DNASearch and BattleArena PlayerPicker.
 * Returns lightweight SearchResult[], not full profiles.
 */
export const searchPlayers = (query: string) =>
  apiFetch<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`);

// ─── KNN / ML endpoints ───────────────────────────────────────────────────────

/**
 * DNA twin search — proxied through Express to Python KNN service.
 * Returns top-k nearest neighbours by cosine similarity on 20-dim vector.
 */
export const fetchKNNTwins = (playerId: string, k = 5) =>
  apiFetch<KNNResult>(`/api/knn?player=${playerId}&k=${k}`);

/**
 * Archetype assignment for a player — from the K-Means model.
 */
export const fetchArchetype = (playerId: string) =>
  apiFetch<{ archetypeId: string; archetype: string; centroid: number[]; dnaScore?: number }>(
    `/api/cluster/${playerId}`
  );

// ─── Constellation ────────────────────────────────────────────────────────────

/**
 * All players with real t-SNE x,y coordinates.
 * Replaces the hardcoded x,y values in mockData.ts.
 * Cached 24h — only changes when ML pipeline re-runs.
 */
export const fetchConstellation = () =>
  apiFetch<ConstellationPoint[]>("/api/constellation");

// ─── Archetypes ───────────────────────────────────────────────────────────────

/**
 * All 8 cluster definitions with real centroid values from K-Means.
 */
export const fetchClusters = () =>
  apiFetch<ClusterData[]>("/api/clusters");

// ─── Battle Arena ─────────────────────────────────────────────────────────────

/**
 * Per-format career row from the live battle/stats endpoint.
 * (Same shape as the entries in `LivePlayerProfile.stats.career[]`.)
 */
export interface CareerFormatStats {
  format:   string;
  matches:  number;
  innings:  number;
  runs:     number;
  avg:      number;
  sr:       number;
  hundreds: number;
  fifties:  number;
  highest:  string;       // raw "183" or "183*" — call site parses if it needs hs
  hs:       number;       // parsed highest score (number, no asterisk)
  wickets:  number;
  economy:  number;
  bestBowl: string;
}

/** Flat shape the BattleArena page already consumes (matches mockData.Player). */
export interface BattlePlayerStats {
  testStats: CareerFormatStats;
  odiStats:  CareerFormatStats;
  t20Stats:  CareerFormatStats;
  iplStats:  CareerFormatStats;
}

/**
 * Adapter: the live battle response ships career as a `career[]` array, but
 * the BattleArena page reads `p.testStats / p.odiStats / p.t20Stats / p.iplStats`
 * (the mock Player shape). This flattens one into the other, defaulting
 * missing formats to zeros so the spread in BattleView never leaks
 * `undefined` into `.toFixed()` calls.
 */
export function flattenCareerToStats(
  career: CareerFormatStats[] | undefined | null
): BattlePlayerStats {
  const parseHighest = (h: string | undefined | null): number => {
    if (!h) return 0;
    const n = parseInt(h.replace("*", ""));
    return Number.isFinite(n) ? n : 0;
  };
  const toRow = (c: Partial<CareerFormatStats> | undefined, format: string): CareerFormatStats => ({
    format,
    matches:  c?.matches  ?? 0,
    innings:  c?.innings  ?? 0,
    runs:     c?.runs     ?? 0,
    avg:      c?.avg      ?? 0,
    sr:       c?.sr       ?? 0,
    hundreds: c?.hundreds ?? 0,
    fifties:  c?.fifties  ?? 0,
    highest:  c?.highest  ?? "0",
    hs:       c?.hs       ?? parseHighest(c?.highest),
    wickets:  c?.wickets  ?? 0,
    economy:  c?.economy  ?? 0,
    bestBowl: c?.bestBowl ?? "-",
  });
  const by: Record<string, Partial<CareerFormatStats>> = {};
  for (const c of career ?? []) by[c.format] = c;
  return {
    testStats: toRow(by["TEST"], "TEST"),
    odiStats:  toRow(by["ODI"],  "ODI"),
    t20Stats:  toRow(by["T20I"], "T20I"),
    iplStats:  toRow(by["IPL"],  "IPL"),
  };
}

/**
 * Compute battle stats between two players.
 * Can pass internal IDs or cricInfoIds.
 * Express backend resolves these and proxies to ML service.
 */
export const fetchBattle = (p1Id: string, p2Id: string, algorithms: string[] = ["xgboost", "random_forest"]) => {
  const query = new URLSearchParams({
    p1: p1Id,
    p2: p2Id,
    algorithms: algorithms.join(","),
  });
  // The live response wraps the career array inside p1.stats/p2.stats; the
  // page consumes the flat Player shape. Keep the raw type loose so callers
  // can run it through `normalizeBattleData()` for the page-friendly form.
  return apiFetch<RawBattleData>(`/api/battle?${query.toString()}`);
};

/**
 * Live battle response (raw shape from the api-server).
 * Differs from `BattleData` in three ways: p1/p2 wrap career in `.stats.career`,
 * DNA similarity + winner live under `.ml`, and `headToHead`/`judge` may be
 * missing. `normalizeBattleData()` collapses these into the shape the
 * BattleArena page expects.
 */
export interface RawBattleData {
  statsPending: { p1: boolean; p2: boolean; message: string | null };
  p1: {
    internalId: string;
    cricbuzzPlayerId: string;
    name: string;
    country: string;
    flag: string;
    role: string;
    archetypeId: string;
    archetypeName: string;
    archetypeColor: string | null;
    dnaScore: number | null;
    playerVector: number[] | null;
    isOutlier: boolean;
    imageUrl: string;
    stats: { career: CareerFormatStats[] };
  };
  p2: {
    internalId: string;
    cricbuzzPlayerId: string;
    name: string;
    country: string;
    flag: string;
    role: string;
    archetypeId: string;
    archetypeName: string;
    archetypeColor: string | null;
    dnaScore: number | null;
    playerVector: number[] | null;
    isOutlier: boolean;
    imageUrl: string;
    stats: { career: CareerFormatStats[] };
  };
  ml: {
    available: boolean;
    dnaSimilarity: number | null;
    winnerPredicted: string;
    confidence: number | null;
    momentumP1: number;
    momentumP2: number;
    xgboostScore: number | null;
  };
  narrative: string;
  statComparison: { winner: string; gap: string; reason: string };
  algorithmVerdicts: AlgorithmVerdict[];
  judge: JudgeSummary | null;
  computedAt: string;
}

/**
 * Normalize the raw live battle response into the `BattleData` shape the
 * BattleArena page already consumes. Joins the live per-format career
 * arrays into flat `testStats/odiStats/...` fields, flattens `ml.*` up to
 * the top level, and provides safe defaults for fields the live API
 * doesn't return (headToHead, statementMoments, archetypeMatch).
 */
export function normalizeBattleData(raw: RawBattleData): BattleData {
  const p1Stats = flattenCareerToStats(raw.p1.stats.career);
  const p2Stats = flattenCareerToStats(raw.p2.stats.career);
  return {
    p1: {
      cricInfoId: raw.p1.cricbuzzPlayerId,
      name:       raw.p1.name,
      country:    raw.p1.country,
      role:       raw.p1.role,
      age:        0,
      testStats:  p1Stats.testStats,
      odiStats:   p1Stats.odiStats,
      t20Stats:   p1Stats.t20Stats,
      iplStats:   { ...p1Stats.iplStats, sixes: 0, fours: 0 },
      recentForm: [],
      archetypeId:    raw.p1.archetypeId,
      archetypeName:  raw.p1.archetypeName,
      archetypeColor: raw.p1.archetypeColor,
      dnaScore:       raw.p1.dnaScore,
      playerVector:   raw.p1.playerVector,
    },
    p2: {
      cricInfoId: raw.p2.cricbuzzPlayerId,
      name:       raw.p2.name,
      country:    raw.p2.country,
      role:       raw.p2.role,
      age:        0,
      testStats:  p2Stats.testStats,
      odiStats:   p2Stats.odiStats,
      t20Stats:   p2Stats.t20Stats,
      iplStats:   { ...p2Stats.iplStats, sixes: 0, fours: 0 },
      recentForm: [],
      archetypeId:    raw.p2.archetypeId,
      archetypeName:  raw.p2.archetypeName,
      archetypeColor: raw.p2.archetypeColor,
      dnaScore:       raw.p2.dnaScore,
      playerVector:   raw.p2.playerVector,
    },
    dnaSimilarity:    raw.ml.dnaSimilarity ?? 0,
    archetypeMatch:   raw.p1.archetypeId === raw.p2.archetypeId,
    reason:           raw.narrative,
    statComparison:   { winner: raw.statComparison.winner, reason: raw.statComparison.reason },
    judge:            raw.judge ?? undefined,
    algorithmVerdicts: raw.algorithmVerdicts ?? [],
    statementMoments: [],  // fetched separately via fetchStatementMoments
    headToHead:       null,
  };
}

/**
 * Statement moments only — innings > 1.5× career avg in knockout matches.
 * Cheaper than full battle fetch when only the moments tab is visible.
 */
export const fetchStatementMoments = (p1CricInfoId: string, p2CricInfoId: string) =>
  apiFetch<StatementMoment[]>(
    `/api/battle/moments?p1=${p1CricInfoId}&p2=${p2CricInfoId}`
  );

// ─── Budget ──────────────────────────────────────────────────────────────────



// ─── Kohli ────────────────────────────────────────────────────────────────────

/**
 * Kohli-specific data endpoint — career arc by year, shrine stats, 2022 knock.
 * Separate endpoint so the shrine never waits on general player fetch.
 */
export const fetchKohliShrine = () =>
  apiFetch<{
    careerArc: { year: number; test: number | null; odi: number | null; t20: number | null }[];
    records: { value: string; label: string; context: string }[];
    currentStats: LiveCareerStats;
    lastUpdated?: string;
    statsSource?: string;
  }>("/api/kohli");

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export interface QuizData {
  quizId: string;
  title: string;
  difficulty: string;
  questions: {
    id: string;
    question: string;
    options: string[];
  }[];
  quizToken: string;
}

export interface QuizResult {
  totalScore: number;
  maxScore: number;
  percentage: number;
  tier: string;
  tierEmoji: string;
  breakdown: {
    questionId: string;
    correct: boolean;
    correctIndex: number;
    selectedIndex: number;
    pointsAwarded: number;
  }[];
}

export interface QuizLeaderboardEntry {
  user_id: string | null;
  score: number;
  max_score: number;
  percentage: number;
  tier: string;
  created_at: string;
}

/** Fetch a fresh LLM-generated quiz. Each call generates new questions. */
export const fetchQuiz = () =>
  apiFetch<QuizData>("/api/quiz/kohli-fanboy");

/** Submit quiz answers with the signed token. */
export const submitQuiz = (quizToken: string, answers: { questionId: string; selectedIndex: number }[]) =>
  apiFetch<QuizResult>("/api/quiz/kohli-fanboy/submit", {
    method: "POST",
    body: JSON.stringify({ quizToken, answers }),
  });

/** Fetch quiz leaderboard. */
export const fetchQuizLeaderboard = () =>
  apiFetch<QuizLeaderboardEntry[]>("/api/quiz/kohli-fanboy/leaderboard");

// ─── Algorithms ──────────────────────────────────────────────────────────────

export interface AlgorithmInfo {
  id: string;
  description: string;
}

/** Fetch available ML algorithms (proxied through Express, ML_URL stays server-side). */
export const fetchAlgorithms = () =>
  apiFetch<AlgorithmInfo[]>("/api/algorithms");

// ─── Live ticker / live data (Hero page) ─────────────────────────────────────

export interface LiveMatch {
  matchId: string;
  match: string;
  slug: string;
  url: string;
}

/** Currently live Cricbuzz matches. Scraped from the mobile API every ~30s. */
export const fetchLiveMatches = () =>
  apiFetch<{ count: number; matches: LiveMatch[] }>("/api/scrape/live-matches");

/** Live Kohli shrine snapshot — includes lastUpdated for the "Updated Nh ago" badge. */
export interface KohliShrineLive {
  careerArc: { year: number; test: number | null; odi: number | null; t20: number | null }[];
  records: { value: string; label: string; context: string }[];
  currentStats: LiveCareerStats;
  lastUpdated?: string;
  statsSource?: string;
}
