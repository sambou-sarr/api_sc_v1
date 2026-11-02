import { prisma } from "../../database/prisma/prisma-client";

const DAY_MS = 24 * 60 * 60 * 1000;

type Formule = "essentielle" | "pro" | "signature";
type Paiement = { createdAt: Date; amountFcfa: number | null; type: string };
type DateRange = { from: string; to: string };

const utcDate = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const startOfWeek = (date: Date) => {
  const day = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - day * DAY_MS);
};
const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const addMonths = (date: Date, count: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
const key = (date: Date) => date.toISOString().slice(0, 10);

function bucketStart(date: Date, grouping: "day" | "week" | "month") {
  if (grouping === "month") return startOfMonth(date);
  if (grouping === "week") return startOfWeek(date);
  return utcDate(date);
}

function nextBucket(date: Date, grouping: "day" | "week" | "month") {
  if (grouping === "month") return addMonths(date, 1);
  return new Date(date.getTime() + (grouping === "week" ? 7 : 1) * DAY_MS);
}

function sum(paiements: Paiement[]) {
  const parFormule: Record<Formule, { montantFcfa: number; nbPaiements: number }> = {
    essentielle: { montantFcfa: 0, nbPaiements: 0 },
    pro: { montantFcfa: 0, nbPaiements: 0 },
    signature: { montantFcfa: 0, nbPaiements: 0 },
  };
  let total = 0;
  for (const payment of paiements) {
    if (payment.amountFcfa === null) continue;
    total += payment.amountFcfa;
    const formula = parFormule[payment.type.toLowerCase() as Formule];
    if (formula) {
      formula.montantFcfa += payment.amountFcfa;
      formula.nbPaiements += 1;
    }
  }
  return { total, parFormule };
}

export const RevenusService = {
  async get(range: DateRange) {
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    const endExclusive = new Date(to.getTime() + DAY_MS);
    const durationDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
    const previousFrom = new Date(from.getTime() - durationDays * DAY_MS);
    const previousEnd = from;
    const grouping =
      durationDays <= 7 ? "day" : durationDays <= 180 ? "week" : "month";
    const bucketValues = new Map<string, { montantFcfa: number; nbPaiements: number; fiches: number }>();

    for (
      let cursor = bucketStart(from, grouping);
      cursor < endExclusive;
      cursor = nextBucket(cursor, grouping)
    ) {
      bucketValues.set(key(cursor), { montantFcfa: 0, nbPaiements: 0, fiches: 0 });
    }

    const [paiements, fiches, paiementsPrecedents, aRenouveler] = await Promise.all([
      prisma.subscription.findMany({
        where: {
          createdAt: { gte: from, lt: endExclusive },
          status: { not: "PENDING" },
          amountFcfa: { not: null },
        },
        select: { createdAt: true, amountFcfa: true, plan: { select: { type: true } } },
      }),
      prisma.fiche.findMany({
        where: { createdAt: { gte: from, lt: endExclusive } },
        select: { createdAt: true },
      }),
      prisma.subscription.findMany({
        where: {
          createdAt: { gte: previousFrom, lt: previousEnd },
          status: { not: "PENDING" },
          amountFcfa: { not: null },
        },
        select: { createdAt: true, amountFcfa: true, plan: { select: { type: true } } },
      }),
      prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          endsAt: { gt: new Date(), lte: new Date(Date.now() + 30 * DAY_MS) },
          fiche: { statut: "ACTIVE" },
        },
        select: { plan: { select: { prixFcfa: true } } },
      }),
    ]);

    const currentPayments = paiements.map(payment => ({
      createdAt: payment.createdAt,
      amountFcfa: payment.amountFcfa,
      type: payment.plan.type,
    }));
    const previousPayments = paiementsPrecedents.map(payment => ({
      createdAt: payment.createdAt,
      amountFcfa: payment.amountFcfa,
      type: payment.plan.type,
    }));
    for (const payment of currentPayments) {
      const period = bucketValues.get(key(bucketStart(payment.createdAt, grouping)));
      if (!period || payment.amountFcfa === null) continue;
      period.montantFcfa += payment.amountFcfa;
      period.nbPaiements += 1;
    }
    for (const fiche of fiches) {
      const period = bucketValues.get(key(bucketStart(fiche.createdAt, grouping)));
      if (period) period.fiches += 1;
    }

    const totals = sum(currentPayments);
    const previousTotal = sum(previousPayments).total;
    return {
      encaisse: {
        montantFcfa: totals.total,
        periodePrecedenteFcfa: previousTotal,
        evolutionPct:
          previousTotal === 0
            ? null
            : Math.round(((totals.total - previousTotal) / previousTotal) * 100),
      },
      parFormule: totals.parFormule,
      aRenouveler: {
        nb: aRenouveler.length,
        montantEstimeFcfa: aRenouveler.reduce<number>(
          (total, subscription) => total + (subscription.plan.prixFcfa ?? 0),
          0
        ),
      },
      grouping,
      encaissements: [...bucketValues.entries()].map(([periode, value]) => ({
        periode,
        montantFcfa: value.montantFcfa,
        nbPaiements: value.nbPaiements,
      })),
      nouvellesFiches: [...bucketValues.entries()].map(([periode, value]) => ({
        periode,
        nombre: value.fiches,
      })),
    };
  },
};
