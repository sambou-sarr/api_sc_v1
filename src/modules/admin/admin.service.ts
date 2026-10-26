import type {
  PlanType,
  Prisma,
  Role,
  StatutFiche,
} from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { conflict, notFound, unprocessable } from "../../lib/httpError";
import { ficheInclude, toFicheDto } from "../fiches/fiches.dto";
import {
  activateSubscription,
  getEffectiveSubscription,
} from "../subscriptions/subscriptions.service";
import type {
  ListFichesQuery,
  ListUsersQuery,
  PatchFicheInput,
  SubscriptionInput,
} from "./admin.schemas";

// ═══════════════════════ Petits outils ═══════════════════════

const lower = (v: string) => v.toLowerCase();
// "pro" (front) -> "PRO" (base)
const upper = <T extends string>(v: string) => v.toUpperCase() as T;
const JOUR_MS = 24 * 60 * 60 * 1000;

const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

// « Abonnement valable » = ACTIVE et pas encore arrivé à échéance.
// Équivalent d'un scope Eloquent : on l'écrit une fois, on le réutilise partout.
const abonnementValable = (now: Date): Prisma.SubscriptionWhereInput => ({
  status: "ACTIVE",
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

// Conditions sur les fiches, réutilisées par la liste ET par les statistiques.
// subscriptions: { some: ... } = whereHas('subscriptions', ...) en Laravel
const aLaFormule = (now: Date, type: PlanType): Prisma.FicheWhereInput => ({
  subscriptions: { some: { ...abonnementValable(now), plan: { type } } },
});
// NOT some = whereDoesntHave(...)
const estExpiree = (now: Date): Prisma.FicheWhereInput => ({
  NOT: { subscriptions: { some: abonnementValable(now) } },
});
const expireBientot = (now: Date): Prisma.FicheWhereInput => ({
  subscriptions: {
    some: {
      status: "ACTIVE",
      endsAt: { gt: now, lte: new Date(now.getTime() + 30 * JOUR_MS) },
    },
  },
});

// ───────── Vérifications ─────────

// Équivalent de Fiche::findOrFail($id)
async function assertFicheExists(id: number) {
  const fiche = await prisma.fiche.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!fiche) throw notFound("Fiche introuvable");
}

// ═══════════════════════ Le service ═══════════════════════

export const AdminService = {
  // ───────── Tableau de bord ─────────
  stats: async () => {
    const now = new Date();
    const il_y_a_30_jours = new Date(now.getTime() - 30 * JOUR_MS);

    // Toutes les requêtes partent en même temps (Promise.all) au lieu de s'attendre une par une.
    const [
      total,
      suspendues,
      expirees,
      bientot,
      sansProprietaire,
      nouvelles,
      essentielle,
      pro,
      signature,
      scans,
      clients,
    ] = await Promise.all([
      prisma.fiche.count(),
      prisma.fiche.count({ where: { statut: "SUSPENDUE" } }),
      prisma.fiche.count({ where: estExpiree(now) }),
      prisma.fiche.count({ where: expireBientot(now) }),
      prisma.fiche.count({ where: { userId: null } }),
      prisma.fiche.count({ where: { createdAt: { gte: il_y_a_30_jours } } }),
      prisma.fiche.count({ where: aLaFormule(now, "ESSENTIELLE") }),
      prisma.fiche.count({ where: aLaFormule(now, "PRO") }),
      prisma.fiche.count({ where: aLaFormule(now, "SIGNATURE") }),
      prisma.fiche.aggregate({ _sum: { scansTotal: true } }),
      prisma.user.count({ where: { role: "CLIENT" } }),
    ]);

    return {
      fiches: {
        total,
        suspendues,
        expirees,
        expirentBientot: bientot, // dans les 30 jours
        sansProprietaire,
        nouvellesSur30Jours: nouvelles,
      },
      formules: { essentielle, pro, signature }, // abonnements valables uniquement
      scansTotal: scans._sum.scansTotal ?? 0,
      clients,
    };
  },

  // ───────── Liste paginée des fiches (légère : sans catalogue, menu, biens...) ─────────
  listFiches: async (q: ListFichesQuery) => {
    const now = new Date();

    // On empile les conditions puis on les combine avec AND
    // (comme enchaîner des ->where() sur une requête Eloquent).
    const conditions: Prisma.FicheWhereInput[] = [];

    if (q.search) {
      const contient = { contains: q.search, mode: "insensitive" as const };
      conditions.push({
        OR: [
          { slug: contient },
          { prenom: contient },
          { nom: contient },
          { entreprise: contient },
          { telephone: contient },
          { email: contient },
          { user: { email: contient } },
        ],
      });
    }
    if (q.statut) conditions.push({ statut: upper<StatutFiche>(q.statut) });
    if (q.formule) conditions.push(aLaFormule(now, upper<PlanType>(q.formule)));
    if (q.expiration === "expiree") conditions.push(estExpiree(now));
    if (q.expiration === "bientot") conditions.push(expireBientot(now));
    if (q.userId) conditions.push({ userId: q.userId });

    const where: Prisma.FicheWhereInput = conditions.length
      ? { AND: conditions }
      : {};

    const triPrincipal: Prisma.FicheOrderByWithRelationInput =
      q.tri === "scans"
        ? { scansTotal: "desc" }
        : q.tri === "nom"
          ? { prenom: "asc" }
          : { createdAt: "desc" };

    // Deux requêtes dans une même transaction : les lignes de la page + le total.
    const [fiches, total] = await prisma.$transaction([
      prisma.fiche.findMany({
        where,
        select: {
          id: true,
          slug: true,
          prenom: true,
          nom: true,
          entreprise: true,
          statut: true,
          scansTotal: true,
          createdAt: true,
          user: { select: { id: true, email: true, nom: true } },
          subscriptions: {
            where: abonnementValable(now),
            orderBy: { startsAt: "desc" },
            take: 1,
            select: { endsAt: true, plan: { select: { type: true } } },
          },
        },
        // le 2e tri (id) garde l'ordre stable d'une page à l'autre
        orderBy: [triPrincipal, { id: "desc" }],
        skip: (q.page - 1) * q.limit, // OFFSET
        take: q.limit, // LIMIT
      }),
      prisma.fiche.count({ where }),
    ]);

    return {
      fiches: fiches.map(f => {
        const abo = f.subscriptions[0] ?? null;
        return {
          id: f.id,
          slug: f.slug,
          nom: `${f.prenom} ${f.nom}`.trim(),
          entreprise: f.entreprise ?? "",
          statut: lower(f.statut),
          // même repli que toFicheDto : sans abonnement valable => « essentielle » + expirée
          formule: abo ? lower(abo.plan.type) : "essentielle",
          expiree: abo === null,
          dateEcheance: abo?.endsAt
            ? abo.endsAt.toISOString().slice(0, 10)
            : null,
          scansTotal: f.scansTotal,
          createdAt: f.createdAt,
          proprietaire: f.user,
        };
      }),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      },
    };
  },

  // ───────── Détail d'une fiche ─────────
  getFiche: async (id: number) => {
    const fiche = await prisma.fiche.findUnique({
      where: { id },
      include: {
        ...ficheInclude, // tout le contenu
      },
    });
    if (!fiche) throw notFound("Fiche introuvable");

    const [effective, abonnements] = await Promise.all([
      getEffectiveSubscription(id),
      prisma.subscription.findMany({
        where: { ficheId: id },
        orderBy: { createdAt: "desc" },
        include: { plan: { select: { type: true, nom: true } } },
      }),
    ]);

    return {
      fiche: {
        ...toFicheDto(fiche, effective),
        compteClientCree: fiche.userId !== null,
      },
      abonnements: abonnements.map(a => ({
        id: a.id,
        formule: lower(a.plan.type),
        statut: lower(a.status),
        debut: a.startsAt,
        fin: a.endsAt,
        montantFcfa: a.amountFcfa,
        referencePaiement: a.paymentRef,
        annuleLe: a.canceledAt,
      })),
    };
  },

  // ───────── Modifier le slug avant création du compte client / statut ─────────
  updateFiche: async (id: number, input: PatchFicheInput) => {
    await assertFicheExists(id);

    if (input.slug !== undefined) {
      const current = await prisma.fiche.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (!current) throw notFound("Fiche introuvable");
      if (current.userId !== null)
        throw conflict(
          "SLUG_IMMUABLE",
          "L'adresse d'une fiche associée à un compte client ne peut plus être modifiée"
        );

      const pris = await prisma.fiche.findFirst({
        where: { slug: input.slug, NOT: { id } },
        select: { id: true },
      });
      if (pris)
        throw conflict("SLUG_PRIS", "Ce slug est déjà utilisé par une autre fiche");

      const updated = await prisma.fiche.updateMany({
        where: { id, userId: null },
        data: {
          slug: input.slug,
          statut: input.statut ? upper<StatutFiche>(input.statut) : undefined,
        },
      });
      if (updated.count !== 1) {
        const latest = await prisma.fiche.findUnique({
          where: { id },
          select: { userId: true },
        });
        if (!latest) throw notFound("Fiche introuvable");
        throw conflict(
          "SLUG_IMMUABLE",
          "L'adresse d'une fiche associée à un compte client ne peut plus être modifiée"
        );
      }

      const fiche = await prisma.fiche.findUnique({
        where: { id },
        include: ficheInclude,
      });
      if (!fiche) throw notFound("Fiche introuvable");
      return toFicheDto(fiche, await getEffectiveSubscription(id));
    }

    const fiche = await prisma.fiche.update({
      where: { id },
      data: {
        statut: input.statut ? upper<StatutFiche>(input.statut) : undefined,
      },
      include: ficheInclude,
    });

    return toFicheDto(fiche, await getEffectiveSubscription(id));
  },

  // ───────── Supprimer une fiche (définitif) ─────────
  // Contenus, médias et abonnements partent avec elle (onDelete: Cascade dans le schéma).
  deleteFiche: async (id: number, confirmer: string) => {
    const fiche = await prisma.fiche.findUnique({
      where: { id },
      select: { slug: true },
    });
    if (!fiche) throw notFound("Fiche introuvable");
    if (confirmer !== fiche.slug)
      throw unprocessable(
        "CONFIRMATION_INVALIDE",
        "Pour supprimer, renvoie le slug exact de la fiche dans ?confirmer="
      );

    await prisma.fiche.delete({ where: { id } });
  },

  // ───────── Abonnements ─────────

  // Activer une formule (après un paiement validé). L'ancien abonnement actif est annulé.
  activateSubscription: async (id: number, input: SubscriptionInput) => {
    await assertFicheExists(id);

    return activateSubscription({
      ficheId: id,
      planType: upper<PlanType>(input.plan),
      // undefined = durée de la formule, null = sans échéance, sinon la date envoyée
      endsAt:
        input.endsAt === undefined
          ? undefined
          : input.endsAt === null
            ? null
            : new Date(input.endsAt),
      amountFcfa: input.amountFcfa,
      paymentRef: input.paymentRef,
    });
  },

  // Annuler un abonnement. La fiche apparaîtra « expirée » tant qu'on n'en active pas un autre.
  cancelSubscription: async (ficheId: number, subId: number) => {
    const sub = await prisma.subscription.findFirst({
      where: { id: subId, ficheId }, // l'abonnement doit appartenir à CETTE fiche
    });
    if (!sub) throw notFound("Abonnement introuvable pour cette fiche");
    if (sub.status !== "ACTIVE" && sub.status !== "PENDING")
      throw conflict(
        "ABONNEMENT_TERMINE",
        "Cet abonnement est déjà terminé ou annulé"
      );

    return prisma.subscription.update({
      where: { id: subId },
      data: { status: "CANCELED", canceledAt: new Date() },
    });
  },

  // ───────── Utilisateurs (pour choisir un propriétaire) ─────────
  listUsers: async (q: ListUsersQuery) => {
    const where: Prisma.UserWhereInput = {};
    if (q.search) {
      const contient = { contains: q.search, mode: "insensitive" as const };
      where.OR = [{ email: contient }, { nom: contient }];
    }
    if (q.role) where.role = upper<Role>(q.role);

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        // select = on choisit les colonnes : passwordHash n'en fait pas partie
        select: {
          id: true,
          email: true,
          nom: true,
          role: true,
          emailVerifiedAt: true,
          createdAt: true,
          _count: { select: { fiches: true } }, // withCount('fiches')
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        nom: u.nom,
        role: lower(u.role),
        emailVerifie: u.emailVerifiedAt !== null,
        createdAt: u.createdAt,
        nbFiches: u._count.fiches,
      })),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      },
    };
  },
};
