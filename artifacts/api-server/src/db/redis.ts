import Redis from "ioredis";
import NodeCache from "node-cache";
import { logger } from "../utils/logger";

// ── TTL constants (seconds) ────────────────────────────────────────────────────

export const TTL = {
  LIVE_MATCH:      15,
  PLAYER_PROFILE:  86400,   // 24h
  CAREER_STATS:    86400,   // 24h
  BATTLE_RESULT:   86400,   // 24h — one API call per unique battle per day
  KOHLI_SHRINE:    86400,   // 24h — refreshed once per day
  CONSTELLATION:   86400,   // 24h
  SEARCH:          300,     // 5 min
  CRICDATA_ID_MAP: 0,       // permanent
  MOMENTUM:        30,
};

// ── Pub/Sub channel names ─────────────────────────────────────────────────────

export const CHANNELS = {
  LIVE_UPDATE:   "cricket:live:update",
  MATCH_STATE:   "cricket:match:state",
  MOMENTUM:      "cricket:momentum",
  BATTLE_UPDATE: "cricket:battle",
  AURA_UPDATE:   "cricket:aura",
};

// ── In-memory fallback (used only when Redis is unreachable) ──────────────────

const mem = new NodeCache({ useClones: false });
const permanentMem = new NodeCache({ useClones: false });

let redisAvailable = false;

// REDIS_URL is set by Render's Key Value connectionString (includes auth).
// Local Docker uses individual REDIS_HOST / REDIS_PORT / REDIS_PASSWORD vars.
function redisConfig() {
  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL };
  }
  return {
    host:     process.env.REDIS_HOST     ?? "localhost",
    port:     parseInt(process.env.REDIS_PORT ?? "6379"),
    password: process.env.REDIS_PASSWORD ?? undefined,
  };
}

const redisClient = new Redis({
  ...redisConfig(),
  db: 0,
  retryStrategy: (times) => {
    if (times > 5) return null;
    return Math.min(times * 500, 3000);
  },
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  enableOfflineQueue: false,
});

redisClient.on("connect", () => {
  redisAvailable = true;
  logger.info("[redis] Connected");
});
redisClient.on("error", () => {
  // Silent — logged once below on first failure
});
redisClient.on("end", () => {
  if (redisAvailable) logger.warn("[redis] Connection closed — falling back to in-memory cache");
  redisAvailable = false;
});

// Attempt connection; never crash the server if Redis is down
redisClient.connect().catch(() => {
  redisAvailable = false;
  logger.warn("[cache] Redis unavailable — using in-memory cache (budget counter resets on restart)");
});

// ── Unified cache helpers — route to Redis or memory transparently ────────────

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  const serialized = JSON.stringify(value);
  try {
    if (!redisAvailable) throw new Error("redis down");
    if (ttlSeconds && ttlSeconds > 0) {
      await redisClient.setex(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
  } catch {
    if (ttlSeconds && ttlSeconds > 0) mem.set(key, value, ttlSeconds);
    else permanentMem.set(key, value);
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (!redisAvailable) throw new Error("redis down");
    const raw = await redisClient.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return mem.get<T>(key) ?? permanentMem.get<T>(key) ?? null;
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    if (redisAvailable) await redisClient.del(key);
  } catch { /* ignore */ }
  mem.del(key);
  permanentMem.del(key);
}

export async function publish(channel: string, data: unknown): Promise<void> {
  try {
    if (redisAvailable) await redisClient.publish(channel, JSON.stringify(data));
  } catch { /* pub/sub unavailable — no-op */ }
}

export async function redisHealthCheck(): Promise<boolean> {
  try {
    if (!redisAvailable) return false;
    const pong = await redisClient.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

// ── Budget helpers (used by CricData rate-limiter) ────────────────────────────

/**
 * Atomically increments a daily budget counter.
 * Uses Redis INCR when available; falls back to in-memory otherwise.
 * The in-memory fallback resets on restart — acceptable for dev,
 * but production should run Redis (docker compose up redis).
 */
export async function budgetIncr(key: string, _limit: number): Promise<number> {
  if (redisAvailable) {
    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, 86400);
    return count;
  }

  // In-memory fallback with 24h TTL on first increment
  const current = (mem.get<number>(key) ?? 0) + 1;
  const existingTtl = mem.getTtl(key);
  if (!existingTtl || existingTtl === 0) {
    mem.set(key, current, 86400);
  } else {
    const remaining = Math.max(1, Math.ceil((existingTtl - Date.now()) / 1000));
    mem.set(key, current, remaining);
  }
  return current;
}

export async function getBudgetCount(key: string): Promise<number> {
  if (redisAvailable) {
    const raw = await redisClient.get(key);
    return raw ? parseInt(raw, 10) : 0;
  }
  return mem.get<number>(key) ?? 0;
}

// ── Exported client for code that needs raw access ────────────────────────────
// (e.g. permanent CricData ID mappings, socket.ts pub/sub)

export const redis = {
  set: async (key: string, value: string) => {
    if (redisAvailable) await redisClient.set(key, value);
    else permanentMem.set(key, value);
    return "OK";
  },
  /** SET key value EX ttl NX — returns true only if the lock was acquired. */
  setnx: async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
    if (redisAvailable) {
      const res = await redisClient.set(key, value, "EX", ttlSeconds, "NX");
      return res === "OK";
    }
    if (permanentMem.get(key)) return false;
    permanentMem.set(key, value, ttlSeconds);
    return true;
  },
  del: async (key: string): Promise<void> => {
    if (redisAvailable) await redisClient.del(key);
    permanentMem.del(key);
  },
  get: async (key: string): Promise<string | null> => {
    if (redisAvailable) return redisClient.get(key);
    return permanentMem.get<string>(key) ?? null;
  },
  incr: budgetIncr,
  expire: async (key: string, seconds: number) => {
    if (redisAvailable) await redisClient.expire(key, seconds);
  },
  ping: async () => (redisAvailable ? redisClient.ping() : "PONG"),
  // Pub/sub passthroughs — socket.ts uses these; they silently no-op
  // when Redis is unavailable (live tickers just won't broadcast).
  publish:   (...args: Parameters<typeof redisClient.publish>) =>
    redisAvailable ? redisClient.publish(...args) : 0 as any,
  subscribe: (...args: any[]) => {
    if (redisAvailable) return (redisSubClient as any).subscribe(...args);
  },
  on: (_event: string, _cb: (...args: any[]) => void) => {},
};

// Dedicated subscriber connection (Redis requires separate conn for pub/sub)
const redisSubClient = new Redis({
  ...redisConfig(),
  db: 0,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

redisSubClient.on("error", () => { /* silent */ });

export const redisPub = new Redis({
  ...redisConfig(),
  db: 0,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

redisPub.on("error", () => { /* silent */ });

export const redisSub = redisSubClient;
