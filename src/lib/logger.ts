import winston from "winston";

const consoleFormat =
  process.env.NODE_ENV === "production"
    ? winston.format.json()
    : winston.format.combine(
        winston.format.printf(({ timestamp, level, message, ...context }) => {
          const details = Object.entries(context)
            .map(
              ([key, value]) =>
                `${key}=${JSON.stringify(value) ?? String(value)}`
            )
            .join(" ");

          return `${timestamp} ${level.toUpperCase()} ${message}${
            details ? ` | ${details}` : ""
          }`;
        }),
        winston.format.colorize({ all: true })
      );

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    consoleFormat
  ),
  transports: [new winston.transports.Console()],
});
