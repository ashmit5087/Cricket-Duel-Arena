import { createLogger, format, transports } from "winston";

const isDev = process.env.NODE_ENV !== "production";

export const logger = createLogger({
  level: isDev ? "debug" : "info",
  format: format.combine(
    format.timestamp({ format: "HH:mm:ss" }),
    format.errors({ stack: true }),
    isDev
      ? format.combine(
          format.colorize(),
          format.printf(({ timestamp, level, message, ...meta }) =>
            `${timestamp} ${level}: ${message}${
              Object.keys(meta).length ? " " + JSON.stringify(meta) : ""
            }`
          )
        )
      : format.json()
  ),
  transports: [new transports.Console()],
});