import type { NextFunction, Request, Response } from "express";
import { prisma } from "../database/prisma/prisma-client";
import { logger } from "../lib/logger";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isAdminActionPath(path: string) {
  return (
    path.startsWith("/admin/") ||
    path === "/admin" ||
    path === "/auth/me" ||
    path.startsWith("/auth/me/")
  );
}

export function adminActionLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const actionPath = req.path;
  res.on("finish", () => {
    const admin = req.user;
    if (
      !admin ||
      admin.role !== "ADMIN" ||
      !admin.email ||
      !MUTATION_METHODS.has(req.method) ||
      res.statusCode >= 400 ||
      !isAdminActionPath(actionPath)
    ) {
      return;
    }

    void prisma.adminActionLog
      .create({
        data: {
          adminId: admin.id,
          adminName: admin.name,
          adminEmail: admin.email,
          method: req.method,
          path: actionPath,
          statusCode: res.statusCode,
        },
      })
      .catch((error: unknown) => {
        logger.error("Admin action log could not be saved", {
          requestId: res.locals.requestId,
          adminId: admin.id,
          method: req.method,
          path: actionPath,
          error,
        });
      });
  });

  next();
}
