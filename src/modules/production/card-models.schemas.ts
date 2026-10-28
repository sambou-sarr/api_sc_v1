import { z } from "zod";
import { tier, urlImage } from "./production.schemas";

// ───────── Modèles de carte (recto / verso) ─────────
// Images déjà hébergées (Cloudinary…) : adresse https uniquement, comme les fichiers d'impression.
const nom = z.string().trim().min(1, "nom requis").max(80);

export const createModeleCarteSchema = z
  .object({
    tier,
    nom,
    rectoUrl: urlImage,
    versoUrl: urlImage,
    /** Vrai : ce modèle devient celui que voient les clients de cette formule (l'ancien est désactivé). */
    actif: z.boolean().optional(),
  })
  .strict();

export const patchModeleCarteSchema = z
  .object({
    nom: nom.optional(),
    rectoUrl: urlImage.optional(),
    versoUrl: urlImage.optional(),
    actif: z.boolean().optional(),
  })
  .strict()
  .refine(o => Object.keys(o).length > 0, "au moins un champ à modifier");

export type CreateModeleCarteInput = z.infer<typeof createModeleCarteSchema>;
export type PatchModeleCarteInput = z.infer<typeof patchModeleCarteSchema>;
