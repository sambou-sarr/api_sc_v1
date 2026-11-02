import { randomUUID } from "node:crypto";
import { env } from "../../config/env";
import type {
  PlanType,
  Prisma,
} from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import {
  conflict,
  forbidden,
  HttpError,
  notFound,
} from "../../lib/httpError";
import type { AuthUser } from "../../types/user";
import { ficheInclude, toFicheDto } from "../fiches/fiches.dto";
import { ParametresService } from "../parametres/parametres.service";
import { Kpi } from "./subscription.type";

const planInclude = {
  plan: { include: { limits: true } },
} satisfies Prisma.SubscriptionInclude;
export type EffectiveSubscription = Prisma.SubscriptionGetPayload<{
  include: typeof planInclude;
}>;

// Abonnement effectif d'une fiche = ACTIVE et non expiré. null => fiche expirée.
export async function getEffectiveSubscription(
  ficheId: number,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<EffectiveSubscription | null> {
  return db.subscription.findFirst({
    where: {
      ficheId,
      status: "ACTIVE",
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    orderBy: { startsAt: "desc" },
    include: planInclude,
  });
}

const addMonths = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

type ActivateInput = {
  ficheId: number;
  planType: PlanType;
  endsAt?: Date | null; // undefined => calculé à partir de plan.dureeMois ; null => sans échéance
  amountFcfa?: number | null;
  paymentRef?: string | null;
};

// Remplace l'abonnement actif par un nouveau, dans une seule transaction.
export async function activateSubscription(input: ActivateInput) {
  return prisma.$transaction(async tx => {
    const plan = await tx.plan.findUnique({ where: { type: input.planType } });
    if (!plan || !plan.actif)
      throw notFound("Formule introuvable ou désactivée");

    const now = new Date();
    await tx.subscription.updateMany({
      where: { ficheId: input.ficheId, status: "ACTIVE" },
      data: { status: "CANCELED", canceledAt: now },
    });

    const endsAt =
      input.endsAt !== undefined
        ? input.endsAt
        : plan.dureeMois
          ? addMonths(now, plan.dureeMois)
          : null;

    return tx.subscription.create({
      data: {
        ficheId: input.ficheId,
        planId: plan.id,
        status: "ACTIVE",
        startsAt: now,
        endsAt,
        amountFcfa: input.amountFcfa ?? plan.prixFcfa,
        paymentRef: input.paymentRef ?? null,
      },
    });
  });
}

// À lancer régulièrement (voir server.ts) : marque EXPIRED les abonnements arrivés à échéance.
export async function expireDueSubscriptions() {
  const { count } = await prisma.subscription.updateMany({
    where: { status: "ACTIVE", endsAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
  return count;
}

const PLAN_RANK: Record<PlanType, number> = {
  ESSENTIELLE: 0,
  PRO: 1,
  SIGNATURE: 2,
};

async function updateDefaultFicheTemplate(
  tx: Prisma.TransactionClient,
  ficheId: number,
  ficheDefaults: {
    enteteTheme: Prisma.FicheGetPayload<{
      select: { enteteTheme: true };
    }>["enteteTheme"];
    enteteDisposition: Prisma.FicheGetPayload<{
      select: { enteteDisposition: true };
    }>["enteteDisposition"];
  },
  targetPlan: Prisma.PlanGetPayload<{ include: { limits: true } }>
) {
  if (!targetPlan.limits)
    throw new HttpError(
      500,
      "SEED_MANQUANT",
      "Les capacités de la formule ne sont pas initialisées"
    );

  const [tabs, plans] = await Promise.all([
    tx.ficheOnglet.findMany({
      where: { ficheId },
      orderBy: { position: "asc" },
      select: {
        type: true,
        titre: true,
        contenu: true,
        visible: true,
      },
    }),
    tx.plan.findMany({ include: { limits: true } }),
  ]);
  const isDefaultTabs = plans.some(plan => {
    const defaultTabs = plan.limits?.tabsAutorises;
    return (
      !!defaultTabs &&
      defaultTabs.length === tabs.length &&
      tabs.every(
        (tab, position) =>
          tab.type === defaultTabs[position] &&
          tab.visible &&
          tab.titre === null &&
          tab.contenu === null
      )
    );
  });

  if (isDefaultTabs) {
    await tx.ficheOnglet.deleteMany({ where: { ficheId } });
    await tx.ficheOnglet.createMany({
      data: targetPlan.limits.tabsAutorises.map((type, position) => ({
        ficheId,
        type,
        visible: true,
        position,
      })),
    });
  }

  const updateFiche: Prisma.FicheUpdateInput = {};
  if (plans.some(plan => plan.themeDefaut === ficheDefaults.enteteTheme))
    updateFiche.enteteTheme = targetPlan.themeDefaut;
  if (
    plans.some(
      plan =>
        plan.limits?.headerLayouts[0] === ficheDefaults.enteteDisposition
    )
  )
    updateFiche.enteteDisposition =
      targetPlan.limits.headerLayouts[0] ?? "PORTRAIT";
  if (Object.keys(updateFiche).length > 0)
    await tx.fiche.update({ where: { id: ficheId }, data: updateFiche });
}

// Crée une demande de changement de formule et un paiement PENDING.
// Aucune formule n'est activée à cette étape.
export async function upgrade(
  user: AuthUser,
  ficheId: number,
  planType: PlanType,
  requestedDuration?: number
) {
  if (env.NODE_ENV === "production")
    throw forbidden(
      "PAIEMENT_NON_CONFIGURE",
      "Le paiement réel n'est pas encore configuré. Le changement de formule est temporairement indisponible."
    );

  if (user.role !== "CLIENT")
    throw forbidden("ACCES_REFUSE", "Cette action est réservée aux clients");

  if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified)
    throw forbidden(
      "EMAIL_NON_VERIFIE",
      "Confirme ton adresse e-mail avant de changer de formule"
    );

  return prisma.$transaction(async tx => {
    const fiche = await tx.fiche.findUnique({
      where: { id: ficheId },
      select: { id: true, userId: true, statut: true },
    });

    if (!fiche || fiche.userId !== user.id) throw notFound("Fiche introuvable");

    if (fiche.statut === "SUSPENDUE")
      throw forbidden(
        "FICHE_SUSPENDUE",
        "Cette fiche est suspendue : changement de formule impossible"
      );

    const [currentSubscription, targetPlan] = await Promise.all([
      getEffectiveSubscription(ficheId, tx),
      tx.plan.findUnique({
        where: { type: planType },
        select: { id: true, actif: true, dureeMois: true },
      }),
    ]);

    if (!targetPlan || !targetPlan.actif)
      throw notFound("Formule introuvable ou désactivée");

    const currentPlanType = currentSubscription?.plan.type ?? "ESSENTIELLE";
    if (PLAN_RANK[planType] <= PLAN_RANK[currentPlanType])
      throw conflict(
        "FORMULE_NON_SUPERIEURE",
        "Choisis une formule supérieure à celle actuellement active"
      );

    const dureeMois = requestedDuration ?? targetPlan.dureeMois;
    if (!dureeMois)
      throw forbidden(
        "DUREE_NON_CONFIGUREE",
        "Aucune durée par défaut n'est définie pour cette formule"
      );
    const tarif = await ParametresService.tarif(
      planType.toLowerCase(),
      dureeMois,
      1,
      tx
    );

    const payment = await tx.payment.create({
      data: {
        userId: user.id,
        ficheId,
        planId: targetPlan.id,
        dureeMois,
        provider: "SIMULATION",
        status: "PENDING",
        amountFcfa: tarif.totalFcfa,
        currency: "XOF",
        providerReference: `SIMULATED-${ficheId}-${randomUUID()}`,
      },
    });

    return {
      payment: {
        id: payment.id,
        reference: payment.providerReference,
        mode: "simulation" as const,
        status: "pending" as const,
        dureeMois,
        amountFcfa: payment.amountFcfa,
      },
    };
  });
}

// Confirmation de simulation séparée : en production, cette route est désactivée.
// Un fournisseur réel devra appeler le même cœur d'activation après vérification
// serveur de sa notification/statut, jamais sur la seule confiance du navigateur.
export async function confirmSimulatedPayment(
  user: AuthUser,
  paymentId: number
) {
  if (env.NODE_ENV === "production")
    throw forbidden(
      "SIMULATION_DESACTIVEE",
      "La confirmation simulée est désactivée en production"
    );

  if (user.role !== "CLIENT")
    throw forbidden("ACCES_REFUSE", "Cette action est réservée aux clients");

  if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified)
    throw forbidden(
      "EMAIL_NON_VERIFIE",
      "Confirme ton adresse e-mail avant de changer de formule"
    );

  return prisma.$transaction(async tx => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        fiche: {
          select: {
            id: true,
            userId: true,
            statut: true,
            enteteTheme: true,
            enteteDisposition: true,
          },
        },
        plan: { include: { limits: true } },
      },
    });

    if (!payment || payment.fiche?.userId !== user.id)
      throw notFound("Paiement introuvable");

    if (payment.status !== "PENDING")
      throw conflict(
        "PAIEMENT_NON_EN_ATTENTE",
        "Ce paiement a déjà été traité ou ne peut plus être confirmé"
      );

    if (payment.provider !== "SIMULATION")
      throw forbidden(
        "FOURNISSEUR_INVALIDE",
        "Ce paiement ne peut pas être confirmé par la simulation"
      );

    if (payment.fiche.statut === "SUSPENDUE")
      throw forbidden(
        "FICHE_SUSPENDUE",
        "Cette fiche est suspendue : changement de formule impossible"
      );

    if (!payment.plan.actif)
      throw notFound("Formule introuvable ou désactivée");

    const currentSubscription = await getEffectiveSubscription(
      payment.ficheId as number,
      tx
    );
    const currentPlanType = currentSubscription?.plan.type ?? "ESSENTIELLE";
    if (PLAN_RANK[payment.plan.type] <= PLAN_RANK[currentPlanType])
      throw conflict(
        "FORMULE_NON_SUPERIEURE",
        "La formule demandée n'est plus supérieure à la formule active"
      );

    const now = new Date();
    // Réclamation atomique du paiement : deux confirmations simultanées ne
    // peuvent pas activer deux abonnements pour la même tentative.
    const claimed = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: "PENDING",
        provider: "SIMULATION",
      },
      data: { status: "SUCCEEDED", paidAt: now },
    });
    if (claimed.count !== 1)
      throw conflict(
        "PAIEMENT_DEJA_TRAITE",
        "Ce paiement a déjà été confirmé ou traité"
      );

    const confirmedPayment = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    // L'abonnement n'est remplacé qu'après confirmation du paiement.
    await tx.subscription.updateMany({
      where: { ficheId: payment.ficheId, status: "ACTIVE" },
      data: { status: "CANCELED", canceledAt: now },
    });

    const dureeMois = payment.dureeMois ?? payment.plan.dureeMois;
    const endsAt = dureeMois ? addMonths(now, dureeMois) : null;



    const subscription = await tx.subscription.create({
      data: {
        ficheId: payment.ficheId,
        planId: payment.planId,
        status: "ACTIVE",
        startsAt: now,
        endsAt,
        amountFcfa: payment.amountFcfa,
        paymentRef: confirmedPayment.providerReference,
      },
    });

    await tx.payment.update({
      where: { id: confirmedPayment.id },
      data: { subscriptionId: subscription.id },
    });

    await updateDefaultFicheTemplate(
      tx,
      payment.ficheId as number,
      payment.fiche,
      payment.plan
    );

    const updatedFiche = await tx.fiche.findUnique({
      where: { id: payment.ficheId as number },
      include: ficheInclude,
    });
    if (!updatedFiche) throw notFound("Fiche introuvable");

    const effectiveSubscription = await getEffectiveSubscription(
      payment.ficheId as number,
      tx
    );
    return {
      subscription,
      fiche: toFicheDto(updatedFiche, effectiveSubscription),
      payment: {
        id: confirmedPayment.id,
        reference: confirmedPayment.providerReference,
        mode: "simulation" as const,
        status: "confirmed" as const,
      },
    };
  });
}

export const subscriptionKpi = async (user: AuthUser): Promise<Kpi> => {
  const ficheScope = user.role === "ADMIN" ? {} : { userId: user.id };

  const [nbrFiche, nbrFicheActive, nbrPayingFiche] = await Promise.all([
    prisma.fiche.count({ where: ficheScope }),
    prisma.fiche.count({
      where: { ...ficheScope, statut: "ACTIVE" },
    }),
    prisma.fiche.count({
      where: {
        ...ficheScope,
        subscriptions: {
          some: {
            status: "ACTIVE",
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            plan: { is: { type: { not: "ESSENTIELLE" } } },
          },
        },
      },
    }),
  ]);

  return { nbrFiche, nbrFicheActive, nbrPayingFiche };
};

export async function listPaymentsForUser(
  user: AuthUser,
  page = 1,
  limit = 20
) {
  if (user.role !== "CLIENT")
    throw forbidden("ACCES_REFUSE", "Cette action est réservée aux clients");

  const where = { userId: user.id };
  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        plan: { select: { type: true, nom: true } },
        fiche: {
          select: {
            id: true,
            slug: true,
            prenom: true,
            nom: true,
            entreprise: true,
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    items: payments.map(payment => {
      const ficheNom =
        payment.fiche &&
        `${payment.fiche.prenom} ${payment.fiche.nom}`.trim();
      return {
        id: payment.id,
        statut: payment.status.toLowerCase(),
        formule: payment.plan.type.toLowerCase(),
        formuleNom: payment.plan.nom,
        fournisseur: payment.provider.toLowerCase(),
        montantFcfa: payment.amountFcfa,
        devise: payment.currency,
        reference: payment.providerReference,
        motifEchec: payment.failureReason,
        createdAt: payment.createdAt,
        payeLe: payment.paidAt,
        dureeMois: payment.dureeMois,
        fiche: {
          id: payment.fiche?.id ?? null,
          slug: payment.fiche?.slug ?? payment.ficheSlugSnapshot,
          nom:
            ficheNom ||
            payment.ficheNomSnapshot ||
            "Fiche supprimée",
          entreprise: payment.fiche?.entreprise ?? null,
        },
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export const filter = async (plan: string) => {
  const filterByPlan = await prisma.plan.findMany({
    where: {
      type: "ESSENTIELLE", // remplace par la valeur souhaitée
    },
  });

  // console.log(filterByPlan.map(f => {f.}));

  return filterByPlan;
};
