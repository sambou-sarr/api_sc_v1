import { z } from "zod";

export const FORMULES = ["essentielle", "pro", "signature"] as const;
export const FORMULES_ABONNEMENT = ["pro", "signature"] as const;

export const formuleParams = z.object({ formule: z.enum(FORMULES) });
export const formuleAbonnementParams = z.object({
  formule: z.enum(FORMULES_ABONNEMENT),
});

// ───────── Remises selon la durée d'engagement ─────────
// ex. [{ dureeMois: 1, remisePct: 0 }, { dureeMois: 3, remisePct: 10 }, { dureeMois: 6, remisePct: 15 }, { dureeMois: 12, remisePct: 20 }]
const dureeSchema = z
  .object({
    dureeMois: z.number().int().min(1).max(120),
    remisePct: z.number().int().min(0).max(90),
  })
  .strict();

export const dureesSchema = z
  .array(dureeSchema)
  .max(12)
  .superRefine((durees, ctx) => {
    const tries = [...durees].sort((a, b) => a.dureeMois - b.dureeMois);
    for (let i = 1; i < tries.length; i++) {
      if (tries[i].dureeMois === tries[i - 1].dureeMois)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Deux durées identiques (${tries[i].dureeMois} mois)`,
        });
      else if (tries[i].remisePct < tries[i - 1].remisePct)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La remise ne peut pas baisser quand la durée augmente",
        });
    }
  });

// ───────── Remises selon le nombre de fiches prises d'un coup ─────────
// (la quantité 1 = pas de remise, donc le premier palier possible est 2)
const palierSchema = z
  .object({
    quantiteMin: z.number().int().min(2).max(100_000),
    remisePct: z.number().int().min(1).max(90),
  })
  .strict();

export const remisesSchema = z
  .array(palierSchema)
  .max(20)
  .superRefine((paliers, ctx) => {
    const tries = [...paliers].sort((a, b) => a.quantiteMin - b.quantiteMin);
    for (let i = 1; i < tries.length; i++) {
      if (tries[i].quantiteMin === tries[i - 1].quantiteMin)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Deux paliers ont la même quantité (${tries[i].quantiteMin})`,
        });
      else if (tries[i].remisePct <= tries[i - 1].remisePct)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La remise doit augmenter avec la quantité",
        });
    }
  });

// PATCH /parametres/formules/:formule
// prixMensuelFcfa : prix d'une fiche pour 1 mois (base du calcul) · null = pas de prix
// prixFcfa / dureeMois : valeurs par défaut utilisées à l'activation d'un abonnement
// durees / remises : remplacent toute la liste de la formule ([] = aucune)
export const patchFormuleSchema = z
  .object({
    prixMensuelFcfa: z.number().int().min(0).max(100_000_000).nullable().optional(),
    prixFcfa: z.number().int().min(0).max(100_000_000).nullable().optional(),
    dureeMois: z.number().int().min(1).max(120).nullable().optional(),
    actif: z.boolean().optional(),
    durees: dureesSchema.optional(),
    remises: remisesSchema.optional(),
  })
  .strict()
  .refine(b => Object.values(b).some(v => v !== undefined), {
    message: "Rien à modifier",
  });

// ───────── Emplacements supplémentaires ─────────
// ex. prixUnitaireFcfa: 1500, packs: [{ quantite: 3, prixFcfa: 3500 }]
const packSchema = z
  .object({
    quantite: z.number().int().min(2).max(1000),
    prixFcfa: z.number().int().min(1).max(100_000_000),
  })
  .strict();

export const packsSchema = z
  .array(packSchema)
  .max(10)
  .superRefine((packs, ctx) => {
    const vus = new Set<number>();
    for (const p of packs) {
      if (vus.has(p.quantite))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Deux packs de ${p.quantite} emplacements`,
        });
      vus.add(p.quantite);
    }
  });

// PATCH /parametres/emplacements
export const patchEmplacementsSchema = z
  .object({
    prixUnitaireFcfa: z.number().int().min(0).max(100_000_000).nullable().optional(),
    fichesGratuites: z.number().int().min(0).max(100_000).optional(),
    packs: packsSchema.optional(),
  })
  .strict()
  .refine(
    b =>
      b.prixUnitaireFcfa !== undefined ||
      b.fichesGratuites !== undefined ||
      b.packs !== undefined,
    { message: "Rien à modifier" }
  );

// ───────── Calcul de prix ─────────
// GET /parametres/formules/:formule/tarif?dureeMois=12&quantite=3
export const tarifQuery = z.object({
  dureeMois: z.coerce.number().int().min(1).max(120),
  quantite: z.coerce.number().int().min(1).max(100_000).default(1),
});

// GET /parametres/emplacements/tarif?quantite=4
export const tarifEmplacementsQuery = z.object({
  quantite: z.coerce.number().int().min(1).max(1000),
});

// POST /parametres/commande/tarif
// { "lignes": [{ "formule": "pro", "dureeMois": 12, "quantite": 5 }], "emplacements": 4 }
// Le palier de quantité se calcule sur le total des fiches d'une même formule dans la commande.
export const commandeTarifSchema = z
  .object({
    lignes: z
      .array(
        z
          .object({
            formule: z.enum(FORMULES),
            dureeMois: z.number().int().min(1).max(120),
            quantite: z.number().int().min(1).max(100_000),
          })
          .strict()
      )
      .min(1)
      .max(20),
    emplacements: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export type PatchFormuleInput = z.infer<typeof patchFormuleSchema>;
export type PatchEmplacementsInput = z.infer<typeof patchEmplacementsSchema>;
export type TarifQuery = z.infer<typeof tarifQuery>;
export type TarifEmplacementsQuery = z.infer<typeof tarifEmplacementsQuery>;
export type CommandeTarifInput = z.infer<typeof commandeTarifSchema>;