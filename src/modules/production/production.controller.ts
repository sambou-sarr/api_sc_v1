import { asyncHandler } from "../../lib/asyncHandler";
import { HttpError } from "../../lib/httpError";
import type { CreateModeleCarteInput, PatchModeleCarteInput } from "./card-models.schemas";
import { CardImageService } from "../media/card-images.service";
import { CardModelService } from "./card-models.service";
import type {
  CreateCarteInput,
  CreateStickerInput,
  ListCartesQuery,
  ListStickersQuery,
  PatchCarteInput,
  PatchQrInput,
  PatchStickerInput,
} from "./production.schemas";
import { ProductionService } from "./production.service";

export const ProductionController = {
  summary: asyncHandler(async (_req, res) => {
    res.json(await ProductionService.summary());
  }),

  // ───── Cartes ─────
  listCartes: asyncHandler(async (req, res) => {
    res.json(await ProductionService.listCartes(req.query as unknown as ListCartesQuery));
  }),
  createCarte: asyncHandler(async (req, res) => {
    res.status(201).json(await ProductionService.createCarte(req.body as CreateCarteInput));
  }),
  updateCarte: asyncHandler(async (req, res) => {
    res.json(await ProductionService.updateCarte(Number(req.params.id), req.body as PatchCarteInput));
  }),

  // ───── Modèles de carte (recto / verso) ─────
  listModelesCartes: asyncHandler(async (_req, res) => {
    res.json(await CardModelService.list());
  }),
  createModeleCarte: asyncHandler(async (req, res) => {
    res.status(201).json(await CardModelService.create(req.body as CreateModeleCarteInput));
  }),
  updateModeleCarte: asyncHandler(async (req, res) => {
    res.json(await CardModelService.update(Number(req.params.id), req.body as PatchModeleCarteInput));
  }),
  /** Envoi d'une image de carte (corps binaire, comme l'envoi de médias de fiche). Renvoie `{ url }`. */
  uploadModeleCarteImage: asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new HttpError(400, "CORPS_MEDIA_INVALIDE", "Le fichier doit être envoyé en binaire");
    }
    const contentType = req.headers["content-type"];
    res.status(201).json(await CardImageService.upload(req.body, Array.isArray(contentType) ? contentType[0] : contentType));
  }),
  deleteModeleCarte: asyncHandler(async (req, res) => {
    res.json(await CardModelService.remove(Number(req.params.id)));
  }),

  // ───── Stickers ─────
  listStickers: asyncHandler(async (req, res) => {
    res.json(await ProductionService.listStickers(req.query as unknown as ListStickersQuery));
  }),
  createSticker: asyncHandler(async (req, res) => {
    res.status(201).json(await ProductionService.createSticker(req.body as CreateStickerInput));
  }),
  updateSticker: asyncHandler(async (req, res) => {
    res.json(await ProductionService.updateSticker(Number(req.params.id), req.body as PatchStickerInput));
  }),

  // ───── QR dynamiques ─────
  listQr: asyncHandler(async (_req, res) => {
    res.json(await ProductionService.listQr());
  }),
  updateQr: asyncHandler(async (req, res) => {
    res.json(await ProductionService.updateQr(req.params.code as string, req.body as PatchQrInput));
  }),

  // ───── Public : GET /q/:code ─────
  redirect: asyncHandler(async (req, res) => {
    const cible = await ProductionService.resoudre(req.params.code as string, req.get("user-agent") ?? "");
    if (!cible) {
      res.status(404).type("text/plain").send("Ce lien n'est pas disponible.");
      return;
    }
    res.set("Cache-Control", "no-store"); // la cible peut changer à tout moment
    res.redirect(302, cible);
  }),
};
