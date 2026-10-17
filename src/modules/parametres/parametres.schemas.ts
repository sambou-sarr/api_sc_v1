import { z } from "zod";

export const FORMULES = ["essentielle", "pro", "signature"] as const;

export const formuleParams = z.object({ formule: z.enum(FORMULES) });

// PATCH /parametres/formules/:formule
// prixFcfa  : null = pas de prix défini · dureeMois : null = sans échéance
export const patchFormuleSchema = z
  .object({
    prixFcfa: z.number().int().min(0).max(100_000_000).nullable().optional(),
    dureeMois: z.number().int().min(1).max(120).nullable().optional(),
    actif: z.boolean().optional(),
  })
  .strict()
  .refine(
    b =>
      b.prixFcfa !== undefined ||
      b.dureeMois !== undefined ||
      b.actif !== undefined,
    { message: "Rien à modifier" }
  );

export type PatchFormuleInput = z.infer<typeof patchFormuleSchema>;
