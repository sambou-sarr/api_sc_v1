import { z } from 'zod';

// ───────── Briques réutilisables ─────────
// Seules les URL http(s), tel:, mailto:, ancres et chemins relatifs sont acceptées (pas de « javascript: »).
// `/(?!\/)` : un chemin relatif, mais pas « //hote » (URL relative au protocole = redirection vers un autre site).
const SAFE_URL = /^(https?:\/\/|tel:|mailto:|#|\/(?!\/))/i;
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === '' || SAFE_URL.test(v), 'URL invalide (http, https, tel, mailto ou chemin relatif)');
const urlRequired = url.refine((v) => v.length > 0, 'URL requise');
const text = (max: number) => z.string().trim().max(max);
const blankToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);
const prix = z.preprocess(blankToUndef, z.coerce.number().int().min(0).max(2_000_000_000).optional());
const smallInt = z.preprocess(blankToUndef, z.coerce.number().int().min(0).max(100_000).optional());

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;

// L'API parle en minuscules (comme le front) ; la base en MAJUSCULES (enums Prisma).
export const SECTEURS = ['restaurant', 'immobilier', 'commerce', 'hotel', 'independant', 'beaute'] as const;
export const TAB_TYPES = [
  'presentation', 'menu', 'biens', 'catalogue', 'galerie', 'videos', 'liens',
  'rendezvous', 'rappel', 'horaires', 'avis', 'reseaux', 'localisation', 'texte',
] as const;

// ───────── Contenu (data) ─────────
const reseau = z.object({ label: text(60).min(1), url });
const lien = z.object({ label: text(80).min(1), url });
const horaire = z.object({ jour: z.enum(JOURS), horaire: text(60) });
const media = z.object({ type: z.enum(['image', 'video']).default('image'), url: urlRequired, alt: text(200).optional() });

const article = z.object({
  nom: text(120).min(1),
  description: text(500).optional(),
  photo: url.optional(),
  prix,
  badge: text(30).optional(),
});
const sectionCatalogue = z.object({ titre: text(100).min(1), articles: z.array(article).max(50) });

const plat = z.object({
  nom: text(120).min(1),
  prix,
  description: text(500).optional(),
  image: url.optional(),
  video: url.optional(),
  videoWebm: url.optional(),
  badge: text(30).optional(),
});
const menu = z.object({ sections: z.array(z.object({ titre: text(100).min(1), plats: z.array(plat).max(50) })).max(20) });

const bien = z.object({
  titre: text(150).min(1),
  type: z.enum(['vente', 'location']),
  prix,
  periode: text(20).optional(),
  ville: text(100).optional(),
  surface: smallInt,
  terrain: smallInt,
  chambres: smallInt,
  sdb: smallInt,
  atouts: z.array(text(60)).max(20).default([]),
  description: text(1000).optional(),
  photos: z.array(urlRequired).max(20).default([]),
});

const onglet = z.object({
  type: z.enum(TAB_TYPES),
  titre: text(60).optional(),
  contenu: text(5000).optional(), // uniquement pour « texte »
  visible: z.boolean().default(true),
});

const entete = z.object({
  disposition: z.enum(['portrait', 'logo', 'banniere', 'duo']).optional(),
  taille: z.enum(['s', 'm', 'l']).optional(),
  theme: z.enum(['or', 'clair', 'bleu', 'nuit']).optional(),
  couverture: url.optional(),
});

const dataSchema = z
  .object({
    secteur: z.enum(SECTEURS),
    premierBouton: z.enum(['whatsapp', 'appel', 'email']),
    messageWhatsapp: text(500),
    presentation: text(5000), // la limite réelle dépend de la formule (voir fiches.limits.ts)
    reseauxSociaux: z.array(reseau).max(20),
    liens: z.array(lien).max(50),
    horaires: z.array(horaire).max(7),
    galerie: z.array(media).max(50),
    sections: z.array(sectionCatalogue).max(20),
    menu,
    biens: z.array(bien).max(100),
    rendezVous: z.object({ label: text(80), url }),
    onglets: z.array(onglet).max(40),
    entete,
  })
  .partial();

// ───────── Mise à jour par le client ─────────
// Les champs réservés (id, slug, formule, statut, dateEcheance, scansTotal, userId…) ne figurent pas ici :
// zod les retire silencieusement, ils ne peuvent donc jamais être écrits par un client.
export const updateFicheSchema = z
  .object({
    prenom: text(100).min(1),
    nom: text(100),
    fonction: text(150),
    entreprise: text(150),
    photo: url,
    logo: url,
    telephone: text(30),
    whatsapp: text(30),
    email: text(254).refine((v) => v === '' || z.string().email().safeParse(v).success, 'E-mail invalide'),
    site: url,
    adresse: text(250),
    googlePlaceId: text(200),
    data: dataSchema,
    // Version vue par le client au chargement (champ `updatedAt` de la fiche). Facultatif : absent = pas de contrôle.
    baseUpdatedAt: z.string().datetime(),
  })
  .partial();

export type UpdateFicheInput = z.infer<typeof updateFicheSchema>;

export const createFicheSchema = z.object({
  prenom: text(100).min(1),
  nom: text(100).optional(),
  fonction: text(150).optional(),
  entreprise: text(150).optional(),
  telephone: text(30).optional(),
  whatsapp: text(30).optional(),
  secteur: z.enum(SECTEURS).optional(),
});
export type CreateFicheInput = z.infer<typeof createFicheSchema>;

export const recordPassageSchema = z.object({
  source: z.enum(["qr", "nfc", "direct"]),
  idempotencyKey: z.string().min(16).max(64).regex(/^[a-zA-Z0-9_-]+$/),
});

export const passageStatsQuerySchema = z.object({
  granularity: z.enum(["day", "month"]).default("month"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
}).refine(value => !(value.date && value.month), {
  message: "Choisissez une date ou un mois, pas les deux.",
});

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const slugParam = z.object({ slug: z.string().min(1).max(80) });


export const createRappelSchema = z.object({
  nom: text(100).min(2, "Le nom doit contenir au moins 2 caractères."),
  telephone: text(30).min(7).max(25),
});


export const rappelListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
