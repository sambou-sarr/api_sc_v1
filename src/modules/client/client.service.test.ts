import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ficheFindMany: vi.fn(),
  subscriptionFindMany: vi.fn(),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    fiche: { findMany: mocks.ficheFindMany },
    subscription: { findMany: mocks.subscriptionFindMany },
  },
}));

import { ClientService } from "./client.service";

const user = { id: 7, role: "CLIENT" } as never;

describe("ClientService.detailFiche : dernier abonnement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renvoie la formule du dernier abonnement (nécessaire au renouvellement d'une fiche expirée)", async () => {
    mocks.ficheFindMany.mockResolvedValue([{ id: 1, subscriptions: [] }]);
    mocks.subscriptionFindMany.mockResolvedValue([
      { ficheId: 1, endsAt: new Date("2026-09-01"), status: "EXPIRED", plan: { type: "PRO" } },
    ]);

    const [fiche] = await ClientService.detailFiche(user);

    expect(fiche.latestSubscription).toMatchObject({ status: "EXPIRED", plan: { type: "PRO" } });
    // la requête demande bien le type de formule
    const query = mocks.subscriptionFindMany.mock.calls[0][0];
    expect(query.select.plan).toEqual({ select: { type: true } });
  });

  it("une fiche sans abonnement n'a pas de dernier abonnement", async () => {
    mocks.ficheFindMany.mockResolvedValue([{ id: 2, subscriptions: [] }]);
    mocks.subscriptionFindMany.mockResolvedValue([]);
    const [fiche] = await ClientService.detailFiche(user);
    expect(fiche.latestSubscription).toBeNull();
  });

  it("ne lit que les fiches du client connecté", async () => {
    mocks.ficheFindMany.mockResolvedValue([]);
    await ClientService.detailFiche(user);
    expect(mocks.ficheFindMany.mock.calls[0][0].where).toEqual({ userId: 7 });
    expect(mocks.subscriptionFindMany).not.toHaveBeenCalled();
  });
});
