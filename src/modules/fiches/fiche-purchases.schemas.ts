import { z } from "zod";

export const fichePurchaseInput = z
  .object({
    plan: z.enum(["essentielle", "pro", "signature"]),
    quantity: z.number().int().min(1).max(1000),
    dureeMois: z.number().int().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.plan === "essentielle" && value.dureeMois !== undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dureeMois"],
        message: "La formule Essentielle n'a pas de durée d'abonnement",
      });
    if (value.plan !== "essentielle" && value.dureeMois === undefined)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dureeMois"],
        message: "Choisissez une durée d'abonnement",
      });
  });

export const fichePurchaseId = z.object({
  purchaseId: z.coerce.number().int().positive(),
});

export type FichePurchaseInput = z.infer<typeof fichePurchaseInput>;
