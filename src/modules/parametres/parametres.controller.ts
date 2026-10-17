import { asyncHandler } from "../../lib/asyncHandler";
import type { PatchFormuleInput } from "./parametres.schemas";
import { ParametresService } from "./parametres.service";

export const ParametresController = {
  get: asyncHandler(async (_req, res) => {
    res.json(await ParametresService.get());
  }),

  updateFormule: asyncHandler(async (req, res) => {
    res.json(
      await ParametresService.updateFormule(
        req.params.formule as string,
        req.body as PatchFormuleInput
      )
    );
  }),
};
