import type { NextFunction, Request, Response } from "express";
import type { Role } from "../database/prisma/generated/prisma/client";
import { prisma } from "../database/prisma/prisma-client";
import { forbidden, unauthorized } from "../lib/httpError";
import { verifyToken } from "../lib/jwt";
import { logger } from "../lib/logger";

// Exige un « Authorization: Bearer <token> » valide et recharge l'utilisateur en base
// (un compte supprimé ou rétrogradé perd ses droits immédiatement).
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    const rejectAuthentication = (reason: string, message?: string): never => {
      logger.warn("Authentication failed", {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        reason,
      });
      throw unauthorized(message);
    };

    if (!header) return rejectAuthentication("missing_authorization_header");
    if (!header.startsWith("Bearer "))
      return rejectAuthentication("invalid_authorization_scheme");

    let userId: number;
    try {
      userId = Number(verifyToken(header.slice(7)).sub);
    } catch {
      return rejectAuthentication(
        "invalid_or_expired_token",
        "Session invalide ou expirée"
      );
    }
    if (!Number.isSafeInteger(userId) || userId <= 0)
      return rejectAuthentication(
        "invalid_token_subject",
        "Session invalide ou expirée"
      );

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      return rejectAuthentication("user_not_found", "Compte introuvable");

    req.user = {
      id: user.id,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    };
    next();
  } catch (e) {
    next(e);
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role))
      return next(forbidden("ACCES_REFUSE", "Droits insuffisants"));
    next();
  };

// Authentification facultative pour les endpoints publics qui doivent distinguer
// un visiteur anonyme du propriétaire connecté. Un jeton absent ou invalide reste anonyme.
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next();

    try {
      const userId = Number(verifyToken(header.slice(7)).sub);
      if (!Number.isSafeInteger(userId) || userId <= 0) return next();

      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (user) {
        req.user = {
          id: user.id,
          role: user.role,
          emailVerified: user.emailVerifiedAt !== null,
        };
      }
    } catch {
      // L'endpoint reste public : un jeton expiré ne bloque pas la consultation.
    }
    next();
  } catch (error) {
    next(error);
  }
}
