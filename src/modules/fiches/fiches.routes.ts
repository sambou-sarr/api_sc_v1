import { Router, raw } from "express";
import { optionalAuth, requireAuth } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { MediaController } from "../media/media.controller";
import { mediaUploadQuery } from "../media/media.validation";
import { clientCarteRequestSchema } from "../production/production.schemas";
import { fichePurchaseId, fichePurchaseInput } from "./fiche-purchases.schemas";
import { FicheController } from "./fiche.controller";
import {
  createFicheSchema,
  createRappelSchema,
  idParam,
  passageStatsQuerySchema,
  rappelListQuerySchema,
  recordPassageSchema,
  slugParam,
  updateFicheSchema,
} from "./fiches.schemas";

export const fichesRouter = Router();

// Public — page de la fiche (NFC / QR). Déclarée AVANT les routes protégées.
fichesRouter.get(
  "/public/:slug",
  validate({ params: slugParam }),
  FicheController.getPublicFiche
);

// Public — enregistre une ouverture réelle avec une clé d'idempotence par chargement.
fichesRouter.post(
  "/public/:slug/passages",
  optionalAuth,
  validate({ params: slugParam, body: recordPassageSchema }),
  FicheController.recordPublicPassage
);

// Public — enregistre une demande de rappel pour la fiche.
fichesRouter.post(
  "/public/:slug/rappels",
  validate({ params: slugParam, body: createRappelSchema }),
  FicheController.createPublicRappel
);

// Tout le reste exige d'être connecté.
fichesRouter.use(requireAuth);

fichesRouter.get("/", FicheController.listFiches);

fichesRouter.get(
  "/rappels",
  validate({ query: rappelListQuerySchema }),
  FicheController.listAllRappels
);

fichesRouter.get(
  "/total-fiche",
  // validate({ query: rappelListQuerySchema }),
  FicheController.totalFiches
);

fichesRouter.post(
  "/purchases/quote",
  validate({ body: fichePurchaseInput }),
  FicheController.quotePurchase
);

fichesRouter.post(
  "/purchases",
  validate({ body: fichePurchaseInput }),
  FicheController.createPurchase
);

fichesRouter.post(
  "/purchases/:purchaseId/simulate-confirmation",
  validate({ params: fichePurchaseId }),
  FicheController.confirmPurchase
);

fichesRouter.post(
  "/",
  validate({ body: createFicheSchema }),
  FicheController.createFiche
);

// L'upload utilise le corps binaire du fichier, pas du JSON/base64.
fichesRouter.post(
  "/:id/media",
  validate({ params: idParam, query: mediaUploadQuery }),
  raw({ type: () => true, limit: "30mb" }),
  MediaController.upload
);

fichesRouter.get(
  "/:id/stats",
  validate({ params: idParam, query: passageStatsQuerySchema }),
  FicheController.getPassageStats
);

fichesRouter.get(
  "/:id/rappels",
  validate({ params: idParam }),
  FicheController.listRappels
);

fichesRouter.get(
  "/:id/card-request",
  validate({ params: idParam }),
  FicheController.getCardRequest
);

fichesRouter.post(
  "/:id/card-request",
  validate({ params: idParam, body: clientCarteRequestSchema }),
  FicheController.createCardRequest
);

fichesRouter.get(
  "/:id",
  validate({ params: idParam }),
  FicheController.getFiche
);

fichesRouter.post(
  "/:id/publish",
  validate({ params: idParam }),
  FicheController.publishFiche
);

fichesRouter.patch(
  "/:id",
  validate({ params: idParam, body: updateFicheSchema }),
  FicheController.updateFiche
);

fichesRouter.delete(
  "/:id",
  validate({ params: idParam }),
  FicheController.deleteFiche
);
