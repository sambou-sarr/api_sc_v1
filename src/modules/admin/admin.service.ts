import type {
  PlanType,
  PaymentStatus,
  Prisma,
  Role,
  StatutFiche,
  SubscriptionStatus,
} from "../../database/prisma/generated/prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../../database/prisma/prisma-client";
import { conflict, notFound, unprocessable } from "../../lib/httpError";
import { hashPassword } from "../../lib/password";
import { sendAdminInvitationEmail } from "../../lib/mailer";
import { ficheInclude, toFicheDto } from "../fiches/fiches.dto";
import {
  activateSubscription,
  getEffectiveSubscription,
} from "../subscriptions/subscriptions.service";
import type {
  ListFichesQuery,
  ListPaymentsQuery,
  ListSubscriptionsQuery,
  ListAdminActionLogsQuery,
  ListUsersQuery,
  PatchFicheInput,
  SubscriptionInput,
  CreateAdminInput,
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

const dateRange = (from?: string, to?: string) => {
  const createdAt: Prisma.DateTimeFilter = {};
  if (from) createdAt.gte = new Date(from);
  if (to) {
    const until = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) until.setUTCDate(until.getUTCDate() + 1);
    createdAt.lt = until;
  }
  return Object.keys(createdAt).length ? createdAt : undefined;
};

const ficheSearch = (search: string): Prisma.FicheWhereInput => {
  const contains = { contains: search, mode: "insensitive" as const };
  return {
    OR: [
      { slug: contains },
      { prenom: contains },
      { nom: contains },
      { entreprise: contains },
      { user: { email: contains } },
    ],
  };
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
      demandesSticker,
      demandesCarte,
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
      prisma.sectionStickerRequest.count({ where: { statut: "DEMANDE" } }),
      prisma.printJob.count({
        where: { statut: { in: ["A_IMPRIMER", "IMPRIMEE", "ENCODEE", "TESTEE"] } },
      }),
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
      demandesSticker: demandesSticker,
      demandesCarte,
    };
  },

  listSubscriptions: async (q: ListSubscriptionsQuery) => {
    const contains = q.search
      ? { contains: q.search, mode: "insensitive" as const }
      : undefined;
    const where: Prisma.SubscriptionWhereInput = {
      id: q.subscriptionId,
      ficheId:
        q.ficheSupprimee === "oui"
          ? null
          : q.ficheSupprimee === "non"
            ? { not: null }
            : undefined,
      status: q.statut ? upper<SubscriptionStatus>(q.statut) : undefined,
      plan: q.formule ? { type: upper<PlanType>(q.formule) } : undefined,
      createdAt: dateRange(q.from, q.to),
      ...(q.search
        ? {
            OR: [
              { paymentRef: contains },
              { ficheNomSnapshot: contains },
              { ficheSlugSnapshot: contains },
              { fiche: ficheSearch(q.search) },
            ],
          }
        : {}),
    };
    const [subscriptions, total] = await prisma.$transaction([
      prisma.subscription.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          plan: { select: { type: true, nom: true } },
          fiche: {
            select: {
              id: true,
              slug: true,
              prenom: true,
              nom: true,
              entreprise: true,
              user: { select: { email: true } },
            },
          },
          payments: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { id: true },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    return {
      items: subscriptions.map(subscription => ({
        id: subscription.id,
        formule: lower(subscription.plan.type),
        statut: lower(subscription.status),
        debut: subscription.startsAt,
        fin: subscription.endsAt,
        montantFcfa: subscription.amountFcfa,
        referencePaiement: subscription.paymentRef,
        createdAt: subscription.createdAt,
        fiche: subscription.fiche
          ? {
              id: subscription.fiche.id,
              slug: subscription.fiche.slug,
              nom: `${subscription.fiche.prenom} ${subscription.fiche.nom}`.trim(),
              entreprise: subscription.fiche.entreprise ?? "",
              email: subscription.fiche.user?.email ?? null,
            }
          : {
              id: null,
              slug: subscription.ficheSlugSnapshot ?? "",
              nom: subscription.ficheNomSnapshot ?? "Fiche supprimée",
              entreprise: "",
              email: null,
            },
        paiementId: subscription.payments[0]?.id ?? null,
      })),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      },
    };
  },

  listPayments: async (q: ListPaymentsQuery) => {
    const contains = q.search
      ? { contains: q.search, mode: "insensitive" as const }
      : undefined;
    const where: Prisma.PaymentWhereInput = {
      id: q.paymentId,
      ficheId:
        q.ficheSupprimee === "oui"
          ? null
          : q.ficheSupprimee === "non"
            ? { not: null }
            : undefined,
      status: q.statut ? upper<PaymentStatus>(q.statut) : undefined,
      plan: q.formule ? { type: upper<PlanType>(q.formule) } : undefined,
      createdAt: dateRange(q.from, q.to),
      ...(q.search
        ? {
            OR: [
              { providerReference: contains },
              { ficheNomSnapshot: contains },
              { ficheSlugSnapshot: contains },
              { fiche: ficheSearch(q.search) },
            ],
          }
        : {}),
    };
    const [payments, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          plan: { select: { type: true, nom: true } },
          fiche: {
            select: {
              id: true,
              slug: true,
              prenom: true,
              nom: true,
              entreprise: true,
              user: { select: { email: true } },
            },
          },
          subscription: { select: { id: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      items: payments.map(payment => ({
        id: payment.id,
        formule: lower(payment.plan.type),
        statut: lower(payment.status),
        fournisseur: lower(payment.provider),
        montantFcfa: payment.amountFcfa,
        devise: payment.currency,
        reference: payment.providerReference,
        motifEchec: payment.failureReason,
        createdAt: payment.createdAt,
        payeLe: payment.paidAt,
        fiche: payment.fiche
          ? {
              id: payment.fiche.id,
              slug: payment.fiche.slug,
              nom: `${payment.fiche.prenom} ${payment.fiche.nom}`.trim(),
              entreprise: payment.fiche.entreprise ?? "",
              email: payment.fiche.user?.email ?? null,
            }
          : {
              id: null,
              slug: payment.ficheSlugSnapshot ?? "",
              nom: payment.ficheNomSnapshot ?? "Fiche supprimée",
              entreprise: "",
              email: null,
            },
        abonnementId: payment.subscription?.id ?? null,
      })),
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      },
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
    if (q.sticker === "demande") {
      conditions.push({ sectionStickers: { some: { statut: "DEMANDE" } } });
    }

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
          sectionStickers: {
            where: { statut: "DEMANDE" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true, section: true, quantite: true, createdAt: true },
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
          demandesSticker: f.sectionStickers,
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
        throw conflict(
          "SLUG_PRIS",
          "Ce slug est déjà utilisé par une autre fiche"
        );

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
  // Les snapshots gardent l'identité dans l'historique financier après ON DELETE SET NULL.
  deleteFiche: async (id: number, confirmer: string) => {
    await prisma.$transaction(async tx => {
      const fiche = await tx.fiche.findUnique({
        where: { id },
        select: { id: true, prenom: true, nom: true, slug: true },
      });
      if (!fiche) throw notFound("Fiche introuvable");
      if (confirmer !== fiche.slug)
        throw unprocessable(
          "CONFIRMATION_INVALIDE",
          "Pour supprimer, renvoie le slug exact de la fiche dans ?confirmer="
        );

      const ficheNom =
        [fiche.prenom, fiche.nom].filter(Boolean).join(" ").trim() ||
        fiche.slug;

      await tx.subscription.updateMany({
        where: { ficheId: fiche.id },
        data: { ficheNomSnapshot: ficheNom, ficheSlugSnapshot: fiche.slug },
      });
      await tx.payment.updateMany({
        where: { ficheId: fiche.id },
        data: { ficheNomSnapshot: ficheNom, ficheSlugSnapshot: fiche.slug },
      });
      await tx.fiche.delete({ where: { id: fiche.id } });
    });
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
          active: true,
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
        active: u.active,
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

  listActionLogs: async (q: ListAdminActionLogsQuery) => {
    const [items, total] = await prisma.$transaction([
      prisma.adminActionLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          adminName: true,
          adminEmail: true,
          method: true,
          path: true,
          statusCode: true,
          createdAt: true,
        },
      }),
      prisma.adminActionLog.count(),
    ]);

    return {
      items,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      },
    };
  },

  createAdmin: async (input: CreateAdminInput) => {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing && existing.role !== "ADMIN") {
      throw conflict(
        "EMAIL_DEJA_UTILISE",
        "Un compte client utilise déjà cette adresse e-mail."
      );
    }
    if (existing && !existing.active) {
      throw unprocessable(
        "ADMIN_DESACTIVE",
        "Réactivez cet administrateur avant de renvoyer son invitation."
      );
    }
    if (existing?.emailVerifiedAt) {
      throw conflict(
        "ADMIN_DEJA_ACTIVE",
        "Cet administrateur a déjà activé son compte."
      );
    }

    const user =
      existing ??
      (await prisma.user.create({
        data: {
          email: input.email,
          nom: input.nom,
          role: "ADMIN",
          passwordHash: await hashPassword(randomBytes(48).toString("hex")),
        },
      }));

    await prisma.authToken.updateMany({
      where: { userId: user.id, type: "reset_password", usedAt: null },
      data: { usedAt: new Date() },
    });
    await sendAdminInvitationEmail(user);
    return {
      created: !existing,
      message: "Invitation administrateur envoyée.",
    };
  },

  resendAdminInvitation: async (userId: number) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== "ADMIN") throw notFound("Administrateur introuvable");
    if (!user.active) {
      throw unprocessable(
        "ADMIN_DESACTIVE",
        "Réactivez cet administrateur avant de renvoyer son invitation."
      );
    }
    if (user.emailVerifiedAt) {
      throw conflict(
        "ADMIN_DEJA_ACTIVE",
        "Cet administrateur a déjà activé son compte."
      );
    }
    await prisma.authToken.updateMany({
      where: { userId: user.id, type: "reset_password", usedAt: null },
      data: { usedAt: new Date() },
    });
    await sendAdminInvitationEmail(user);
  },

  setAdminStatus: async (
    userId: number,
    actingAdminId: number,
    active: boolean
  ) => {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.role !== "ADMIN")
      throw notFound("Administrateur introuvable");
    if (userId === actingAdminId && !active) {
      throw unprocessable(
        "AUTO_DESACTIVATION_INTERDITE",
        "Vous ne pouvez pas désactiver votre propre compte."
      );
    }
    if (!active && target.active) {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true },
      });
      if (activeAdmins <= 1) {
        throw conflict(
          "DERNIER_ADMIN",
          "Le dernier administrateur actif ne peut pas être désactivé."
        );
      }
    }
    await prisma.user.update({ where: { id: userId }, data: { active } });
  },

  deleteAdmin: async (userId: number, actingAdminId: number) => {
    if (userId === actingAdminId) {
      throw unprocessable(
        "AUTO_SUPPRESSION_INTERDITE",
        "Vous ne pouvez pas supprimer votre propre compte."
      );
    }
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.role !== "ADMIN")
      throw notFound("Administrateur introuvable");
    if (target.active) {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true },
      });
      if (activeAdmins <= 1) {
        throw conflict(
          "DERNIER_ADMIN",
          "Le dernier administrateur actif ne peut pas être supprimé."
        );
      }
    }
    await prisma.user.delete({ where: { id: userId } });
  },
};
