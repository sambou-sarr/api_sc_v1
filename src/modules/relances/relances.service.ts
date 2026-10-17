import type { Prisma } from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import type { RelancesQuery } from "./relances.schemas";

const JOUR_MS = 24 * 60 * 60 * 1000;
const CAP = 500; // on trie en mémoire : ces listes restent petites

// « Abonnement valable » = ACTIVE et pas encore arrivé à échéance (même règle que le module admin).
const abonnementValable = (now: Date): Prisma.SubscriptionWhereInput => ({
  status: "ACTIVE",
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

// Les fiches suspendues sont volontairement exclues : on ne relance pas une fiche mise hors ligne.
function conditions(q: RelancesQuery, now: Date): Prisma.FicheWhereInput {
  const base: Prisma.FicheWhereInput = { statut: "ACTIVE" };
  if (q.type === "bientot")
    return {
      ...base,
      subscriptions: {
        some: {
          status: "ACTIVE",
          endsAt: { gt: now, lte: new Date(now.getTime() + q.jours * JOUR_MS) },
        },
      },
    };
  if (q.type === "expirees")
    return { ...base, NOT: { subscriptions: { some: abonnementValable(now) } } };
  return {
    ...base,
    scansTotal: { gte: q.scansMin },
    subscriptions: {
      some: { ...abonnementValable(now), plan: { type: "ESSENTIELLE" } },
    },
  };
}

export const RelancesService = {
  async list(q: RelancesQuery) {
    const now = new Date();
    const where = conditions(q, now);

    const [fiches, total] = await prisma.$transaction([
      prisma.fiche.findMany({
        where,
        take: CAP,
        select: {
          id: true,
          slug: true,
          prenom: true,
          nom: true,
          entreprise: true,
          telephone: true,
          whatsapp: true,
          email: true,
          scansTotal: true,
          user: { select: { id: true, email: true, nom: true } },
          // dernier abonnement : sert à afficher la formule et l'échéance (même pour une fiche expirée)
          subscriptions: {
            orderBy: { startsAt: "desc" },
            take: 1,
            select: { endsAt: true, plan: { select: { type: true } } },
          },
        },
      }),
      prisma.fiche.count({ where }),
    ]);

    const items = fiches.map(f => {
      const abo = f.subscriptions[0] ?? null;
      const fin = abo?.endsAt ?? null;
      return {
        id: f.id,
        slug: f.slug,
        nom: `${f.prenom} ${f.nom}`.trim(),
        prenom: f.prenom,
        entreprise: f.entreprise ?? "",
        formule: (abo?.plan.type ?? "ESSENTIELLE").toLowerCase(),
        dateEcheance: fin ? fin.toISOString().slice(0, 10) : null,
        // négatif = déjà expirée depuis N jours
        joursRestants: fin ? Math.ceil((fin.getTime() - now.getTime()) / JOUR_MS) : null,
        scansTotal: f.scansTotal,
        telephone: f.telephone,
        whatsapp: f.whatsapp,
        email: f.email,
        proprietaire: f.user,
      };
    });

    // bientot : la plus proche de l'échéance d'abord · autres : les plus scannées d'abord
    items.sort((a, b) =>
      q.type === "bientot"
        ? (a.joursRestants ?? 0) - (b.joursRestants ?? 0)
        : b.scansTotal - a.scansTotal
    );

    return { total, items: items.slice(0, q.limit) };
  },
};
