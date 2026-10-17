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
          select: { plan: { select: { type: true } } },
        },
      },
    });

    return getFiche;
  },
};
