import { randomInt } from "crypto";
import { Prisma } from "../../database/prisma/generated/prisma/client";
import type {
  PlanType,
  PrintStatus,
  StickerFonction,
  StickerStatus,
} from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { conflict, forbidden, notFound, unprocessable } from "../../lib/httpError";
import type { AuthUser } from "../../types/user";
import type {
  ClientCarteRequestInput,
  CreateCarteInput,
  CreateStickerInput,
  ListCartesQuery,
  ListStickersQuery,
  PatchCarteInput,
  PatchQrInput,
  PatchStickerInput,
} from "./production.schemas";

// ───────── Adresses encodées dans les supports imprimés ─────────
// Définir PUBLIC_SITE_URL dans .env (ex. https://supportconnecte.com) ; jamais d'adresse technique.
const base = () => (process.env.PUBLIC_SITE_URL ?? "https://supportconnecte.com").replace(/\/$/, "");
export const ficheUrl = (slug: string) => `${base()}/f/${slug}`;
export const shortUrl = (code: string) => `${base()}/q/${code}`;

const lower = (v: string) => v.toLowerCase();
const upper = <T extends string>(v: string) => v.toUpperCase() as T;
const ROBOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|headless/i;

// Transitions de statut d'une carte : avancer d'une étape, revenir d'une étape (correction), annuler.
const TRANSITIONS: Record<PrintStatus, PrintStatus[]> = {
  A_IMPRIMER: ["IMPRIMEE", "ANNULEE"],
  IMPRIMEE: ["ENCODEE", "A_IMPRIMER", "ANNULEE"],
  ENCODEE: ["TESTEE", "IMPRIMEE", "ANNULEE"],
  TESTEE: ["LIVREE", "ENCODEE", "ANNULEE"],
  LIVREE: ["TESTEE"],
  ANNULEE: ["A_IMPRIMER"],
};

// Codes courts lisibles (sans 0/o/1/l/i)
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const nouveauCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

const FONCTION_LABEL: Record<string, string> = {
  AVIS: "Avis Google", WIFI: "Wi-Fi", MENU: "Menu", RESEAUX: "Réseaux sociaux",
  CONTACT: "Contact WhatsApp", RDV: "Rendez-vous", LIEN: "Lien libre",
};

// Cible proposée au départ pour un QR dynamique, déduite des paramètres (null = à régler à la main).
const httpOuNull = (v: unknown) => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);
function cibleInitiale(fonction: string, p: Record<string, string | number | boolean>): string | null {
  if (fonction === "AVIS" || fonction === "RDV" || fonction === "LIEN") return httpOuNull(p.lien);
  if (fonction === "MENU") return httpOuNull(p.source);
  if (fonction === "CONTACT") {
    const tel = String(p.whatsapp ?? "").replace(/\D/g, "");
    if (tel.length < 8) return null;
    const msg = typeof p.message === "string" && p.message ? `?text=${encodeURIComponent(p.message)}` : "";
    return `https://wa.me/${tel}${msg}`;
  }
  return null; // WIFI n'a pas de QR dynamique ; RESEAUX regroupe plusieurs liens : à régler à la main
}

const FICHE_SELECT = {
  id: true, slug: true, prenom: true, nom: true, entreprise: true, telephone: true, email: true, fonction: true,
} as const;

type FicheLight = { id: number; slug: string; prenom: string; nom: string; entreprise: string | null; telephone: string | null; email: string | null; fonction: string | null };
type Instantane = { clientNom: string | null; clientEntreprise: string | null; clientTelephone: string | null; clientEmail: string | null; clientFonction: string | null };

// Les commandes gardent une copie du client au moment de la commande (clientNom…) ; la fiche liée complète si elle existe.
const identite = (s: Instantane, f: FicheLight | null, slug: string | null) => {
  if (!f && !slug && !s.clientNom && !s.clientEntreprise) return null;
  return {
    id: f?.id ?? null,
    slug: slug ?? f?.slug ?? "",
    nom: s.clientNom ?? (f ? `${f.prenom} ${f.nom}`.trim() : ""),
    entreprise: s.clientEntreprise ?? f?.entreprise ?? "",
    telephone: s.clientTelephone ?? f?.telephone ?? null,
    email: s.clientEmail ?? f?.email ?? null,
    fonction: s.clientFonction ?? f?.fonction ?? null,
  };
};
const instantane = (f: FicheLight): Instantane => ({
  clientNom: `${f.prenom} ${f.nom}`.trim(),
  clientEntreprise: f.entreprise,
  clientTelephone: f.telephone,
  clientEmail: f.email,
  clientFonction: f.fonction,
});

// ───────── DTO ─────────
type CarteRow = Instantane & {
  id: number; ficheId: number | null; tier: PlanType | null; formule: string | null; slug: string | null; nfcUrl: string;
  rectoUrl: string | null; versoUrl: string | null;
  design: Prisma.JsonValue; statut: PrintStatus;
  deliveryAddress: string | null; deliveryTelephone: string | null;
  clientNotes: string | null; amountFcfa: number | null;
  printedAt: Date | null; encodedAt: Date | null; testedAt: Date | null; deliveredAt: Date | null;
  notes: string | null; createdAt: Date; fiche: FicheLight | null;
};
const carteDto = (j: CarteRow) => ({
  id: j.id,
  ficheId: j.ficheId,
  tier: j.tier ? lower(j.tier) : (j.formule ?? "essentielle"),
  nfcUrl: j.nfcUrl,
  // vrai si l'adresse de la fiche a changé depuis l'écriture dans la puce : la carte imprimée ne marcherait plus
  adresseChangee: j.fiche ? j.nfcUrl !== ficheUrl(j.fiche.slug) : false,
  rectoUrl: j.rectoUrl,
  versoUrl: j.versoUrl,
  design: j.design,
  statut: lower(j.statut),
  notes: j.notes,
  adresseLivraison: j.deliveryAddress,
  telephoneLivraison: j.deliveryTelephone,
  notesClient: j.clientNotes,
  montantFcfa: j.amountFcfa,
  printedAt: j.printedAt,
  encodedAt: j.encodedAt,
  testedAt: j.testedAt,
  deliveredAt: j.deliveredAt,
  createdAt: j.createdAt,
  fiche: identite(j, j.fiche, j.slug),
});

type QrLite = { code: string; targetUrl: string | null; actif: boolean; scans: number; lastScanAt: Date | null };
type StickerRow = Instantane & {
  id: number; kind: string; fonction: StickerFonction | null; tailleMm: number; forme: string | null; theme: string | null;
  quantite: number; options: Prisma.JsonValue; parametres: Prisma.JsonValue; personnalisation: Prisma.JsonValue;
  qrMode: string; qrCode: string | null; ficheSlug: string | null; statut: StickerStatus; notes: string | null; createdAt: Date;
  fiche: FicheLight | null; qrLinks: QrLite[];
};
const stickerDto = (s: StickerRow) => {
  const q = s.qrLinks[0] ?? null;
  return {
    id: s.id,
    kind: lower(s.kind),
    fonction: s.fonction ? lower(s.fonction) : null,
    tailleMm: s.tailleMm,
    forme: s.forme,
    theme: s.theme,
    quantite: s.quantite,
    options: s.options,
    parametres: s.parametres,
    personnalisation: s.personnalisation,
    qrMode: lower(s.qrMode),
    ficheSlug: s.ficheSlug,
    ficheUrl: s.ficheSlug ? ficheUrl(s.ficheSlug) : null,
    qr: q ? { code: q.code, url: shortUrl(q.code), targetUrl: q.targetUrl, actif: q.actif, scans: q.scans } : null,
    statut: lower(s.statut),
    notes: s.notes,
    createdAt: s.createdAt,
    fiche: identite(s, s.fiche, s.ficheSlug),
  };
};

const STICKER_INCLUDE = {
  fiche: { select: FICHE_SELECT },
  qrLinks: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { code: true, targetUrl: true, actif: true, scans: true, lastScanAt: true },
  },
} as const;

const abonnementValable = (now: Date): Prisma.SubscriptionWhereInput => ({
  status: "ACTIVE",
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

const CARD_PRICES: Record<PlanType, number> = {
  ESSENTIELLE: 10_000,
  PRO: 12_000,
  SIGNATURE: 15_000,
};
const ACTIVE_CARD_STATUSES: PrintStatus[] = [
  "A_IMPRIMER",
  "IMPRIMEE",
  "ENCODEE",
  "TESTEE",
];

const isSerializationConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2034";

export const ProductionService = {
  // ───────── Chiffres de l'en-tête ─────────
  async summary() {
    const [cartesAImprimer, stickersFonction, stickersTelephone, qrSansCible, scans] = await Promise.all([
      prisma.printJob.count({ where: { statut: "A_IMPRIMER" } }),
      prisma.stickerOrder.count({ where: { statut: "A_PARAMETRER", kind: "FONCTION" } }),
      prisma.stickerOrder.count({ where: { statut: "A_PARAMETRER", kind: "TELEPHONE" } }),
      prisma.qrLink.count({ where: { actif: true, targetUrl: null } }),
      prisma.qrLink.aggregate({ _sum: { scans: true } }),
    ]);
    return {
      cartesAImprimer,
      stickersAParametrer: { fonction: stickersFonction, telephone: stickersTelephone },
      qrSansCible,
      scansQr: scans._sum.scans ?? 0,
    };
  },

  // ───────── Cartes ─────────
  async listCartes(q: ListCartesQuery) {
    const jobs = await prisma.printJob.findMany({
      where: q.statut ? { statut: upper<PrintStatus>(q.statut) } : {},
      orderBy: { createdAt: "desc" },
      take: q.limit,
      include: { fiche: { select: FICHE_SELECT } },
    });
    return { cartes: jobs.map(carteDto) };
  },

  async getClientCardRequest(user: AuthUser, ficheId: number) {
    const fiche = await prisma.fiche.findFirst({
      where: { id: ficheId, userId: user.id },
      select: { id: true },
    });
    if (!fiche) throw notFound("Fiche introuvable");

    const job = await prisma.printJob.findFirst({
      where: { ficheId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { fiche: { select: FICHE_SELECT } },
    });
    return { carte: job ? carteDto(job) : null };
  },

  async requestClientCarte(
    user: AuthUser,
    ficheId: number,
    input: ClientCarteRequestInput,
  ) {
    const now = new Date();
    try {
      return await prisma.$transaction(
        async tx => {
          const fiche = await tx.fiche.findFirst({
            where: { id: ficheId, userId: user.id },
            select: {
              ...FICHE_SELECT,
              statut: true,
              subscriptions: {
                where: abonnementValable(now),
                orderBy: { startsAt: "desc" },
                take: 1,
                select: { plan: { select: { type: true } } },
              },
            },
          });
          if (!fiche) throw notFound("Fiche introuvable");
          if (fiche.statut !== "ACTIVE")
            throw forbidden(
              "FICHE_NON_PUBLIEE",
              "Publiez la fiche avant de demander une carte.",
            );

          const plan = fiche.subscriptions[0]?.plan.type;
          if (!plan)
            throw forbidden(
              "ABONNEMENT_INACTIF",
              "Un abonnement actif est nécessaire pour demander une carte.",
            );

          const existing = await tx.printJob.findFirst({
            where: {
              ficheId,
              statut: { in: ACTIVE_CARD_STATUSES },
            },
            select: { id: true },
          });
          if (existing)
            throw conflict(
              "CARTE_DEJA_EN_COURS",
              "Une demande de carte est déjà en cours pour cette fiche.",
            );

          const job = await tx.printJob.create({
            data: {
              ficheId,
              tier: plan,
              formule: lower(plan),
              slug: fiche.slug,
              nfcUrl: ficheUrl(fiche.slug),
              ...instantane(fiche),
              deliveryAddress: input.adresseLivraison,
              deliveryTelephone: input.telephoneLivraison,
              clientNotes: input.notesClient || null,
              amountFcfa: CARD_PRICES[plan],
            },
            include: { fiche: { select: FICHE_SELECT } },
          });
          return { carte: carteDto(job) };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (isSerializationConflict(error))
        throw conflict(
          "CARTE_DEJA_EN_COURS",
          "Une demande de carte est déjà en cours pour cette fiche.",
        );
      throw error;
    }
  },

  async createCarte(input: CreateCarteInput) {
    const now = new Date();
    const fiche = await prisma.fiche.findUnique({
      where: { id: input.ficheId },
      select: { ...FICHE_SELECT, subscriptions: { where: abonnementValable(now), take: 1, select: { plan: { select: { type: true } } } } },
    });
    if (!fiche) throw notFound("Fiche introuvable");

    const enCours = await prisma.printJob.findFirst({
      where: {
        ficheId: fiche.id,
        statut: { notIn: ["ANNULEE", "LIVREE"] },
      },
      select: { id: true },
    });
    if (enCours) throw conflict("409", "Une carte est déjà en production pour cette fiche");

    const tier: PlanType = input.tier ? upper<PlanType>(input.tier) : (fiche.subscriptions[0]?.plan.type ?? "ESSENTIELLE");
    const job = await prisma.printJob.create({
      data: {
        ficheId: fiche.id,
        tier,
        formule: lower(tier),
        slug: fiche.slug,
        nfcUrl: ficheUrl(fiche.slug),
        ...instantane(fiche),
        ...(input.rectoUrl && { rectoUrl: input.rectoUrl }),
        ...(input.versoUrl && { versoUrl: input.versoUrl }),
        ...(input.design && { design: input.design as Prisma.InputJsonValue }),
      },
      include: { fiche: { select: FICHE_SELECT } },
    });
    return { carte: carteDto(job) };
  },

  async updateCarte(id: number, input: PatchCarteInput) {
    const actuel = await prisma.printJob.findUnique({
      where: { id },
      select: {
        statut: true, printedAt: true, encodedAt: true, testedAt: true, deliveredAt: true,
        nfcUrl: true, fiche: { select: { slug: true } },
      },
    });
    if (!actuel) throw notFound("Carte introuvable");

    const statut = input.statut ? upper<PrintStatus>(input.statut) : undefined;
    if (statut && statut !== actuel.statut) {
      if (!TRANSITIONS[actuel.statut].includes(statut))
        throw unprocessable("422", `Passage impossible de « ${lower(actuel.statut)} » à « ${lower(statut)} »`);
      // Une carte dont la puce est périmée ne doit pas partir chez le client.
      if (statut === "LIVREE" && actuel.fiche && actuel.nfcUrl !== ficheUrl(actuel.fiche.slug))
        throw unprocessable("422", "L'adresse de la fiche a changé : ré-encoder la puce avant livraison");
    }

    const now = new Date();
    const job = await prisma.printJob.update({
      where: { id },
      data: {
        ...(statut && { statut }),
        ...(statut === "IMPRIMEE" && !actuel.printedAt && { printedAt: now }),
        ...(statut === "ENCODEE" && !actuel.encodedAt && { encodedAt: now }),
        ...(statut === "TESTEE" && !actuel.testedAt && { testedAt: now }),
        ...(statut === "LIVREE" && !actuel.deliveredAt && { deliveredAt: now }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.rectoUrl !== undefined && { rectoUrl: input.rectoUrl }),
        ...(input.versoUrl !== undefined && { versoUrl: input.versoUrl }),
        ...(input.design && { design: input.design as Prisma.InputJsonValue }),
      },
      include: { fiche: { select: FICHE_SELECT } },
    });
    return { carte: carteDto(job) };
  },

  // ───────── Stickers ─────────
  async listStickers(q: ListStickersQuery) {
    const stickers = await prisma.stickerOrder.findMany({
      where: {
        ...(q.kind && { kind: upper<"FONCTION" | "TELEPHONE">(q.kind) }),
        ...(q.statut && { statut: upper<StickerStatus>(q.statut) }),
      },
      orderBy: { createdAt: "desc" },
      take: q.limit,
      include: STICKER_INCLUDE,
    });
    return { stickers: stickers.map(stickerDto) };
  },

  async createSticker(input: CreateStickerInput) {
    // Sticker téléphone : copie du QR de la fiche (adresse figée à la commande)
    if (input.kind === "telephone") {
      const fiche = await prisma.fiche.findUnique({ where: { id: input.ficheId }, select: FICHE_SELECT });
      if (!fiche) throw notFound("Fiche introuvable");
      const s = await prisma.stickerOrder.create({
        data: {
          ficheId: fiche.id,
          kind: "TELEPHONE",
          tailleMm: 30,
          quantite: input.quantite,
          qrMode: "FICHE",
          ficheSlug: fiche.slug,
          ...instantane(fiche),
          personnalisation: input.personnalisation as Prisma.InputJsonValue,
          notes: input.notes,
        },
        include: STICKER_INCLUDE,
      });
      return { sticker: stickerDto(s) };
    }

    // Sticker à fonction
    const fonction = upper<StickerFonction>(input.fonction);
    if (fonction === "WIFI" && !String(input.parametres.ssid ?? "").trim())
      throw unprocessable("500", "Le nom du réseau Wi-Fi (ssid) est obligatoire");

    let fiche: FicheLight | null = null;
    if (input.ficheId !== undefined) {
      fiche = await prisma.fiche.findUnique({ where: { id: input.ficheId }, select: FICHE_SELECT });
      if (!fiche) throw notFound("Fiche introuvable");
    }
    const dynamique = fonction !== "WIFI";
    const label = [FONCTION_LABEL[fonction], fiche?.entreprise || (fiche ? `${fiche.prenom} ${fiche.nom}`.trim() : "")]
      .filter(Boolean).join(" · ");

    const sticker = await prisma.$transaction(async tx => {
      let code: string | null = null;
      if (dynamique) {
        for (let i = 0; i < 5 && !code; i++) {
          const c = nouveauCode();
          if (!(await tx.qrLink.findUnique({ where: { code: c }, select: { code: true } }))) code = c;
        }
        if (!code) throw conflict("409", "Impossible de générer un code QR unique, réessaie");
      }
      const cree = await tx.stickerOrder.create({
        data: {
          ficheId: fiche?.id,
          kind: "FONCTION",
          fonction,
          tailleMm: input.tailleMm,
          forme: input.forme,
          theme: input.theme,
          quantite: input.quantite,
          options: (input.options ?? {}) as Prisma.InputJsonValue,
          parametres: input.parametres as Prisma.InputJsonValue,
          qrMode: dynamique ? "DYNAMIQUE" : "WIFI",
          qrCode: code,
          ...(fiche && instantane(fiche)),
          notes: input.notes,
        },
        select: { id: true },
      });
      if (code)
        await tx.qrLink.create({
          data: { code, label, targetUrl: cibleInitiale(fonction, input.parametres), stickerId: cree.id },
        });
      return tx.stickerOrder.findUniqueOrThrow({ where: { id: cree.id }, include: STICKER_INCLUDE });
    });
    return { sticker: stickerDto(sticker) };
  },

  async updateSticker(id: number, input: PatchStickerInput) {
    const existe = await prisma.stickerOrder.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw notFound("Sticker introuvable");

    const s = await prisma.stickerOrder.update({
      where: { id },
      data: {
        ...(input.statut && { statut: upper<StickerStatus>(input.statut) }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.parametres && { parametres: input.parametres as Prisma.InputJsonValue }),
      },
      include: STICKER_INCLUDE,
    });
    return { sticker: stickerDto(s) };
  },

  // ───────── QR dynamiques ─────────
  async listQr() {
    const liens = await prisma.qrLink.findMany({
      orderBy: { createdAt: "desc" },
      include: { sticker: { select: { id: true, fonction: true, tailleMm: true } } },
    });
    return {
      qr: liens.map(q => ({
        code: q.code,
        url: shortUrl(q.code),
        label: q.label,
        targetUrl: q.targetUrl,
        actif: q.actif,
        scans: q.scans,
        lastScanAt: q.lastScanAt,
        sticker: q.sticker && { id: q.sticker.id, fonction: q.sticker.fonction ? lower(q.sticker.fonction) : null, tailleMm: q.sticker.tailleMm },
      })),
    };
  },

  async updateQr(code: string, input: PatchQrInput) {
    const existe = await prisma.qrLink.findUnique({ where: { code }, select: { code: true } });
    if (!existe) throw notFound("QR introuvable");
    const q = await prisma.qrLink.update({
      where: { code },
      data: {
        ...(input.targetUrl !== undefined && { targetUrl: input.targetUrl }),
        ...(input.actif !== undefined && { actif: input.actif }),
      },
      select: { code: true, targetUrl: true, actif: true, scans: true, lastScanAt: true },
    });
    return { qr: { ...q, url: shortUrl(q.code) } };
  },

  // ───────── Redirection publique /q/:code ─────────
  // Renvoie l'adresse cible, ou null (inconnu, désactivé, ou cible pas encore réglée).
  async resoudre(code: string, userAgent: string): Promise<string | null> {
    const q = await prisma.qrLink.findUnique({ where: { code }, select: { targetUrl: true, actif: true } });
    if (!q || !q.actif || !q.targetUrl) return null;
    if (!ROBOTS.test(userAgent))
      await prisma.qrLink.update({ where: { code }, data: { scans: { increment: 1 }, lastScanAt: new Date() } });
    return q.targetUrl;
  },
};