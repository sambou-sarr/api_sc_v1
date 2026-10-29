import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { MediaController } from "./media.controller";
import { cardImageParams, publicMediaParams } from "./media.validation";

export const mediaRouter = Router();

// Avant la route générique : « cartes » ne doit pas être lu comme un identifiant de fiche.
mediaRouter.get(
  "/cartes/:fileName",
  validate({ params: cardImageParams }),
  MediaController.getCardImage
);

mediaRouter.get(
  "/:ficheId/:key",
  validate({ params: publicMediaParams }),
  MediaController.getPublic
);
