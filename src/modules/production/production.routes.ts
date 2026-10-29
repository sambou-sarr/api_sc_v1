import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { idParam } from "../fiches/fiches.schemas";
import { raw } from "express";
import { createModeleCarteSchema, patchModeleCarteSchema } from "./card-models.schemas";
import { ProductionController } from "./production.controller";
import {
  codeParams,
  createCarteSchema,
  createStickerSchema,
  listCartesQuery,
  listStickersQuery,
  patchCarteSchema,
  patchQrSchema,
  patchStickerSchema,
} from "./production.schemas";

// ───────────────── Administration — monté sur /api/admin/production ─────────────────
export const productionRouter = Router();
productionRouter.use(requireAuth, requireRole("ADMIN"));

// GET   /summary                          cartes à imprimer, stickers à paramétrer, QR sans cible, scans
productionRouter.get("/summary", ProductionController.summary);

// Cartes (Evolis)
// GET   /cartes?statut=&limit=
productionRouter.get("/cartes", validate({ query: listCartesQuery }), ProductionController.listCartes);
// POST  /cartes                           { ficheId, tier?, design? }
productionRouter.post("/cartes", validate({ body: createCarteSchema }), ProductionController.createCarte);
// PATCH /cartes/:id                       { statut?, notes?, design? }
productionRouter.patch("/cartes/:id", validate({ params: idParam, body: patchCarteSchema }), ProductionController.updateCarte);

// Modèles de carte (recto / verso affichés au client dans sa demande de carte) — un seul actif par formule
// GET    /modeles-cartes
productionRouter.get("/modeles-cartes", ProductionController.listModelesCartes);
// POST   /modeles-cartes/images           corps binaire (JPEG, PNG ou WebP, 12 Mo max) → { url } à mettre dans rectoUrl / versoUrl
productionRouter.post("/modeles-cartes/images", raw({ type: () => true, limit: "13mb" }), ProductionController.uploadModeleCarteImage);
// POST   /modeles-cartes                  { tier, nom, rectoUrl, versoUrl, actif? }  (image = url renvoyée ci-dessus, ou lien https)
productionRouter.post("/modeles-cartes", validate({ body: createModeleCarteSchema }), ProductionController.createModeleCarte);
// PATCH  /modeles-cartes/:id              { nom?, rectoUrl?, versoUrl?, actif? }   actif:true désactive l'ancien
productionRouter.patch("/modeles-cartes/:id", validate({ params: idParam, body: patchModeleCarteSchema }), ProductionController.updateModeleCarte);
// DELETE /modeles-cartes/:id
productionRouter.delete("/modeles-cartes/:id", validate({ params: idParam }), ProductionController.deleteModeleCarte);

// Stickers
// GET   /stickers?kind=&statut=&limit=
productionRouter.get("/stickers", validate({ query: listStickersQuery }), ProductionController.listStickers);
// POST  /stickers                         kind "fonction" | "telephone"
productionRouter.post("/stickers", validate({ body: createStickerSchema }), ProductionController.createSticker);
// PATCH /stickers/:id                     { statut?, notes?, parametres? }
productionRouter.patch("/stickers/:id", validate({ params: idParam, body: patchStickerSchema }), ProductionController.updateSticker);

// QR dynamiques
// GET   /qr
productionRouter.get("/qr", ProductionController.listQr);
// PATCH /qr/:code                         { targetUrl?: "https://…" | null, actif? }
productionRouter.patch("/qr/:code", validate({ params: codeParams, body: patchQrSchema }), ProductionController.updateQr);

// ───────────────── Public — monté sur /q ─────────────────
// Les stickers imprimés pointent ici ; la cible se change à distance sans réimprimer.
export const qrPublicRouter = Router();
const limite = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
// GET /q/:code  → 302 vers la cible · 404 si inconnu, désactivé ou sans cible
qrPublicRouter.get("/:code", limite, validate({ params: codeParams }), ProductionController.redirect);
