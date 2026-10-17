import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { RevenusController } from "./revenus.controller";

// Réservé à l'administrateur. Monté sur /api/admin/revenus.
export const revenusRouter = Router();
revenusRouter.use(requireAuth, requireRole("ADMIN"));

// GET /api/admin/revenus
revenusRouter.get("/", RevenusController.get);
