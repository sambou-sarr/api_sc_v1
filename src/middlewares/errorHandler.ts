import { Prisma } from "../database/prisma/generated/prisma/client";

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { HttpError } from "../lib/httpError";
import { logger } from "../lib/logger";

export function notFoundHandler(_req: Request, res: Response) {
  res
    .status(404)
    .json({
      error: { code: "ROUTE_INTROUVABLE", message: "Route introuvable" },
    });
}

// Format d'erreur unique : { error: { code, message, details? } }
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    logger.warn("Request rejected", {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      statusCode: err.status,
      errorCode: err.code,
      userId: req.user?.id,
    });
    return res
      .status(err.status)
      .json({
        error: { code: err.code, message: err.message, details: err.details },
      });
  }
  if (err instanceof ZodError) {
    logger.warn("Request validation failed", {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      statusCode: 400,
      userId: req.user?.id,
    });
    return res.status(400).json({
      error: {
        code: "DONNEES_INVALIDES",
        message: "Données invalides",
        details: err.issues.map(i => ({
          champ: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    logger.warn("Request rejected due to duplicate value", {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      statusCode: 409,
      errorCode: "DEJA_UTILISE",
      userId: req.user?.id,
    });
    return res
      .status(409)
      .json({
        error: { code: "DEJA_UTILISE", message: "Cette valeur existe déjà" },
      });
  }
  logger.error("Unhandled request error", {
    requestId: res.locals.requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    error:
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : String(err),
  });
  res.status(500).json({
    error: {
      code: "ERREUR_SERVEUR",
      message: env.NODE_ENV === "production" ? "Erreur interne" : String(err),
    },
  });
}
