import { z } from "zod";

// GET /admin/relances?type=bientot&jours=30
//   bientot : abonnement qui se termine dans les `jours` prochains jours
//   expirees: plus aucun abonnement valable
//   montee  : formule Essentielle en cours, déjà scannée au moins `scansMin` fois
export const relancesQuery = z.object({
  type: z.enum(["bientot", "expirees", "montee"]),
  jours: z.coerce.number().int().min(1).max(365).default(30),
  scansMin: z.coerce.number().int().min(1).max(100_000).default(50),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type RelancesQuery = z.infer<typeof relancesQuery>;
