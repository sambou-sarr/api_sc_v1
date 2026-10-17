import type { Request, Response } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { HttpError } from "../../lib/httpError";
import { MediaService } from "./media.service";
import type { MediaPurpose } from "./media.validation";

export const MediaController = {
  upload: asyncHandler(async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body)) {
      throw new HttpError(400, "CORPS_MEDIA_INVALIDE", "Le fichier doit être envoyé en binaire");
    }
    const contentType = req.headers["content-type"];
    const media = await MediaService.upload(
      req.user!,
      Number(req.params.id),
      req.body,
      Array.isArray(contentType) ? contentType[0] : contentType,
      req.query.purpose as MediaPurpose
    );
    res.status(201).json({ media });
  }),

  getPublic: asyncHandler(async (req: Request, res: Response) => {
    const media = await MediaService.getPublic(
      Number(req.params.ficheId),
      String(req.params.key),
      typeof req.headers.range === "string" ? req.headers.range : undefined
    );
    res.setHeader("Content-Type", media.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Accept-Ranges", "bytes");
    if (media.contentRange) {
      res.status(206);
      res.setHeader("Content-Range", media.contentRange);
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    // helmet() pose « same-origin » par défaut : le navigateur bloquerait alors <img src="http://api…/api/media/…">
    // dès que le front est sur une autre origine (ex. :5173 → :4000). Ces médias sont publics par conception.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (media.contentLength !== undefined) {
      res.setHeader("Content-Length", String(media.contentLength));
    }
    media.body.on("error", () => {
      if (!res.headersSent) res.status(502);
      res.end();
    });
    media.body.pipe(res);
  }),
}
