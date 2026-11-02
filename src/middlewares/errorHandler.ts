import { Prisma } from "../database/prisma/generated/prisma/client";

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/httpError";
import { logger } from "../lib/logger";

const INTERNAL_ERROR_MESSAGE =
  "Une erreur technique est survenue. Réessayez plus tard.";
const INVALID_BODY_MESSAGE =
  "La requête est invalide. Vérifiez les données envoyées.";
const BODY_TOO_LARGE_MESSAGE =
  "La requête ou le fichier est trop volumineux.";
const RATE_LIMIT_MESSAGE =
  "Trop de requêtes. Réessayez dans quelques instants.";

type RequestBodyError = Error & { type?: string };

function requestBodyError(err: unknown) {
  if (!(err instanceof Error)) return null;
  const type = (err as RequestBodyError).type;
  if (type === "entity.parse.failed")
    return {
      status: 400,
      code: "CORPS_REQUETE_INVALIDE",
      message: INVALID_BODY_MESSAGE,
    };
  if (type === "entity.too.large")
    return {
      status: 413,
      code: "REQUETE_TROP_VOLUMINEUSE",
      message: BODY_TOO_LARGE_MESSAGE,
    };
  return null;
}

export function notFoundHandler(_req: Request, res: Response) {
  res
    .status(404)
    .json({
      error: { code: "ROUTE_INTROUVABLE", message: "Route introuvable" },
    });
}

export function rateLimitHandler(req: Request, res: Response) {
  logger.warn("Request rate limit exceeded", {
    requestId: res.locals.requestId,
    method: req.method,
    path: req.path,
    statusCode: 429,
    userId: req.user?.id,
  });
  return res.status(429).json({
    error: { code: "TROP_DE_REQUETES", message: RATE_LIMIT_MESSAGE },
  });
}

// Format d'erreur unique : { error: { code, message, details? } }
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      logger.error("Request failed with a server error", {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        statusCode: err.status,
        errorCode: err.code,
        userId: req.user?.id,
        error: { name: err.name, message: err.message, stack: err.stack },
      });
      return res.status(err.status).json({
        error: {
          code: "ERREUR_SERVEUR",
          message: INTERNAL_ERROR_MESSAGE,
        },
      });
    }
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
  const bodyError = requestBodyError(err);
  if (bodyError) {
    logger.warn("Request body rejected", {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      statusCode: bodyError.status,
      errorCode: bodyError.code,
      userId: req.user?.id,
    });
    return res.status(bodyError.status).json({
      error: { code: bodyError.code, message: bodyError.message },
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
      message: INTERNAL_ERROR_MESSAGE,
    },
  });
}
