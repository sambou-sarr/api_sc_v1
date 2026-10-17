import { z } from "zod";
import { SECTEURS } from "../fiches/fiches.schemas";

// Équivalent des FormRequest Laravel : uniquement les règles de validation.
// L'API parle en minuscules ("pro", "active"), la base en MAJUSCULES : le service convertit.

export const FORMULES = ["essentielle", "pro", "signature"] as const;

// ───────── Briques réutilisables ─────────
const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug invalide (a-z, 0-9, tirets)")
  .min(3)
  .max(60);

const dateIso = z
  .string()
  .refine(v => !Number.isNaN(Date.parse(v)), "Date invalide");

// Dans une URL (?page=2) tout est du texte : z.coerce convertit "2" en nombre 2.
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

// ───────── Paramètres d'URL ─────────
export const subscriptionParams = z.object({
  id: z.coerce.number().int().positive(),
  subId: z.coerce.number().int().positive(),
});

// ───────── Fiches ─────────

// GET /admin/fiches?search=awa&formule=pro&expiration=bientot&tri=scans&page=2
export const listFichesQuery = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  statut: z.enum(["active", "suspendue"]).optional(),
  formule: z.enum(FORMULES).optional(),
  // expiree = plus d'abonnement valable ; bientot = expire dans les 30 jours
  expiration: z.enum(["expiree", "bientot"]).optional(),
  userId: z.coerce.number().int().positive().optional(), // les fiches d'un client précis
  carteALier: z.enum(["true", "false"]).optional(), // true = a un code de carte pas encore utilisé
  tri: z.enum(["recent", "scans", "nom"]).default("recent"),
  page,
  limit,
});

// POST /admin/fiches : l'admin crée une fiche pour un client
export const createFicheSchema = z.object({
  prenom: z.string().trim().min(1).max(100),
  nom: z.string().trim().max(100).optional(),
  fonction: z.string().trim().max(150).optional(),
  entreprise: z.string().trim().max(150).optional(),
  telephone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  secteur: z.enum(SECTEURS).optional(),
  slug: slug.optional(), // sinon généré à partir du nom

  // Propriétaire : si absent, un code de carte est généré pour que le client rattache sa fiche.
  userId: z.number().int().positive().optional(),

  // Formule de départ et son abonnement
  formule: z.enum(FORMULES).default("essentielle"),
  endsAt: dateIso.nullable().optional(), // absent = durée de la formule ; null = sans échéance
  amountFcfa: z.number().int().min(0).nullable().optional(),
  paymentRef: z.string().max(100).nullable().optional(),
  enLigneSeule: z.boolean().default(false), // badge « Créée gratuitement avec Support Connecté »
});

// PATCH /admin/fiches/:id : ce qu'un client ne peut jamais changer
export const patchFicheSchema = z.object({
  slug: slug.optional(),
  statut: z.enum(["active", "suspendue"]).optional(),
  userId: z.number().int().positive().nullable().optional(), // null = retirer le propriétaire
});

// DELETE /admin/fiches/:id?confirmer=<slug exact> : garde-fou contre la suppression par erreur
export const deleteFicheQuery = z.object({
  confirmer: z.string().min(1),
});

// ───────── Abonnements ─────────

// POST /admin/fiches/:id/subscription : activer une formule après paiement
export const subscriptionSchema = z.object({
  plan: z.enum(FORMULES),
  endsAt: dateIso.nullable().optional(),
  amountFcfa: z.number().int().min(0).nullable().optional(),
  paymentRef: z.string().max(100).nullable().optional(),
});

// ───────── Utilisateurs ─────────

// GET /admin/users?search=sambou&role=client
export const listUsersQuery = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["client", "admin"]).optional(),
  page,
  limit,
});

// Types déduits : le service sait exactement ce qu'il reçoit.
export type ListFichesQuery = z.infer<typeof listFichesQuery>;
export type CreateFicheInput = z.infer<typeof createFicheSchema>;
export type PatchFicheInput = z.infer<typeof patchFicheSchema>;
export type DeleteFicheQuery = z.infer<typeof deleteFicheQuery>;
export type SubscriptionInput = z.infer<typeof subscriptionSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
