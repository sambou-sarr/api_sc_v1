import { z } from "zod";

// ───────── Briques communes ─────────
const tier = z.enum(["essentielle", "pro", "signature"]);
const statutCarte = z.enum(["a_imprimer", "imprimee", "encodee", "testee", "livree", "annulee"]);
const statutSticker = z.enum(["a_parametrer", "parametre", "teste", "imprime", "livre", "annule"]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "couleur #RRGGBB attendue");
const limit = z.coerce.number().int().min(1).max(200).default(100);
const jsonLeger = (max: number) => (v: unknown) => JSON.stringify(v).length <= max;

// Paramètres libres d'un sticker (SSID, liens, réseaux…) : valeurs simples, tailles bornées.
const parametres = z
  .record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean()]))
  .refine(o => Object.keys(o).length <= 20, "20 paramètres maximum");

const urlHttp = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine(u => /^https?:\/\//i.test(u), "l'adresse doit commencer par http:// ou https://");

// Fichiers d'impression déjà hébergés (Cloudinary…) : adresse https uniquement.
const urlImage = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine(u => /^https:\/\//i.test(u), "l'adresse doit commencer par https://");

export const codeParams = z.object({ code: z.string().regex(/^[a-z0-9]{4,12}$/, "code invalide") });

// ───────── Cartes ─────────
export const listCartesQuery = z.object({ statut: statutCarte.optional(), limit });

export const createCarteSchema = z
  .object({
    ficheId: z.number().int().positive(),
    tier: tier.optional(), // par défaut : la formule en cours de la fiche
    rectoUrl: urlImage.optional(),
    versoUrl: urlImage.optional(),
    design: z.record(z.string(), z.unknown()).refine(jsonLeger(20_000), "design trop volumineux").optional(),
  })
  .strict();

export const patchCarteSchema = z
  .object({
    statut: statutCarte.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    rectoUrl: urlImage.nullable().optional(), // null = retirer le fichier
    versoUrl: urlImage.nullable().optional(),
    design: z.record(z.string(), z.unknown()).refine(jsonLeger(20_000), "design trop volumineux").optional(),
  })
  .strict()
  .refine(b => Object.values(b).some(v => v !== undefined), { message: "Rien à modifier" });

// ───────── Stickers ─────────
export const listStickersQuery = z.object({
  kind: z.enum(["fonction", "telephone"]).optional(),
  statut: statutSticker.optional(),
  limit,
});

const communs = {
  quantite: z.number().int().min(1).max(10_000).default(1),
  notes: z.string().trim().max(1000).optional(),
};

const stickerFonction = z
  .object({
    kind: z.literal("fonction"),
    ficheId: z.number().int().positive().optional(),
    fonction: z.enum(["avis", "wifi", "menu", "reseaux", "contact", "rdv", "lien"]),
    tailleMm: z.union([z.literal(80), z.literal(120), z.literal(170)]),
    forme: z.enum(["rond", "carre"]),
    theme: z.enum(["noir", "blanc", "or", "rouge"]),
    options: z.object({ nfc: z.boolean().optional(), anti_metal: z.boolean().optional() }).strict().optional(),
    parametres: parametres.default({}),
    ...communs,
  })
  .strict();

const stickerTelephone = z
  .object({
    kind: z.literal("telephone"),
    ficheId: z.number().int().positive(), // la fiche dont on copie le QR
    personnalisation: z
      .object({ couleur_qr: hex.optional(), fond: hex.optional(), texte: z.string().trim().max(40).optional() })
      .strict()
      .default({}),
    ...communs,
  })
  .strict();

export const createStickerSchema = z.discriminatedUnion("kind", [stickerFonction, stickerTelephone]);

export const patchStickerSchema = z
  .object({
    statut: statutSticker.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    parametres: parametres.optional(),
  })
  .strict()
  .refine(b => Object.values(b).some(v => v !== undefined), { message: "Rien à modifier" });

// ───────── QR dynamiques ─────────
export const patchQrSchema = z
  .object({
    targetUrl: urlHttp.nullable().optional(), // null = retirer la cible
    actif: z.boolean().optional(),
  })
  .strict()
  .refine(b => b.targetUrl !== undefined || b.actif !== undefined, { message: "Rien à modifier" });

export type CreateCarteInput = z.infer<typeof createCarteSchema>;
export type PatchCarteInput = z.infer<typeof patchCarteSchema>;
export type CreateStickerInput = z.infer<typeof createStickerSchema>;
export type PatchStickerInput = z.infer<typeof patchStickerSchema>;
export type PatchQrInput = z.infer<typeof patchQrSchema>;
export type ListCartesQuery = z.infer<typeof listCartesQuery>;
export type ListStickersQuery = z.infer<typeof listStickersQuery>;