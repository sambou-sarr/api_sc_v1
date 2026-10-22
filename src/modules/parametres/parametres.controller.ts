import { asyncHandler } from "../../lib/asyncHandler";
import type {
  CommandeTarifInput,
  PatchEmplacementsInput,
  PatchFormuleInput,
  TarifEmplacementsQuery,
  TarifQuery,
} from "./parametres.schemas";
import { ParametresService } from "./parametres.service";

export const ParametresController = {
  get: asyncHandler(async (_req, res) => {
    res.json(await ParametresService.get());
  }),

  // Côté client : grille publique (voir ParametresService.grille)
  grille: asyncHandler(async (_req, res) => {
    res.json(await ParametresService.grille());
  }),

  updateFormule: asyncHandler(async (req, res) => {
    res.json(
      await ParametresService.updateFormule(
        req.params.formule as string,
        req.body as PatchFormuleInput
      )
    );
  }),

  updateEmplacements: asyncHandler(async (req, res) => {
    res.json(
      await ParametresService.updateEmplacements(
        req.body as PatchEmplacementsInput
      )
    );
  }),

  tarif: asyncHandler(async (req, res) => {
    const { dureeMois, quantite } = req.query as unknown as TarifQuery;
    res.json(
      await ParametresService.tarif(
        req.params.formule as string,
        dureeMois,
        quantite
      )
    );
  }),

  tarifEmplacements: asyncHandler(async (req, res) => {
    const { quantite } = req.query as unknown as TarifEmplacementsQuery;
    res.json(await ParametresService.tarifEmplacements(quantite));
  }),

  tarifCommande: asyncHandler(async (req, res) => {
    res.json(
      await ParametresService.tarifCommande(req.body as CommandeTarifInput)
    );
  }),
};