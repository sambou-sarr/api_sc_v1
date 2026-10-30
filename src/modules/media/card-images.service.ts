import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import { s3Storage } from "../../infrastructure/storage/s3.storage";
import { notFound, unprocessable } from "../../lib/httpError";
import { logger } from "../../lib/logger";
import { optimizeMedia } from "./media.processor";
import {
  MEDIA_FORMATS,
  mediaMaxBytes,
  resolveMediaMime,
  validateMediaSignature,
} from "./media.validation";

/*
  Images des modèles de carte (recto / verso) téléversées par l'administration.
  Même chaîne que les médias de fiche (type vérifié sur les premiers octets, conversion WebP par FFmpeg, stockage S3),
  mais : images seulement, rangées sous `card-models/`, servies publiquement (le navigateur du client les charge
  directement avec une balise <img>, sans jeton).
  Référence persistée : `/api/media/cartes/<uuid>.webp` (relative, comme les médias de fiche).
*/
const PREFIX = "card-models/";

/** Référence relative d'une image de modèle de carte, éventuellement précédée de l'origine de l'API. */
const REF =
  /^(?:https?:\/\/[^/\s]+)?(\/api\/media\/cartes\/([0-9a-f-]{36}\.webp))$/i;
export const CARD_IMAGE_FILE = /^[0-9a-f-]{36}\.webp$/i;
export const isCardImageRef = (value: string) =>
  /^\/api\/media\/cartes\/[0-9a-f-]{36}\.webp$/i.test(value);

const getStorage = s3Storage;

const apiOrigin = () => env.SERVER.replace(/\/api\/?$/, "").replace(/\/$/, "");

export const CardImageService = {
  async upload(body: Buffer, rawMime?: string) {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw unprocessable("FICHIER_VIDE", "Le fichier envoyé est vide");
    }
    const mime = resolveMediaMime(rawMime);
    if (MEDIA_FORMATS[mime].kind !== "image") {
      throw unprocessable(
        "FORMAT_IMAGE_REQUIS",
        "Une image est attendue (JPEG, PNG ou WebP)"
      );
    }
    if (body.length > mediaMaxBytes("image")) {
      throw unprocessable(
        "MEDIA_TROP_LOURD",
        "Une image ne peut pas dépasser 12 Mo"
      );
    }
    validateMediaSignature(body, mime);

    const optimized = await optimizeMedia(body, mime);
    if (optimized.body.length > mediaMaxBytes("image")) {
      throw unprocessable(
        "MEDIA_TROP_LOURD_APRES_OPTIMISATION",
        "L’image optimisée dépasse 12 Mo"
      );
    }
    const fileName = `${randomUUID()}.webp`;
    await getStorage().put({
      key: `${PREFIX}${fileName}`,
      body: optimized.body,
      contentType: "image/webp",
    });
    return { url: `${apiOrigin()}/api/media/cartes/${fileName}` };
  },

  async getPublic(fileName: string, range?: string) {
    if (!CARD_IMAGE_FILE.test(fileName)) throw notFound("Image introuvable");
    try {
      const object = await getStorage().get(`${PREFIX}${fileName}`, range);
      return { ...object, contentType: object.contentType ?? "image/webp" };
    } catch (e) {
      const err = e as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404)
        throw notFound("Image introuvable");
      throw e;
    }
  },

  /** Rend absolue une référence relative (affichage) ; les adresses https externes restent telles quelles. */
  toAbsolute(ref: string) {
    return ref.startsWith("/api/media/") ? `${apiOrigin()}${ref}` : ref;
  },

  /**
   * Supprime le fichier d'une référence qui nous appartient. Sans effet pour une adresse externe.
   * Au mieux : un échec de suppression ne doit jamais faire échouer l'opération de l'administrateur.
   */
  async deleteRef(ref: string | null | undefined) {
    const match = ref ? REF.exec(ref) : null;
    if (!match) return;
    try {
      await getStorage().delete(`${PREFIX}${match[2]}`);
    } catch (e) {
      logger.warn(
        `Suppression de l'image de modèle de carte impossible (${match[2]}) : ${(e as Error).message}`
      );
    }
  },
};
