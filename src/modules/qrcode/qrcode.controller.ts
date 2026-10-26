import type { Request } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import type {
  CreateStyleInput,
  PatchStyleInput,
  RenderInput,
  TelechargerQuery,
} from "./qrcode.schemas";
import { QrcodeService } from "./qrcode.service";

// ⚠ À ADAPTER : renvoie l'id de l'utilisateur connecté, comme dans les controllers client
// de ton collègue (ici on suppose que `requireAuth` remplit `req.user`).
const userId = (req: Request) => req.user!.id as number;

export const QrcodeController = {
  formats: asyncHandler(async (_req, res) => {
    res.json(QrcodeService.formats());
  }),

  apercu: asyncHandler(async (req, res) => {
    res.json(await QrcodeService.apercu(userId(req), req.body as RenderInput));
  }),

  // Renvoie directement le fichier (pas du JSON) : le front le récupère en « blob ».
  telecharger: asyncHandler(async (req, res) => {
    const { format } = req.query as unknown as TelechargerQuery;
    const fichier = await QrcodeService.telecharger(
      userId(req),
      req.body as RenderInput,
      format
    );
    res.setHeader("Content-Type", fichier.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${fichier.filename}"`);
    res.setHeader("Cache-Control", "no-store"); // le contenu peut être un mot de passe Wi-Fi
    res.send(fichier.buffer);
  }),

  listStyles: asyncHandler(async (req, res) => {
    res.json(await QrcodeService.listStyles(userId(req)));
  }),

  getStyle: asyncHandler(async (req, res) => {
    res.json(await QrcodeService.getStyle(userId(req), Number(req.params.id)));
  }),

  createStyle: asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(await QrcodeService.createStyle(userId(req), req.body as CreateStyleInput));
  }),

  updateStyle: asyncHandler(async (req, res) => {
    res.json(
      await QrcodeService.updateStyle(
        userId(req),
        Number(req.params.id),
        req.body as PatchStyleInput
      )
    );
  }),

  deleteStyle: asyncHandler(async (req, res) => {
    await QrcodeService.deleteStyle(userId(req), Number(req.params.id));
    res.status(204).end();
  }),
};
