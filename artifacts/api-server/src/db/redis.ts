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

// ── In-memory store (node-cache) ──────────────────────────────────────────────
// Used as the sole backend when Redis is not configured.
// node-cache is already in package.json dependencies.

const mem = new NodeCache({ useClones: false });

// Permanent key store (TTL = 0 = never expires in NodeCache)
const permanent = new NodeCache({ useClones: false });

logger.info("[cache] Running with in-memory cache (Redis not required)");

// ── Redis stub — keeps imports working in routes that use `redis` directly ────
// (e.g. `redis.set(key, value)` for permanent CricData ID mappings)

export const redis = {
  set: async (key: string, value: string) => {
    permanent.set(key, value);
    return "OK";
  },
  get: async (key: string): Promise<string | null> => {
    return permanent.get<string>(key) ?? null;
  },
  incr: async (key: string): Promise<number> => {
    const current = (mem.get<number>(key) ?? 0) + 1;
    const ttl = mem.getTtl(key);
    if (ttl !== undefined && ttl !== 0) {
      mem.set(key, current, Math.ceil((ttl - Date.now()) / 1000));
    } else {
      mem.set(key, current);
    }
    return current;
  },
  expire: async (key: string, seconds: number): Promise<void> => {
    const value = mem.get(key);
    if (value !== undefined) mem.set(key, value, seconds);
  },
  ping: async () => "PONG",
  // Socket.io pub/sub stubs (no-op without Redis)
  publish:   async () => 0,
  subscribe: async () => {},
  on:        () => {},
};

// Stub pub/sub clients used by socket service
export const redisPub = redis;
export const redisSub = redis;

// ── Cache helpers ─────────────────────────────────────────────────────────────

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  try {
    if (ttlSeconds && ttlSeconds > 0) {
      mem.set(key, value, ttlSeconds);
    } else {
      permanent.set(key, value);
    }
  } catch (e: any) {
    logger.warn("[cache] cacheSet failed", { key, error: e.message });
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return mem.get<T>(key) ?? permanent.get<T>(key) ?? null;
  } catch {
    return null;
  }
}

export async function cacheDel(key: string): Promise<void> {
  mem.del(key);
  permanent.del(key);
}

export async function publish(_channel: string, _data: unknown): Promise<void> {
  // no-op without Redis pub/sub
}

export async function redisHealthCheck(): Promise<boolean> {
  return true; // in-memory always "healthy"
}

// ── Budget helpers ────────────────────────────────────────────────────────────

/**
 * Atomically increments a daily budget counter.
 * In-memory: resets automatically when the process restarts (fine for dev).
 */
export async function budgetIncr(key: string, _limit: number): Promise<number> {
  const current = (mem.get<number>(key) ?? 0) + 1;
  // Set 24h TTL on first increment so counter resets next day
  const existingTtl = mem.getTtl(key);
  if (!existingTtl || existingTtl === 0) {
    mem.set(key, current, 86400);
  } else {
    const remaining = Math.max(1, Math.ceil((existingTtl - Date.now()) / 1000));
    mem.set(key, current, remaining);
  }
  return current;
}

/**
 * Returns the current value of a budget counter without modifying it.
 */
export async function getBudgetCount(key: string): Promise<number> {
  return mem.get<number>(key) ?? 0;
}
