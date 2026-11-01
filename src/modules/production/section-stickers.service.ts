import type { SectionStickerStatus } from "../../database/prisma/generated/prisma/client";
import { Prisma } from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { conflict, notFound, unprocessable } from "../../lib/httpError";
import type { AuthUser } from "../../types/user";
import type {
  CreateSectionStickerInput,
  ListSectionStickersQuery,
  PatchSectionStickerInput,
} from "./section-stickers.schemas";

/*
  Stickers « par section » : le client DEMANDE un devis (nombre de stickers) pour une section de sa fiche ; l'administration
  traite la demande et ACTIVE la section. Seule une section ACTIVE est servie publiquement (/s/:slug/:section) : la fiche
  publique expose `stickerSections` (cf. fiches.dto). Une seule demande « ouverte » (DEMANDE ou ACTIVE) par fiche et par
  section (index unique partiel en base) ; refusée ou désactivée, elle peut être refaite.
*/
const lower = (s: SectionStickerStatus) =>
  s.toLowerCase() as "demande" | "active" | "desactivee" | "refusee";
const upper = (s: string) => s.toUpperCase() as SectionStickerStatus;

/** Une demande est « ouverte » tant qu'elle occupe l'emplacement (fiche, section). */
const OPEN: SectionStickerStatus[] = ["DEMANDE", "ACTIVE"];

type Row = Prisma.SectionStickerRequestGetPayload<object>;

const clientDto = (r: Row) => ({
  id: r.id,
  section: r.section,
  quantite: r.quantite,
  message: r.message,
  statut: lower(r.statut),
  createdAt: r.createdAt,
  activatedAt: r.activatedAt,
});

const ADMIN_INCLUDE = {
  fiche: {
    select: { id: true, slug: true, prenom: true, nom: true, entreprise: true },
  },
  user: { select: { id: true, nom: true, email: true } },
} as const;
type AdminRow = Prisma.SectionStickerRequestGetPayload<{
  include: typeof ADMIN_INCLUDE;
}>;

const adminDto = (r: AdminRow) => ({
  ...clientDto(r),
  updatedAt: r.updatedAt,
  fiche: r.fiche,
  client: r.user,
});

/** Transitions autorisées pour l'administration (statut actuel → statuts possibles). */
const TRANSITIONS: Record<SectionStickerStatus, SectionStickerStatus[]> = {
  DEMANDE: ["ACTIVE", "REFUSEE"],
  ACTIVE: ["DESACTIVEE"],
  DESACTIVEE: ["ACTIVE"],
  REFUSEE: [],
};

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Abonnement en cours (même règle que la demande de carte). */
const abonnementValable = (now: Date): Prisma.SubscriptionWhereInput => ({
  status: "ACTIVE",
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

export const SectionStickerService = {
  /** Demandes de stickers d'une fiche, vue client (le propriétaire, ou un administrateur). */
  async listForFiche(user: AuthUser, ficheId: number) {
    const fiche = await prisma.fiche.findFirst({
      where:
        user.role === "ADMIN"
          ? { id: ficheId }
          : { id: ficheId, userId: user.id },
      select: { id: true },
    });
    if (!fiche) throw notFound("Fiche introuvable");
    const rows = await prisma.sectionStickerRequest.findMany({
      where: { ficheId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return { demandes: rows.map(clientDto) };
  },

  /** Le client demande un devis pour N stickers ouvrant une section de sa fiche. */
  async create(
    user: AuthUser,
    ficheId: number,
    input: CreateSectionStickerInput
  ) {
    const fiche = await prisma.fiche.findFirst({
      where: { id: ficheId, userId: user.id },
      select: {
        id: true,
        statut: true,
        subscriptions: {
          where: abonnementValable(new Date()),
          orderBy: { startsAt: "desc" },
          take: 1,
          select: { plan: { select: { type: true } } },
        },
      },
    });
    if (!fiche) throw notFound("Fiche introuvable");
    if (fiche.statut !== "ACTIVE") {
      throw unprocessable(
        "FICHE_NON_PUBLIEE",
        "Publiez la fiche avant de demander des stickers."
      );
    }
    const plan = fiche.subscriptions[0]?.plan.type;
    if (plan !== "PRO" && plan !== "SIGNATURE") {
      throw unprocessable(
        "FORMULE_INSUFFISANTE",
        "Les stickers par section sont réservés aux formules Pro et Signature avec un abonnement en cours."
      );
    }
    const existante = await prisma.sectionStickerRequest.findFirst({
      where: { ficheId, section: input.section, statut: { in: OPEN } },
      select: { statut: true },
    });
    if (existante) {
      throw conflict(
        "DEMANDE_DEJA_EN_COURS",
        existante.statut === "ACTIVE"
          ? "Cette section est déjà activée."
          : "Une demande est déjà en cours pour cette section."
      );
    }
    try {
      const demande = await prisma.sectionStickerRequest.create({
        data: {
          ficheId,
          userId: user.id,
          section: input.section,
          quantite: input.quantite,
          message: input.message || null,
        },
      });
      return { demande: clientDto(demande) };
    } catch (e) {
      // deux envois simultanés : l'index unique partiel refuse le second
      if (isUniqueViolation(e))
        throw conflict(
          "DEMANDE_DEJA_EN_COURS",
          "Une demande est déjà en cours pour cette section."
        );
      throw e;
    }
  },

  /** Toutes les demandes (administration), les plus récentes d'abord. */
  async adminList(query: ListSectionStickersQuery) {
    const rows = await prisma.sectionStickerRequest.findMany({
      where: {
        ...(query.statut && { statut: upper(query.statut) }),
        ...(query.ficheId && { ficheId: query.ficheId }),
      },
      include: ADMIN_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit,
    });
    return { demandes: rows.map(adminDto) };
  },

  /** L'administration active, désactive ou refuse une demande. */
  async adminSetStatus(id: number, input: PatchSectionStickerInput) {
    const next = upper(input.statut);
    const current = await prisma.sectionStickerRequest.findUnique({
      where: { id },
      select: { statut: true },
    });
    if (!current) throw notFound("Demande introuvable");
    if (!TRANSITIONS[current.statut].includes(next)) {
      throw conflict(
        "TRANSITION_INVALIDE",
        `Une demande « ${lower(current.statut)} » ne peut pas passer à « ${lower(next)} ».`
      );
    }
    try {
      const updated = await prisma.sectionStickerRequest.update({
        where: { id },
        data: {
          statut: next,
          ...(next === "ACTIVE" && { activatedAt: new Date() }),
        },
        include: ADMIN_INCLUDE,
      });
      return { demande: adminDto(updated) };
    } catch (e) {
      // réactiver une demande désactivée alors qu'une nouvelle est ouverte sur la même section
      if (isUniqueViolation(e)) {
        throw conflict(
          "DEMANDE_DEJA_EN_COURS",
          "Une autre demande est déjà ouverte pour cette section de la fiche."
        );
      }
      throw e;
    }
  },
};
