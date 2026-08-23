// src/index.ts
// Cricket DNA API Server v2 — Cricbuzz + PostgreSQL + Redis + Socket.io

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import { logger } from "./utils/logger";
import { healthCheck as pgHealth } from "./db/postgres";
import { redisHealthCheck } from "./db/redis";
import { initSocketServer } from "./services/socket";
import { startPoller, getPollerStatus } from "./workers/poller";
import { liveRouter } from "./routes/live";
import { playersRouter } from "./routes/players";
import { battleRouter } from "./routes/battle";
import { engagementRouter } from "./routes/engagement";
import { kohliRouter } from "./routes/kohli";
import { quizRouter } from "./routes/quiz";
import { getBudgetStatus } from "./services/cricdata";

// ── App + HTTP server (Socket.io requires raw http.Server) ────────────────────

const app        = express();
const httpServer = createServer(app);
const PORT       = process.env.PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    process.env.FRONTEND_URL ?? "",
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use("/api/live",       liveRouter);
app.use("/api/players",    playersRouter);
app.use("/api/player",     playersRouter);   // alias — frontend sends cricbuzzPlayerId here
app.use("/api/battle",     battleRouter);
app.use("/api/engagement", engagementRouter);
app.use("/api/kohli",      kohliRouter);
app.use("/api/quiz",       quizRouter);

// Budget status — never costs a CricData request
app.get("/api/budget", async (_req, res) => {
  try { res.json(await getBudgetStatus()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ML placeholders (real data when Python service is running)
app.get("/api/constellation", (_req, res) => res.json([]));
app.get("/api/clusters",      (_req, res) => res.json([]));
app.get("/api/knn",           (_req, res) => res.json({ player: null, twins: [] }));
app.get("/api/search",        async (req, res) => {
  // proxy to the players search handler
  req.url = `/search${req.url.includes("?") ? req.url.slice(req.url.indexOf("?") - 1) : ""}`;
  playersRouter(req, res, () => res.status(404).json({ error: "Not found" }));
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  const [pg, redis] = await Promise.all([pgHealth(), redisHealthCheck()]);
  const poller = getPollerStatus();
  const ml_url = process.env.ML_URL ?? "http://localhost:8000";

  let mlOk = false;
  try {
    const r = await fetch(`${ml_url}/health`, { signal: AbortSignal.timeout(2000) });
    mlOk = r.ok;
  } catch {}

  const status = pg && redis ? "ok" : "degraded";

  res.status(status === "ok" ? 200 : 207).json({
    status,
    timestamp:  new Date().toISOString(),
    services: {
      postgres:    pg    ? "✅ connected"  : "⚠️  skipped (battle history disabled)",
      redis:       redis ? "✅ connected"  : "❌ disconnected",
      ml:          mlOk  ? "✅ connected"  : "⚠️  unavailable",
      cricdata:    process.env.CRICDATA_API_KEY ? "✅ key set" : "❌ CRICDATA_API_KEY missing",
      gemini:      process.env.GEMINI_API_KEY ? "✅ key set" : "⚠️  not set",
      websocket:   "✅ running",
    },
    poller: {
      running:       poller.running,
      activeMatches: poller.activeMatches,
      matchIds:      poller.matchIds,
    },
    version: "2.0.0",
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path:  req.path,
    available: [
      "GET  /health",
      "GET  /api/live/matches",
      "GET  /api/live/match/:matchId",
      "GET  /api/live/match/:matchId/commentary",
      "GET  /api/live/history",
      "GET  /api/players",
      "GET  /api/players/search?q=kohli",
      "GET  /api/players/:internalId",
      "GET  /api/players/:internalId/stats",
      "GET  /api/players/:internalId/momentum",
      "GET  /api/battle?p1=virat-kohli&p2=rohit-sharma",
      "GET  /api/battle/moments?p1=virat-kohli&p2=rohit-sharma",
      "GET  /api/battle/history/:internalId",
      "GET  /api/engagement/aura/:internalId",
      "GET  /api/engagement/aura/leaderboard",
      "GET  /api/engagement/rivalry/:p1Id/:p2Id",
      "GET  /api/engagement/rivalry/hottest",
      "GET  /api/engagement/rankings?format=overall",
      "GET  /api/engagement/streaks/:internalId",
      "GET  /api/engagement/streaks/active",
    ],
  });
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("[server] Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

// ── Boot sequence ─────────────────────────────────────────────────────────────

async function boot() {
  // 1. Verify infrastructure
  logger.info("[boot] Checking infrastructure...");

  // PostgreSQL — optional
  const pgOk = await pgHealth();
  logger.info(pgOk ? "[boot] ✅ PostgreSQL connected" : "[boot] ⚠️  PostgreSQL skipped — battle history disabled");

  // Cache — always healthy (in-memory fallback)
  logger.info("[boot] ✅ Cache ready (in-memory)");

  if (!process.env.CRICDATA_API_KEY) {
    logger.warn("[boot] ⚠️  CRICDATA_API_KEY not set — live player data will fail");
  } else {
    logger.info("[boot] ✅ CricData API key set");
  }

  if (!process.env.GEMINI_API_KEY) {
    logger.warn("[boot] ⚠️  GEMINI_API_KEY not set — battle narratives will use stat-based fallback");
  } else {
    logger.info("[boot] ✅ Gemini API key set");
  }

  // 2. Init Socket.io
  initSocketServer(httpServer);
  logger.info("[boot] ✅ Socket.io initialised");

  // 3. Start Cricbuzz live match poller
  startPoller();
  logger.info("[boot] ✅ Live match poller started");

  // 4. Start listening
  httpServer.listen(PORT, () => {
    logger.info(`
╔══════════════════════════════════════════════════╗
║        Cricket DNA API — v2.0.0                  ║
║                                                  ║
║  HTTP  →  http://localhost:${PORT}                 ║
║  WS    →  ws://localhost:${PORT}  (Socket.io)      ║
║  ML    →  ${(process.env.ML_URL ?? "http://localhost:8000").padEnd(34)}║
╚══════════════════════════════════════════════════╝
    `);
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on("SIGTERM", () => {
  logger.info("[server] SIGTERM — shutting down gracefully");
  httpServer.close(() => {
    logger.info("[server] HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("[server] SIGINT — shutting down");
  process.exit(0);
});

boot().catch((e) => {
  logger.error("[boot] Fatal error", { error: e.message });
  process.exit(1);
});
