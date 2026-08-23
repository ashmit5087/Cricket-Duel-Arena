import { Router, Request, Response, type IRouter } from "express";
import { searchCricDataPlayer, getCricDataPlayer, CricDataBudgetExceededError } from "../services/cricdata";
import { cacheGet, cacheSet, TTL, redis } from "../db/redis";
import { logger } from "../utils/logger";

export const kohliRouter: IRouter = Router();

const KOHLI_INTERNAL_ID  = "virat-kohli";
const KOHLI_SEARCH_NAME  = "Virat Kohli";
const SHRINE_CACHE_KEY   = "kohli:shrine:v2";
const CRICDATA_ID_KEY    = "cricdata:id:virat-kohli";

// ── Career arc helpers ────────────────────────────────────────────────────────

interface CareerArcPoint {
  year: number;
  test: number | null;
  odi:  number | null;
  t20:  number | null;
}

function buildKohliCareerArc(player: import("../services/cricdata").CricDataPlayer): CareerArcPoint[] {
  const odiRow  = player.career.find((c) => c.format === "ODI");
  const testRow = player.career.find((c) => c.format === "TEST");
  const t20Row  = player.career.find((c) => c.format === "T20I");

  // Live values for 2024 — fall back to 2023 values if live data is 0
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

function buildCurrentStats(player: import("../services/cricdata").CricDataPlayer): LiveCareerStats {
  const odiRow = player.career.find((c) => c.format === "ODI");
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

interface Record {
  value:   string;
  label:   string;
  context: string;
}

function buildRecords(player: import("../services/cricdata").CricDataPlayer): Record[] {
  return [
    {
      value:   player.career.find((c) => c.format === "ODI")?.hundreds.toString() ?? "80",
      label:   "ODI Centuries",
      context: "Most centuries in ODI cricket",
    },
    {
      value:   player.career.find((c) => c.format === "ODI")?.avg.toFixed(1) ?? "58.5",
      label:   "ODI Average",
      context: "Career ODI batting average",
    },
    {
      value:   player.career.find((c) => c.format === "TEST")?.hundreds.toString() ?? "29",
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

  // 2. Resolve CricData UUID for Kohli
  let cricdataId: string | null = await cacheGet<string>(CRICDATA_ID_KEY);
  if (!cricdataId) {
    try {
      const results = await searchCricDataPlayer(KOHLI_SEARCH_NAME);
      const match = results[0];
      if (match) {
        cricdataId = match.id;
        // Cache permanently — no TTL
        await redis.set(CRICDATA_ID_KEY, cricdataId);
      }
    } catch (e: any) {
      if (e instanceof CricDataBudgetExceededError) {
        // No shrine data at all yet — return 429
        return res.status(429).json({ error: "Daily API budget exceeded", budgetExceeded: true });
      }
      logger.error("[kohli] CricData search failed", { error: e.message });
      return res.status(502).json({ error: "Failed to resolve player ID", detail: e.message });
    }
  }

  if (!cricdataId) {
    return res.status(404).json({ error: "Kohli not found in CricData" });
  }

  // 3. Fetch full player profile (1 API call)
  try {
    const player = await getCricDataPlayer(cricdataId);

    // 4. Build shrine response
    const careerArc    = buildKohliCareerArc(player);
    const currentStats = buildCurrentStats(player);
    const records      = buildRecords(player);

    const shrine = {
      playerId:     KOHLI_INTERNAL_ID,
      name:         player.name,
      country:      player.country,
      role:         player.role,
      battingStyle: player.battingStyle,
      careerArc,
      currentStats,
      records,
      lastUpdated: new Date().toISOString(),
    };

    // 5. Cache and return
    await cacheSet(SHRINE_CACHE_KEY, shrine, TTL.KOHLI_SHRINE);
    return res.json(shrine);
  } catch (e: any) {
    if (e instanceof CricDataBudgetExceededError) {
      // Return stale cached data if it exists, otherwise 429
      const stale = await cacheGet(SHRINE_CACHE_KEY);
      if (stale) return res.json(stale);
      return res.status(429).json({ error: "Daily API budget exceeded", budgetExceeded: true });
    }
    logger.error("[kohli] getCricDataPlayer failed", { cricdataId, error: e.message });
    return res.status(502).json({ error: "Failed to fetch Kohli stats", detail: e.message });
  }
});
