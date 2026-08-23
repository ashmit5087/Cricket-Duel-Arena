import { Pool, PoolClient } from "pg";
import { logger } from "../utils/logger";

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? "localhost",
  port:     parseInt(process.env.POSTGRES_PORT ?? "5432"),
  database: process.env.POSTGRES_DB       ?? "cricket_dna",
  user:     process.env.POSTGRES_USER     ?? "cricket_admin",
  password: process.env.POSTGRES_PASSWORD ?? "cricket_secret_2024",
  max:      20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on("error", (err) => {
  logger.error("[postgres] Unexpected pool error", { error: err.message });
});

pool.on("connect", () => {
  logger.debug("[postgres] New client connected");
});

/** Run a query with automatic connection management */
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/** Run multiple queries in a single transaction */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Verify connection is healthy */
export async function healthCheck(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export { pool };
