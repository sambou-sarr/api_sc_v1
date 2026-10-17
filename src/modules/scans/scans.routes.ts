import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../../middlewares/validate";
import { ScansController } from "./scans.controller";
import { scanParams } from "./scans.schemas";

// Route PUBLIQUE (pas de connexion) : appelée par la page de la fiche à chaque ouverture.
export const scansRouter = Router();

const limite = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/scans/:slug  → 204 (compté ou ignoré) · 404 (fiche inconnue ou suspendue)
scansRouter.post(
  "/:slug",
  limite,
  validate({ params: scanParams }),
  ScansController.hit
);
