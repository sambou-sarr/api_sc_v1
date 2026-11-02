import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { RevenusController } from "./revenus.controller";
import { z } from "zod";

// Réservé à l'administrateur. Monté sur /api/admin/revenus.
export const revenusRouter = Router();
revenusRouter.use(requireAuth, requireRole("ADMIN"));

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const revenusQuery = z.object({
  from: date,
  to: date,
}).refine(({ from, to }) => from <= to, {
  message: "La date de début doit précéder la date de fin.",
  path: ["from"],
});

// GET /api/admin/revenus
revenusRouter.get(
  "/",
  validate({ query: revenusQuery }),
  RevenusController.get
);
