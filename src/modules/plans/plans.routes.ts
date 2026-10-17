import { Router } from "express";
import { prisma } from "../../database/prisma/prisma-client";
import { asyncHandler } from "../../lib/asyncHandler";

export const plansRouter = Router();

// Public : alimente la page tarifs et l'éditeur (ce que chaque formule permet).
plansRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const plans = await prisma.plan.findMany({
      where: { actif: true },
      include: { limits: true },
      orderBy: { prixFcfa: "asc" },
    });
    res.json({ plans });
  })
);
