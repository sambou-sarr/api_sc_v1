import { z } from "zod";

// ───────── Stickers « par section » ─────────
// Clé de section : type d'onglet (menu, biens…) ou identifiant d'un onglet personnalisé ; ce sont aussi les segments de
// l'adresse /s/:slug/:section, donc on se limite à des caractères sûrs pour une URL.
export const sectionKey = z.string().trim().regex(/^[A-Za-z0-9_-]{1,80}$/, "section invalide");

/** Demande du client : un devis pour un nombre de stickers ouvrant cette section. */
export const createSectionStickerSchema = z
  .object({
    section: sectionKey,
    quantite: z.number().int().min(1, "au moins 1 sticker").max(500, "500 stickers maximum par demande"),
    message: z.string().trim().max(500).optional(),
  })
  .strict();

const statutLower = z.enum(["demande", "active", "desactivee", "refusee"]);

/** Décision de l'administration. */
export const patchSectionStickerSchema = z.object({ statut: z.enum(["active", "desactivee", "refusee"]) }).strict();

export const listSectionStickersQuery = z.object({
  statut: statutLower.optional(),
  ficheId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type CreateSectionStickerInput = z.infer<typeof createSectionStickerSchema>;
export type PatchSectionStickerInput = z.infer<typeof patchSectionStickerSchema>;
export type ListSectionStickersQuery = z.infer<typeof listSectionStickersQuery>;
