import { z } from "zod";
import { tier, urlImage } from "./production.schemas";

// ───────── Modèles de carte (recto / verso) ─────────
// Une image est soit un fichier téléversé par l'administration (POST /modeles-cartes/images, référence
// `/api/media/cartes/<uuid>.webp`, avec ou sans l'origine de l'API), soit une adresse https déjà hébergée
// (anciens modèles créés avec un lien).
const uploadedImage = z
  .string()
  .trim()
  .regex(/^(https?:\/\/[^\s/]+)?\/api\/media\/cartes\/[0-9a-f-]{36}\.webp$/i, "image invalide");
export const imageRef = z.union([urlImage, uploadedImage]);

const nom = z.string().trim().min(1, "nom requis").max(80);

export const createModeleCarteSchema = z
  .object({
    tier,
    nom,
    rectoUrl: imageRef,
    versoUrl: imageRef,
    /** Vrai : ce modèle devient celui que voient les clients de cette formule (l'ancien est désactivé). */
    actif: z.boolean().optional(),
  })
  .strict();

export const patchModeleCarteSchema = z
  .object({
    nom: nom.optional(),
    rectoUrl: imageRef.optional(),
    versoUrl: imageRef.optional(),
    actif: z.boolean().optional(),
  })
  .strict()
  .refine(o => Object.keys(o).length > 0, "au moins un champ à modifier");

export type CreateModeleCarteInput = z.infer<typeof createModeleCarteSchema>;
export type PatchModeleCarteInput = z.infer<typeof patchModeleCarteSchema>;
