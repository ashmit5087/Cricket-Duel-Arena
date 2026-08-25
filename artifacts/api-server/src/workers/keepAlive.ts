// src/workers/keepAlive.ts
// ─────────────────────────────────────────────────────────────────────────────
// Self-ping keep-alive for Render free tier.
//
// Render spins down free web services after ~15 minutes of inactivity.
// This worker pings the server's own /health endpoint every 10 minutes,
// keeping the instance warm so users never hit a 30-50s cold start.
//
// Only active when KEEP_ALIVE_ENABLED=true (set in the Render dashboard).
// No-op locally — no reason to ping yourself on localhost.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "../utils/logger";

const INTERVAL_MS = 10 * 60 * 1000;   // 10 minutes
let timer: NodeJS.Timeout | null = null;

function selfUrl(): string {
  // RENDER_EXTERNAL_URL is injected automatically by Render
  const base =
    process.env.RENDER_EXTERNAL_URL ??
    `http://localhost:${process.env.PORT ?? 3001}`;
  return `${base.replace(/\/$/, "")}/health`;
}

async function ping(): Promise<void> {
  const url = selfUrl();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      logger.debug("[keep-alive] Ping OK", { url, status: res.status });
    } else {
      logger.warn("[keep-alive] Ping non-OK", { url, status: res.status });
    }
  } catch (e: any) {
    logger.error("[keep-alive] Ping failed", { url, error: e.message });
  }
}

export function startKeepAlive(): void {
  if (!process.env.KEEP_ALIVE_ENABLED) {
    logger.info("[keep-alive] Disabled (KEEP_ALIVE_ENABLED not set)");
    return;
  }

  // Fire once immediately so the first user request isn't the cold start
  void ping();
  timer = setInterval(ping, INTERVAL_MS);
  logger.info(`[keep-alive] Started — pinging ${selfUrl()} every ${INTERVAL_MS / 60000} min`);
}

export function stopKeepAlive(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("[keep-alive] Stopped");
  }
}
