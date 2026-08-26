// src/index.ts
// Cricket DNA API Server v2 — Cricbuzz + PostgreSQL + Redis + Socket.io

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import { logger } from "./utils/logger";
import { healthCheck as pgHealth } from "./db/postgres";
import { migrate } from "./db/migrate";
import { redisHealthCheck } from "./db/redis";
import { initSocketServer } from "./services/socket";
import { getPollerStatus } from "./workers/poller";
import { startRefresher, runRefreshCycle } from "./workers/refresher";
import { startKeepAlive } from "./workers/keepAlive";
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
  origin: (origin, callback) => {
    const allowed = [
      "http://localhost:5173",
      "http://localhost:3000",
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[];

    // Allow requests with no origin (mobile apps, curl, Render health checks)
    if (!origin) return callback(null, true);
    if (allowed.includes(origin)) return callback(null, true);

    // In production with no FRONTEND_URL set yet, allow all *.vercel.app
    // origins temporarily so the initial deploy isn't blocked
    if (!process.env.FRONTEND_URL && origin.endsWith(".vercel.app")) {
      return callback(null, true);
    }

    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
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
    refresher: process.env.RAPIDAPI_KEY ? "✅ enabled (8h snapshot refresh)" : "❌ RAPIDAPI_KEY missing",
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

  // PostgreSQL — connect + auto-migrate schema on every deploy
  const pgOk = await pgHealth();
  logger.info(pgOk ? "[boot] ✅ PostgreSQL connected" : "[boot] ⚠️  PostgreSQL unavailable — run: docker compose up -d postgres");
  if (pgOk) {
    await migrate();
  }

  // Redis — cache + daily budget counter (docker compose up redis)
  // Give the lazy connection a moment to establish before logging status
  await new Promise((r) => setTimeout(r, 1500));
  const redisOk = await redisHealthCheck();
  logger.info(redisOk ? "[boot] ✅ Redis connected" : "[boot] ⚠️  Redis unavailable — using in-memory fallback (run: docker compose up -d redis)");

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

  // 3. Snapshot refresher — replaces the 10s live poller.
  // External Cricbuzz calls now happen ONLY here (8h cadence + boot-if-stale).
  if (!process.env.RAPIDAPI_KEY) {
    logger.warn("[boot] ⚠️  RAPIDAPI_KEY not set — snapshot refresher disabled; serving seeded stats only");
  } else {
    await startRefresher();
    logger.info("[boot] ✅ Snapshot refresher started");
  }

  // Manual trigger endpoint support (admin/debug): POST /api/refresh
  app.post("/api/refresh", async (_req, res) => {
    try { await runRefreshCycle(); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 4. Keep-alive self-ping (Render free tier anti-sleep)
  startKeepAlive();

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
