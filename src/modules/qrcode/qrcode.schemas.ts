import { z } from "zod";

// ───────── Listes de valeurs autorisées ─────────
export const FORMATS = ["png", "svg", "jpeg", "webp", "pdf"] as const;
export const STYLES_POINTS = ["square", "rounded", "dots", "diamond"] as const;
export const FORMES_YEUX = ["square", "rounded", "circle"] as const;
export const NIVEAUX_CORRECTION = ["L", "M", "Q", "H"] as const;

const couleur = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, "Couleur attendue au format #RRGGBB");
const couleurOuTransparent = z.union([couleur, z.literal("transparent")]);

// ───────── Style d'un QR code ─────────
// IMPORTANT : aucun `.default()` ici. Tous les champs sont optionnels, car un style peut être
// la SUPERPOSITION d'un style enregistré + de réglages envoyés à la volée. Les valeurs par
// défaut sont appliquées dans `resoudreStyle` (qrcode.render.ts).
// `null` = désactiver l'option (ex. `"logo": null` retire le logo d'un style enregistré).
const gradientSchema = z
  .object({
    type: z.enum(["linear", "radial"]),
    from: couleur,
    to: couleur,
    angle: z.number().int().min(0).max(360).optional(), // dégradé linéaire uniquement
  })
  .strict();

const yeuxSchema = z
  .object({
    frame: z.enum(FORMES_YEUX).optional(), // cadre extérieur des 3 coins
    pupil: z.enum(FORMES_YEUX).optional(), // carré central des 3 coins
    frameColor: couleur.nullable().optional(),
    pupilColor: couleur.nullable().optional(),
  })
  .strict();

// Le logo arrive en base64 (data URL). Il est revalidé et normalisé par sharp côté service.
// Limite ≈ 1 Mo d'image (le base64 pèse ~33 % de plus).
const logoSchema = z
  .object({
    dataUrl: z
      .string()
      .regex(
        /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/,
        "Logo attendu en data URL base64 (png, jpeg, webp ou svg)"
      )
      .max(1_400_000)
      .optional(),
    sizePct: z.number().int().min(5).max(30).optional(), // % de la largeur du QR
    shape: z.enum(["square", "circle"]).optional(),
    backgroundColor: couleurOuTransparent.optional(), // pastille derrière le logo
  })
  .strict();

const labelSchema = z
  .object({
    text: z.string().trim().min(1).max(80), // texte sous le QR (ex. « Scannez-moi »)
    color: couleur.optional(),
    fontSizePx: z.number().int().min(12).max(200).optional(),
  })
  .strict();

export const styleSchema = z
  .object({
    size: z.number().int().min(128).max(4000).optional(), // largeur en pixels
    margin: z.number().int().min(0).max(10).optional(), // zone de silence, en modules
    errorCorrection: z.enum(NIVEAUX_CORRECTION).optional(),
    foreground: couleur.optional(),
    background: couleurOuTransparent.optional(),
    gradient: gradientSchema.nullable().optional(),
    dots: z.enum(STYLES_POINTS).optional(),
    eyes: yeuxSchema.optional(),
    logo: logoSchema.nullable().optional(),
    label: labelSchema.nullable().optional(),
  })
  .strict();

// ───────── Génération (aperçu + téléchargement) ─────────
// POST /qrcodes/apercu  ·  POST /qrcodes/telecharger?format=png
// { "contenu": { "type": "lien", "url": "https://...", "utm": { "source": "flyer" } },
//   // ou : { "type": "wifi", "ssid": "MonReseau", "password": "motdepasse123", "encryption": "WPA" }
//   "styleId": 3,                       ← style enregistré (optionnel)
//   "style": { "dots": "rounded" },     ← réglages qui s'ajoutent / écrasent le style enregistré
//   "nom": "carte-visite" }             ← sert au nom du fichier téléchargé
// Le même style (couleurs, points, yeux, logo, texte) s'applique aux deux types de contenu.
const utmSchema = z
  .object({
    source: z.string().trim().min(1).max(100).optional(),
    medium: z.string().trim().min(1).max(100).optional(),
    campaign: z.string().trim().min(1).max(100).optional(),
    term: z.string().trim().min(1).max(100).optional(),
    content: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const lienSchema = z
  .object({
    type: z.literal("lien"),
    url: z
      .string()
      .trim()
      .url("Lien invalide")
      .max(2000)
      .refine(u => /^https?:\/\//i.test(u), "Seuls les liens http(s) sont acceptés"),
    utm: utmSchema.optional(),
  })
  .strict();

// Wi-Fi : le téléphone propose de se connecter directement au scan.
// encryption : WPA (WPA/WPA2/WPA3), WEP (ancien), nopass (réseau ouvert, pas de mot de passe)
const wifiSchema = z
  .object({
    type: z.literal("wifi"),
    ssid: z.string().min(1).max(32), // nom du réseau
    password: z.string().max(63).optional(),
    encryption: z.enum(["WPA", "WEP", "nopass"]).default("WPA"),
    hidden: z.boolean().optional(), // réseau masqué
  })
  .strict();

export const renderSchema = z
  .object({
    contenu: z.discriminatedUnion("type", [lienSchema, wifiSchema]),
    styleId: z.number().int().positive().optional(),
    style: styleSchema.optional(),
    nom: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.contenu.type !== "wifi") return;
    const { encryption, password } = b.contenu;
    const erreur = (message: string) =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contenu", "password"],
        message,
      });
    if (encryption === "nopass") return;
    if (!password) return erreur("Mot de passe requis pour un réseau protégé");
    if (encryption === "WPA" && (password.length < 8 || password.length > 63))
      erreur("Un mot de passe WPA fait entre 8 et 63 caractères");
    if (encryption === "WEP" && ![5, 10, 13, 26].includes(password.length))
      erreur("Une clé WEP fait 5, 10, 13 ou 26 caractères");
  });

export const telechargerQuery = z.object({
  format: z.enum(FORMATS).default("png"),
});

// ───────── Styles enregistrés (modèles de personnalisation) ─────────
export const styleParams = z.object({
  id: z.coerce.number().int().positive(),
});

// POST /qrcodes/styles
export const createStyleSchema = z
  .object({
    nom: z.string().trim().min(1).max(80),
    style: styleSchema,
  })
  .strict();

// PATCH /qrcodes/styles/:id  ·  `style` REMPLACE tout le style enregistré
export const patchStyleSchema = z
  .object({
    nom: z.string().trim().min(1).max(80).optional(),
    style: styleSchema.optional(),
  })
  .strict()
  .refine(b => b.nom !== undefined || b.style !== undefined, {
    message: "Rien à modifier",
  });

export type Style = z.infer<typeof styleSchema>;
export type RenderInput = z.infer<typeof renderSchema>;
export type TelechargerQuery = z.infer<typeof telechargerQuery>;
export type CreateStyleInput = z.infer<typeof createStyleSchema>;
export type PatchStyleInput = z.infer<typeof patchStyleSchema>;
export type Format = (typeof FORMATS)[number];
