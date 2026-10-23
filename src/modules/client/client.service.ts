import { prisma } from "../../database/prisma/prisma-client";
import { AuthUser } from "../../types/user";

export const ClientService = {
  detailFiche: async (user: AuthUser) => {
    const getFiche = await prisma.fiche.findMany({
      where: { userId: user.id },
      include: {
        subscriptions: {
          where: {
            status: "ACTIVE",
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          orderBy: { startsAt: "desc" },
          take: 1,
          select: {
            endsAt: true,
            status: true,
            plan: { select: { type: true } },
          },
        },
      },
    });

    const latestSubscriptions = getFiche.length
      ? await prisma.subscription.findMany({
          where: {
            ficheId: { in: getFiche.map(fiche => fiche.id) },
            status: { not: "PENDING" },
          },
          orderBy: [{ startsAt: "desc" }, { id: "desc" }],
          distinct: ["ficheId"],
          select: {
            ficheId: true,
            endsAt: true,
            status: true,
          },
        })
      : [];
    const latestByFicheId = new Map(
      latestSubscriptions.map(subscription => [
        subscription.ficheId,
        subscription,
      ]),
    );

    return getFiche.map(fiche => ({
      ...fiche,
      latestSubscription: latestByFicheId.get(fiche.id) ?? null,
    }));
  },
};
