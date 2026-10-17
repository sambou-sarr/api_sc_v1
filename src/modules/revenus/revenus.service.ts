import { prisma } from "../../database/prisma/prisma-client";

// Dakar est en UTC+0 toute l'année : découper les mois et les semaines en UTC est donc exact.
const JOUR_MS = 24 * 60 * 60 * 1000;
const NB_MOIS = 12;
const NB_SEMAINES = 12;

type Formule = "essentielle" | "pro" | "signature";
export type Paiement = { createdAt: Date; amountFcfa: number | null; type: string };

const cleMois = (d: Date) => d.toISOString().slice(0, 7); // "2026-10"
const debutMois = (d: Date, decalage = 0) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + decalage, 1));
const lundi = (d: Date) => {
  const retard = (d.getUTCDay() + 6) % 7; // lundi = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - retard));
};

// Calcul pur (sans base) : testable à part.
export function construire(
  paiements: Paiement[],
  fichesCreees: Date[],
  renouvellements: (number | null)[],
  now: Date
) {
  // 12 mois, du plus ancien au courant, à zéro par défaut
  const mois = new Map<string, { montantFcfa: number; nbPaiements: number }>();
  for (let i = NB_MOIS - 1; i >= 0; i--)
    mois.set(cleMois(debutMois(now, -i)), { montantFcfa: 0, nbPaiements: 0 });

  const parFormule: Record<Formule, { montantFcfa: number; nbPaiements: number }> = {
    essentielle: { montantFcfa: 0, nbPaiements: 0 },
    pro: { montantFcfa: 0, nbPaiements: 0 },
    signature: { montantFcfa: 0, nbPaiements: 0 },
  };
  for (const p of paiements) {
    const m = mois.get(cleMois(p.createdAt));
    if (!m || !p.amountFcfa) continue;
    m.montantFcfa += p.amountFcfa;
    m.nbPaiements += 1;
    const f = parFormule[p.type.toLowerCase() as Formule];
    if (f) { f.montantFcfa += p.amountFcfa; f.nbPaiements += 1; }
  }

  const liste = [...mois.entries()].map(([k, v]) => ({ mois: k, ...v }));
  const courant = liste[liste.length - 1].montantFcfa;
  const precedent = liste[liste.length - 2].montantFcfa;

  // 12 semaines (lundi → dimanche)
  const semaines = new Map<string, number>();
  const lundiCourant = lundi(now);
  for (let i = NB_SEMAINES - 1; i >= 0; i--)
    semaines.set(new Date(lundiCourant.getTime() - i * 7 * JOUR_MS).toISOString().slice(0, 10), 0);
  for (const d of fichesCreees) {
    const k = lundi(d).toISOString().slice(0, 10);
    if (semaines.has(k)) semaines.set(k, semaines.get(k)! + 1);
  }

  return {
    encaisse: {
      ceMois: courant,
      moisPrecedent: precedent,
      evolutionPct: precedent === 0 ? null : Math.round(((courant - precedent) / precedent) * 100),
    },
    mois: liste,
    parFormule,
    aRenouveler: {
      nb: renouvellements.length,
      // estimation : prix actuel de la formule de chaque abonnement qui se termine
      montantEstimeFcfa: renouvellements.reduce<number>((s, p) => s + (p ?? 0), 0),
    },
    fichesParSemaine: [...semaines.entries()].map(([semaine, nb]) => ({ semaine, nb })),
  };
}

export const RevenusService = {
  async get() {
    const now = new Date();
    const debutPaiements = debutMois(now, -(NB_MOIS - 1));
    const debutSemaines = new Date(lundi(now).getTime() - (NB_SEMAINES - 1) * 7 * JOUR_MS);

    const [abonnements, fiches, aRenouveler] = await Promise.all([
      // Un abonnement activé = un paiement enregistré (montant + référence). Les abonnements
      // ensuite annulés ou expirés comptent : l'argent a bien été encaissé. Seuls les PENDING sont exclus.
      prisma.subscription.findMany({
        where: { createdAt: { gte: debutPaiements }, status: { not: "PENDING" }, amountFcfa: { not: null } },
        select: { createdAt: true, amountFcfa: true, plan: { select: { type: true } } },
      }),
      prisma.fiche.findMany({ where: { createdAt: { gte: debutSemaines } }, select: { createdAt: true } }),
      prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          endsAt: { gt: now, lte: new Date(now.getTime() + 30 * JOUR_MS) },
          fiche: { statut: "ACTIVE" },
        },
        select: { plan: { select: { prixFcfa: true } } },
      }),
    ]);

    return construire(
      abonnements.map(a => ({ createdAt: a.createdAt, amountFcfa: a.amountFcfa, type: a.plan.type })),
      fiches.map(f => f.createdAt),
      aRenouveler.map(a => a.plan.prixFcfa),
      now
    );
  },
};
