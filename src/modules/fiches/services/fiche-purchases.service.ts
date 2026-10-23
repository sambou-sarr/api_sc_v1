import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PlanType,
} from "../../../database/prisma/generated/prisma/client";
import { prisma } from "../../../database/prisma/prisma-client";
import { env } from "../../../config/env";
import {
  conflict,
  forbidden,
  HttpError,
  notFound,
  unprocessable,
} from "../../../lib/httpError";
import type { AuthUser } from "../../../types/user";
import { ParametresService } from "../../parametres/parametres.service";
import type { FichePurchaseInput } from "../fiche-purchases.schemas";
import { createPurchasedFiches } from "./fiches.service";

const PURCHASE_LIFETIME_MS = 30 * 60 * 1000;
type PurchaseDb = Prisma.TransactionClient | typeof prisma;

function assertClientCanPurchase(user: AuthUser) {
  if (user.role !== "CLIENT")
    throw forbidden("ACCES_REFUSE", "Cette action est réservée aux clients");
  if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified)
    throw forbidden(
      "EMAIL_NON_VERIFIE",
      "Confirme ton adresse e-mail avant de commander des fiches"
    );
}

async function usage(userId: number, db: PurchaseDb, excludePurchaseId?: number) {
  const now = new Date();
  const [total, reservations] = await Promise.all([
    db.fiche.count({ where: { userId } }),
    db.fichePurchase.aggregate({
      where: {
        userId,
        status: "PENDING",
        expiresAt: { gt: now },
        ...(excludePurchaseId === undefined
          ? {}
          : { id: { not: excludePurchaseId } }),
      },
      _sum: { quantity: true },
    }),
  ]);
  const reserved = reservations._sum.quantity ?? 0;
  return {
    total,
    reserved,
    freeSlots: Math.max(0, env.MAX_FICHES_PER_USER - total - reserved),
  };
}

async function buildQuote(
  userId: number,
  input: FichePurchaseInput,
  db: PurchaseDb
) {
  const planType = input.plan.toUpperCase() as PlanType;
  const [plan, accountUsage] = await Promise.all([
    db.plan.findUnique({
      where: { type: planType },
      include: { limits: true },
    }),
    usage(userId, db),
  ]);
  if (!plan || !plan.actif) throw notFound("Formule introuvable ou désactivée");
  if (!plan.limits)
    throw new HttpError(
      500,
      "SEED_MANQUANT",
      "Les capacités des formules ne sont pas initialisées (npm run prisma:seed)"
    );

  const freeQuantity =
    planType === "ESSENTIELLE"
      ? Math.min(input.quantity, accountUsage.freeSlots)
      : 0;
  const paidQuantity = input.quantity - freeQuantity;

  if (planType === "ESSENTIELLE") {
    const emplacements =
      paidQuantity > 0
        ? await ParametresService.tarifEmplacements(paidQuantity, db)
        : null;
    return {
      formule: plan.type.toLowerCase(),
      nom: plan.nom,
      quantity: input.quantity,
      freeQuantity,
      paidQuantity,
      dureeMois: null,
      totalFcfa: emplacements?.totalFcfa ?? 0,
      emplacements,
    };
  }

  const tarif = await ParametresService.tarifCommande(
    {
      lignes: [
        {
          formule: input.plan,
          dureeMois: input.dureeMois!,
          quantite: input.quantity,
        },
      ],
    },
    db
  );
  if (tarif.totalFcfa <= 0)
    throw unprocessable(
      "PRIX_NON_CONFIGURE",
      `Le prix de la formule ${plan.nom} doit être supérieur à zéro`
    );
  return {
    formule: plan.type.toLowerCase(),
    nom: plan.nom,
    quantity: input.quantity,
    freeQuantity: 0,
    paidQuantity: input.quantity,
    dureeMois: input.dureeMois!,
    totalFcfa: tarif.totalFcfa,
    tarif: tarif.lignes[0],
  };
}

function répartirMontant(totalFcfa: number, quantity: number) {
  if (quantity === 0) return [];
  const montantParFiche = Math.floor(totalFcfa / quantity);
  const reste = totalFcfa % quantity;
  return Array.from(
    { length: quantity },
    (_, index) => montantParFiche + (index < reste ? 1 : 0)
  );
}

async function fulfillPurchase(
  tx: Prisma.TransactionClient,
  userId: number,
  purchaseId: number
) {
  const purchase = await tx.fichePurchase.findFirst({
    where: { id: purchaseId, userId },
    include: { plan: { include: { limits: true } } },
  });
  if (!purchase) throw notFound("Commande introuvable");
  if (purchase.status !== "PENDING")
    throw conflict(
      "COMMANDE_NON_EN_ATTENTE",
      "Cette commande a déjà été traitée ou ne peut plus être confirmée"
    );

  const now = new Date();
  if (purchase.expiresAt <= now)
    throw conflict(
      "COMMANDE_EXPIREE",
      "Cette commande a expiré. Recalcule le tarif avant de recommencer."
    );
  if (!purchase.plan.actif)
    throw notFound("Formule introuvable ou désactivée");

  const claimed = await tx.fichePurchase.updateMany({
    where: {
      id: purchase.id,
      userId,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    data: { status: "CONFIRMED", confirmedAt: now },
  });
  if (claimed.count !== 1)
    throw conflict(
      "COMMANDE_DEJA_TRAITEE",
      "Cette commande a déjà été confirmée ou a expiré"
    );

  const accountUsage = await usage(userId, tx, purchase.id);
  if (purchase.freeQuantity > accountUsage.freeSlots)
    throw conflict(
      "DEVIS_A_RECALCULER",
      "Le nombre de places gratuites a changé. Recalcule le tarif avant de recommencer."
    );

  const paidQuantity = purchase.quantity - purchase.freeQuantity;
  const amounts = répartirMontant(purchase.amountFcfa, paidQuantity);
  let paidIndex = 0;
  const amountsByFiche = Array.from({ length: purchase.quantity }, (_, index) =>
    index < purchase.freeQuantity ? 0 : amounts[paidIndex++]
  );
  const created = await createPurchasedFiches(
    tx,
    userId,
    purchase.plan,
    amountsByFiche,
    purchase.dureeMois,
    purchase.reference
  );
  const paidFiches = created.filter(fiche => fiche.amountFcfa > 0);
  if (paidFiches.length > 0)
    await tx.payment.createMany({
      data: paidFiches.map(fiche => ({
        ficheId: fiche.ficheId,
        subscriptionId: fiche.subscriptionId,
        planId: purchase.planId,
        dureeMois: purchase.dureeMois,
        provider: "SIMULATION",
        status: "SUCCEEDED",
        amountFcfa: fiche.amountFcfa,
        currency: "XOF",
        providerReference: fiche.paymentRef!,
        paidAt: now,
      })),
    });

  return {
    purchase: {
      id: purchase.id,
      reference: purchase.reference,
      status: "confirmed" as const,
      amountFcfa: purchase.amountFcfa,
    },
    fiches: created.map(item => item.fiche),
  };
}

export const FichePurchasesService = {
  async quote(user: AuthUser, input: FichePurchaseInput) {
    assertClientCanPurchase(user);
    return buildQuote(user.id, input, prisma);
  },

  async create(user: AuthUser, input: FichePurchaseInput) {
    assertClientCanPurchase(user);

    return prisma.$transaction(
      async tx => {
        const quote = await buildQuote(user.id, input, tx);
        if (env.NODE_ENV === "production" && quote.totalFcfa > 0)
          throw forbidden(
            "PAIEMENT_NON_CONFIGURE",
            "Les paiements réels ne sont pas configurés. La commande est temporairement indisponible."
          );
        const plan = await tx.plan.findUnique({
          where: { type: input.plan.toUpperCase() as PlanType },
        });
        if (!plan || !plan.actif)
          throw notFound("Formule introuvable ou désactivée");

        const now = new Date();
        const purchase = await tx.fichePurchase.create({
          data: {
            userId: user.id,
            planId: plan.id,
            quantity: input.quantity,
            freeQuantity: quote.freeQuantity,
            dureeMois: quote.dureeMois,
            amountFcfa: quote.totalFcfa,
            reference: `SIMULATED-${randomUUID()}`,
            expiresAt: new Date(now.getTime() + PURCHASE_LIFETIME_MS),
          },
        });
        if (quote.totalFcfa === 0)
          return fulfillPurchase(tx, user.id, purchase.id);

        return {
          purchase: {
            id: purchase.id,
            reference: purchase.reference,
            status: "pending" as const,
            expiresAt: purchase.expiresAt,
          },
          quote,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },

  async confirmSimulated(user: AuthUser, purchaseId: number) {
    if (env.NODE_ENV === "production")
      throw forbidden(
        "SIMULATION_DESACTIVEE",
        "La confirmation simulée est désactivée en production"
      );
    assertClientCanPurchase(user);

    return prisma.$transaction(
      tx => fulfillPurchase(tx, user.id, purchaseId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
};
