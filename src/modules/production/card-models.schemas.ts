import { z } from "zod";
import { cardImageRef, tier } from "./production.schemas";

// ───────── Modèles de carte (recto / verso) ─────────
// Une image est soit un fichier téléversé par l'administration (POST /modeles-cartes/images, référence
// `/api/media/cartes/<uuid>.webp`, avec ou sans l'origine de l'API), soit une adresse https déjà hébergée
// (anciens modèles créés avec un lien).
const nom = z.string().trim().min(1, "nom requis").max(80);

export const createModeleCarteSchema = z
  .object({
    tier,
    nom,
    rectoUrl: cardImageRef,
    versoUrl: cardImageRef,
    /** Vrai : ce modèle devient celui que voient les clients de cette formule (l'ancien est désactivé). */
    actif: z.boolean().optional(),
  })
  .strict();

export const patchModeleCarteSchema = z
  .object({
    nom: nom.optional(),
    rectoUrl: cardImageRef.optional(),
    versoUrl: cardImageRef.optional(),
    actif: z.boolean().optional(),
  })
  .strict()
  .refine(o => Object.keys(o).length > 0, "au moins un champ à modifier");

export type CreateModeleCarteInput = z.infer<typeof createModeleCarteSchema>;
export type PatchModeleCarteInput = z.infer<typeof patchModeleCarteSchema>;
