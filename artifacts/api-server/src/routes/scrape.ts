// src/routes/scrape.ts
// ─────────────────────────────────────────────────────────────────────────────
// Proxy to the ml-service scraper.
//
// The refresher worker (refresher.ts) and the frontend Hero ticker both need
// access to the Cricbuzz scraper. Going through api-server means:
//   • One CORS origin for the frontend
//   • One URL pattern in the api-server's own services/ that the rest of the
//     codebase can import (no ML_URL plumbing scattered around)
//   • The fallback chain (scraper → RapidAPI) is a one-line swap in
//     services/cricbuzz.ts:getPlayerStats() (see Task 3) — not N route changes
//
// This route is intentionally a thin pass-through. Caching, throttling, and
// fallback logic all live in services/scraper.ts. This file just forwards.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type IRouter, Request, Response } from "express";
import { logger } from "../utils/logger";
import { fetchPlayerStatsFromScraper, fetchLiveMatchesFromScraper } from "../services/scraper";

export const scrapeRouter: IRouter = Router();

// GET /api/scrape/player-stats/:cricbuzzId
// Mirrors cricbuzz.ts:getPlayerStats response shape so downstream code
// (cricbuzz.ts:347-405 parser) is source-agnostic.
scrapeRouter.get("/player-stats/:cricbuzzId", async (req: Request, res: Response) => {
  const { cricbuzzId } = req.params;
  if (!cricbuzzId || !/^\d+$/.test(cricbuzzId)) {
    return res.status(400).json({ error: "cricbuzzId must be a numeric string" });
  }
  try {
    const data = await fetchPlayerStatsFromScraper(cricbuzzId);
    res.json(data);
  } catch (e: any) {
    logger.warn("[scrape] player-stats proxy failed", { cricbuzzId, error: e.message });
    res.status(502).json({ error: "Scraper unreachable", detail: e.message });
  }
});

// GET /api/scrape/live-matches
// Powers the Hero ticker. Short cache in the scraper (60s) so a 30s poll
// from the frontend is fine.
scrapeRouter.get("/live-matches", async (_req: Request, res: Response) => {
  try {
    const data = await fetchLiveMatchesFromScraper();
    res.json(data);
  } catch (e: any) {
    logger.warn("[scrape] live-matches proxy failed", { error: e.message });
    res.status(502).json({ error: "Scraper unreachable", detail: e.message });
  }
});

// GET /api/scrape/health
// Cheap liveness — used by api-server's /health to confirm ml-service
// is up before redirecting scraper traffic to it.
scrapeRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const data = await fetch(`${process.env.ML_URL ?? "http://localhost:8000"}/scrape/health`, {
      signal: AbortSignal.timeout(2000),
    });
    res.status(data.ok ? 200 : 502).json(await data.json().catch(() => ({})));
  } catch (e: any) {
    res.status(502).json({ status: "down", error: e.message });
  }
});
