import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const statusCode = res.statusCode;
    const level =
      statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    const route = req.route?.path;

    logger.log(level, "HTTP request completed", {
      requestId,
      method: req.method,
      path: route ? `${req.baseUrl}${route}` : req.path,
      statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
      userId: req.user?.id,
    });
  });

  next();
}
