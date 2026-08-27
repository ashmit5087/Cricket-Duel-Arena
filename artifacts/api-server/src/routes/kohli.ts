import { Router, Request, Response, type IRouter } from "express";
import { query } from "../db/postgres";
import { cacheGet, cacheSet, TTL } from "../db/redis";
import { logger } from "../utils/logger";

export const kohliRouter: IRouter = Router();

const KOHLI_INTERNAL_ID = "virat-kohli";
const SHRINE_CACHE_KEY  = "kohli:shrine:v2";

// ── Snapshot read ─────────────────────────────────────────────────────────────
// Kohli's career rows live in player_career_stats, kept fresh by the refresher
// worker (scraper primary → RapidAPI fallback). This route ONLY reads the
// snapshot — it never triggers an external fetch, so it's instant and free.

interface CareerRow {
  format:   string;
  matches:  number | string;  // node-pg returns numeric as string by default
  runs:     number | string;
  avg:      number | string;
  sr:       number | string;
  hundreds: number | string;
  fifties:  number | string;
  highest:  string;
  lastSynced:  string;
  statsSource: string;
}

interface PlayerRow {
  name:          string;
  country:       string;
  role:          string;
  batting_style: string | null;
}

// Shape of CareerRow AFTER node-pg numeric → JS number coercion in
// loadKohliSnapshot. Everything numeric is guaranteed to be a real number
// here, so downstream math / .toFixed() / comparisons are type-safe.
interface NormalisedCareerRow {
  format:      string;
  matches:     number;
  runs:        number;
  avg:         number;
  sr:          number;
  hundreds:    number;
  fifties:     number;
  highest:     string;
  lastSynced:  string;
  statsSource: string;
}

async function loadKohliSnapshot(): Promise<
  { player: PlayerRow; career: NormalisedCareerRow[] } | null
> {
  const players = await query<PlayerRow & { id: string }>(
    `SELECT id, name, country, role, batting_style
       FROM players
      WHERE internal_id = $1
      LIMIT 1`,
    [KOHLI_INTERNAL_ID]
  );
  const player = players[0];
  if (!player) return null;

  const career = await query<CareerRow>(
    `SELECT format, matches, innings, runs, avg, sr, hundreds, fifties,
            highest,
            last_synced  AS "lastSynced",
            stats_source AS "statsSource"
       FROM player_career_stats
      WHERE player_id = $1`,
    [player.id]
  );

  // node-postgres returns NUMERIC columns as strings by default. Coerce here
  // so downstream `.toFixed()` / math operations work without surprises.
  const normalized: NormalisedCareerRow[] = career.map((c) => ({
    format:     c.format,
    matches:    Number(c.matches)  || 0,
    runs:       Number(c.runs)     || 0,
    avg:        Number(c.avg)      || 0,
    sr:         Number(c.sr)       || 0,
    hundreds:   Number(c.hundreds) || 0,
    fifties:    Number(c.fifties)  || 0,
    highest:    c.highest,
    lastSynced: c.lastSynced,
    statsSource: c.statsSource,
  }));

  return { player, career: normalized };
}

// ── Career arc helpers ────────────────────────────────────────────────────────

interface CareerArcPoint {
  year: number;
  test: number | null;
  odi:  number | null;
  t20:  number | null;
}

function buildKohliCareerArc(career: NormalisedCareerRow[]): CareerArcPoint[] {
  const odiRow  = career.find((c) => c.format === "ODI");
  const testRow = career.find((c) => c.format === "TEST");
  const t20Row  = career.find((c) => c.format === "T20I");

  // Live values for 2024 — fall back to 2023 values if snapshot data is 0
  const liveOdiAvg  = odiRow?.avg  && odiRow.avg  > 0 ? odiRow.avg  : 95.2;
  const liveTestAvg = testRow?.avg && testRow.avg > 0 ? testRow.avg : 55.3;
  const liveT20Avg  = t20Row?.avg  && t20Row.avg  > 0 ? t20Row.avg  : 42.1;

  return [
    { year: 2008, test: null, odi: 16.6,        t20: 19.2 },
    { year: 2009, test: 20.8, odi: 40.3,        t20: 25.1 },
    { year: 2010, test: 32.4, odi: 45.2,        t20: 28.6 },
    { year: 2011, test: 46.1, odi: 47.1,        t20: 30.1 },
    { year: 2012, test: 41.2, odi: 72.4,        t20: 31.8 },
    { year: 2013, test: 51.4, odi: 52.2,        t20: 39.0 },
    { year: 2014, test: 40.1, odi: 58.3,        t20: 36.4 },
    { year: 2015, test: 52.7, odi: 60.2,        t20: 42.1 },
    { year: 2016, test: 75.8, odi: 89.3,        t20: 102.5 },
    { year: 2017, test: 68.4, odi: 76.7,        t20: 68.3 },
    { year: 2018, test: 55.1, odi: 133.0,       t20: 58.1 },
    { year: 2019, test: 62.3, odi: 58.4,        t20: 65.2 },
    { year: 2020, test: 19.3, odi: null,         t20: 22.5 },
    { year: 2021, test: 28.2, odi: 55.5,        t20: 57.7 },
    { year: 2022, test: 45.9, odi: 64.9,        t20: 81.8 },
    { year: 2023, test: 55.3, odi: 95.2,        t20: 42.1 },
    { year: 2024, test: liveTestAvg, odi: liveOdiAvg, t20: liveT20Avg },
  ];
}

interface LiveCareerStats {
  matches:  number;
  runs:     number;
  avg:      number;
  sr:       number;
  hundreds: number;
  fifties:  number;
  hs:       number;
}

function buildCurrentStats(career: NormalisedCareerRow[]): LiveCareerStats {
  const odiRow = career.find((c) => c.format === "ODI");
  return {
    matches:  odiRow?.matches  ?? 0,
    runs:     odiRow?.runs     ?? 0,
    avg:      odiRow?.avg      ?? 0,
    sr:       odiRow?.sr       ?? 0,
    hundreds: odiRow?.hundreds ?? 0,
    fifties:  odiRow?.fifties  ?? 0,
    hs:       parseInt(odiRow?.highest?.replace("*", "") ?? "0"),
  };
}

interface ShrineRecord {
  value:   string;
  label:   string;
  context: string;
}

function buildRecords(career: NormalisedCareerRow[]): ShrineRecord[] {
  return [
    {
      value:   career.find((c) => c.format === "ODI")?.hundreds.toString() ?? "80",
      label:   "ODI Centuries",
      context: "Most centuries in ODI cricket",
    },
    {
      value:   career.find((c) => c.format === "ODI")?.avg.toFixed(1) ?? "58.5",
      label:   "ODI Average",
      context: "Career ODI batting average",
    },
    {
      value:   career.find((c) => c.format === "TEST")?.hundreds.toString() ?? "29",
      label:   "Test Centuries",
      context: "Test match centuries",
    },
  ];
}

// ── GET /api/kohli ────────────────────────────────────────────────────────────

kohliRouter.get("/", async (_req: Request, res: Response) => {
  // 1. Check shrine cache
  const cached = await cacheGet(SHRINE_CACHE_KEY);
  if (cached) return res.json(cached);

  // 2. Read the DB snapshot (no external calls)
  try {
    const snapshot = await loadKohliSnapshot();

    if (!snapshot) {
      return res.status(404).json({ error: "Kohli not found in players table" });
    }

    if (snapshot.career.length === 0) {
      // Stats not synced yet (scraper hasn't run) — frontend falls back to
      // its bundled mock data, so the page still renders.
      return res.status(503).json({ error: "Kohli stats pending sync", statsPending: true });
    }

    const { player, career } = snapshot;

    // Use the most-recent last_synced as the actual data timestamp —
    // gives the frontend a real "updated Nh ago" instead of "we cached
    // this N seconds ago".
    const lastSynced = career
      .map((c) => c.lastSynced)
      .filter(Boolean)
      .sort()
      .pop();

    // 3. Build shrine response
    const shrine = {
      playerId:     KOHLI_INTERNAL_ID,
      name:         player.name,
      country:      player.country,
      role:         player.role,
      battingStyle: player.batting_style ?? "Right-hand bat",
      careerArc:    buildKohliCareerArc(career),
      currentStats: buildCurrentStats(career),
      records:      buildRecords(career),
      lastUpdated:  lastSynced ?? new Date().toISOString(),
      statsSource:  career.find((c) => c.statsSource)?.statsSource ?? "unknown",
    };

    // 4. Cache and return
    await cacheSet(SHRINE_CACHE_KEY, shrine, TTL.KOHLI_SHRINE);
    return res.json(shrine);
  } catch (e: any) {
    logger.error("[kohli] Snapshot read failed", { error: e.message });
    return res.status(502).json({ error: "Failed to load Kohli stats", detail: e.message });
  }
});
