import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { RelancesController } from "./relances.controller";
import { relancesQuery } from "./relances.schemas";

// Réservé à l'administrateur. Monté sur /api/admin/relances.
export const relancesRouter = Router();
relancesRouter.use(requireAuth, requireRole("ADMIN"));

// GET /api/admin/relances?type=bientot|expirees|montee&jours=30&scansMin=50&limit=100
relancesRouter.get("/", validate({ query: relancesQuery }), RelancesController.list);
