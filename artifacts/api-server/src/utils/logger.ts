export const logger = {
  info: (msg: string, meta?: any) => console.log(`[info] ${msg}`, meta ?? ""),
  warn: (msg: string, meta?: any) => console.warn(`[warn] ${msg}`, meta ?? ""),
  error: (msg: string, meta?: any) => console.error(`[error] ${msg}`, meta ?? ""),
  debug: (msg: string, meta?: any) => console.debug(`[debug] ${msg}`, meta ?? ""),
};

export default logger;
