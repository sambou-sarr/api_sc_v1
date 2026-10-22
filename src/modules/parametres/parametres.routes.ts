import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { ParametresController } from "./parametres.controller";
import {
  commandeTarifSchema,
  formuleParams,
  patchEmplacementsSchema,
  patchFormuleSchema,
  tarifEmplacementsQuery,
  tarifQuery,
} from "./parametres.schemas";

// Réservé à l'administrateur. Monté sur /api/admin/parametres.
export const parametresRouter = Router();
parametresRouter.use(requireAuth, requireRole("ADMIN"));

// GET   /api/admin/parametres
//       formules (prix, durées + remises, remises par quantité) et emplacements (prix + packs)
parametresRouter.get("/", ParametresController.get);

// PATCH /api/admin/parametres/formules/:formule
//       { "prixMensuelFcfa"?: 2500, "prixFcfa"?: 24000, "dureeMois"?: 12, "actif"?: true,
//         "durees"?:  [{ "dureeMois": 3, "remisePct": 10 }, ...],
//         "remises"?: [{ "quantiteMin": 5, "remisePct": 10 }, ...] }
//       `durees` et `remises` remplacent la liste de la formule ([] = aucune)
parametresRouter.patch(
  "/formules/:formule",
  validate({ params: formuleParams, body: patchFormuleSchema }),
  ParametresController.updateFormule
);

// GET   /api/admin/parametres/formules/:formule/tarif?dureeMois=12&quantite=3
parametresRouter.get(
  "/formules/:formule/tarif",
  validate({ params: formuleParams, query: tarifQuery }),
  ParametresController.tarif
);

// PATCH /api/admin/parametres/emplacements
//       { "prixUnitaireFcfa"?: 1500, "packs"?: [{ "quantite": 3, "prixFcfa": 3500 }] }
parametresRouter.patch(
  "/emplacements",
  validate({ body: patchEmplacementsSchema }),
  ParametresController.updateEmplacements
);

// GET   /api/admin/parametres/emplacements/tarif?quantite=4
parametresRouter.get(
  "/emplacements/tarif",
  validate({ query: tarifEmplacementsQuery }),
  ParametresController.tarifEmplacements
);

// POST  /api/admin/parametres/commande/tarif
//       { "lignes": [{ "formule": "pro", "dureeMois": 12, "quantite": 5 }], "emplacements": 4 }
parametresRouter.post(
  "/commande/tarif",
  validate({ body: commandeTarifSchema }),
  ParametresController.tarifCommande
);

// ───────── Côté client (lecture seule) ─────────
// Monté sur /api/client/parametres. Pas de requireRole("ADMIN") : le client ne fait
// que LIRE la grille et calculer le prix d'un panier ; seul l'admin peut modifier.
// Utilise ici le même middleware d'auth que les routes client de ton collègue.
// Pour une page de tarifs visible sans connexion, retire la ligne `use`.
export const parametresClientRouter = Router();
parametresClientRouter.use(requireAuth);

// GET  /api/client/parametres
//      grille : formules (prix mensuel, durées + remises, paliers de quantité) et emplacements
parametresClientRouter.get("/", ParametresController.grille);

// POST /api/client/parametres/commande/tarif
//      { "lignes": [{ "formule": "pro", "dureeMois": 3, "quantite": 12 }], "emplacements": 2 }
//      même calcul que côté admin (remise durée puis remise quantité, en cascade)
parametresClientRouter.post(
  "/commande/tarif",
  validate({ body: commandeTarifSchema }),
  ParametresController.tarifCommande
);