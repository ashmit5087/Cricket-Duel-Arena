// src/lib/logger.ts
// Simple console logger — same interface as the winston/pino loggers used elsewhere.
// Kept dependency-free so the server builds without optional logging packages.

const isProduction = process.env.NODE_ENV === "production";

function fmt(level: string, msg: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta as object).length ? ` ${JSON.stringify(meta)}` : "";
  return `${ts} [${level}] ${msg}${metaStr}`;
}

export const logger = {
  info: (msg: string, meta?: any) => console.log(fmt("info", msg, meta)),
  warn: (msg: string, meta?: any) => console.warn(fmt("warn", msg, meta)),
  error: (msg: string, meta?: any) => console.error(fmt("error", msg, meta)),
  debug: (msg: string, meta?: any) => {
    if (!isProduction) console.debug(fmt("debug", msg, meta));
  },
};

export default logger;
