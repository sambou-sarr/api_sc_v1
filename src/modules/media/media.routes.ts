import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { MediaController } from "./media.controller";
import { publicMediaParams } from "./media.validation";

export const mediaRouter = Router();

mediaRouter.get(
  "/:ficheId/:key",
  validate({ params: publicMediaParams }),
  MediaController.getPublic
);
