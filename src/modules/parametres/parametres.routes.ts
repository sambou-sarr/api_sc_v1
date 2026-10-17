import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { ParametresController } from "./parametres.controller";
import { formuleParams, patchFormuleSchema } from "./parametres.schemas";

// Réservé à l'administrateur. Monté sur /api/admin/parametres.
export const parametresRouter = Router();
parametresRouter.use(requireAuth, requireRole("ADMIN"));

// GET   /api/admin/parametres                      les 3 formules : prix, durée, actif
parametresRouter.get("/", ParametresController.get);

// PATCH /api/admin/parametres/formules/:formule    { "prixFcfa"?: 90000 | null, "dureeMois"?: 12 | null, "actif"?: false }
parametresRouter.patch(
  "/formules/:formule",
  validate({ params: formuleParams, body: patchFormuleSchema }),
  ParametresController.updateFormule
);
