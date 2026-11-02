import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ficheFindUnique: vi.fn(),
  ficheFindFirst: vi.fn(),
  ficheFindMany: vi.fn(),
  ficheCount: vi.fn(),
  ficheAggregate: vi.fn(),
  ficheUpdate: vi.fn(),
  ficheUpdateMany: vi.fn(),
  printJobCount: vi.fn(),
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  sectionStickerCount: vi.fn(),
  transactionFicheFindUnique: vi.fn(),
  transactionFicheDelete: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  subscriptionFindFirst: vi.fn(),
  subscriptionUpdate: vi.fn(),
  paymentUpdateMany: vi.fn(),
  subscriptionFindMany: vi.fn(),
  subscriptionCount: vi.fn(),
  paymentFindMany: vi.fn(),
  paymentCount: vi.fn(),
  actionLogFindMany: vi.fn(),
  actionLogCount: vi.fn(),
  transaction: vi.fn(),
  toFicheDto: vi.fn(() => ({ id: 12 })),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    fiche: {
      findUnique: mocks.ficheFindUnique,
      findFirst: mocks.ficheFindFirst,
      findMany: mocks.ficheFindMany,
      count: mocks.ficheCount,
      aggregate: mocks.ficheAggregate,
      update: mocks.ficheUpdate,
      updateMany: mocks.ficheUpdateMany,
    },
    subscription: {
      findMany: mocks.subscriptionFindMany,
      count: mocks.subscriptionCount,
      findFirst: mocks.subscriptionFindFirst,
      update: mocks.subscriptionUpdate,
      updateMany: mocks.subscriptionUpdateMany,
    },
    payment: {
      findMany: mocks.paymentFindMany,
      count: mocks.paymentCount,
      updateMany: mocks.paymentUpdateMany,
    },
    printJob: { count: mocks.printJobCount },
    user: { count: mocks.userCount, findMany: mocks.userFindMany },
    adminActionLog: {
      findMany: mocks.actionLogFindMany,
      count: mocks.actionLogCount,
    },
    sectionStickerRequest: { count: mocks.sectionStickerCount },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../subscriptions/subscriptions.service", () => ({
  activateSubscription: vi.fn(),
  getEffectiveSubscription: vi.fn(),
}));

vi.mock("../fiches/fiches.dto", () => ({
  ficheInclude: {},
  toFicheDto: mocks.toFicheDto,
}));

import { AdminService } from "./admin.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((operation: unknown) => {
    if (typeof operation === "function") {
      return operation({
        fiche: {
          findUnique: mocks.transactionFicheFindUnique,
          delete: mocks.transactionFicheDelete,
        },
        subscription: { updateMany: mocks.subscriptionUpdateMany },
        payment: { updateMany: mocks.paymentUpdateMany },
      });
    }
    return Promise.all(operation as Promise<unknown>[]);
  });
});

describe("AdminService.updateFiche", () => {
  it("prevents changing the slug after a client account exists", async () => {
    mocks.ficheFindUnique
      .mockResolvedValueOnce({ id: 12 })
      .mockResolvedValueOnce({ userId: 9 });

    await expect(
      AdminService.updateFiche(12, { slug: "nouvelle-adresse" })
    ).rejects.toMatchObject({
      code: "SLUG_IMMUABLE",
      status: 409,
    });

    expect(mocks.ficheFindFirst).not.toHaveBeenCalled();
    expect(mocks.ficheUpdate).not.toHaveBeenCalled();
  });

  it("persists a slug change for a fiche without a client account", async () => {
    mocks.ficheFindUnique
      .mockResolvedValueOnce({ id: 12 })
      .mockResolvedValueOnce({ userId: null })
      .mockResolvedValueOnce({
        id: 12,
        userId: null,
        slug: "nouvelle-adresse",
        subscriptions: [],
      });
    mocks.ficheFindFirst.mockResolvedValue(null);
    mocks.ficheUpdateMany.mockResolvedValue({ count: 1 });

    await AdminService.updateFiche(12, { slug: "nouvelle-adresse" });

    expect(mocks.ficheUpdateMany).toHaveBeenCalledWith({
      where: { id: 12, userId: null },
      data: { slug: "nouvelle-adresse", statut: undefined },
    });
    expect(mocks.toFicheDto).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "nouvelle-adresse" }),
      undefined
    );
  });

  it("updates status without changing client ownership", async () => {
    mocks.ficheFindUnique
      .mockResolvedValueOnce({ id: 12 })
      .mockResolvedValueOnce({
        id: 12,
        userId: 9,
        subscriptions: [],
      });
    mocks.ficheUpdate.mockResolvedValue({
      id: 12,
      userId: 9,
      subscriptions: [],
    });

    await AdminService.updateFiche(12, { statut: "suspendue" });

    expect(mocks.ficheUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { statut: "SUSPENDUE" } })
    );
    expect(mocks.toFicheDto).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9 }),
      undefined
    );
  });

  it("persists a fiche suspension as SUSPENDUE", async () => {
    mocks.ficheFindUnique
      .mockResolvedValueOnce({ id: 12 })
      .mockResolvedValueOnce({
        id: 12,
        userId: 9,
        subscriptions: [],
      });
    mocks.ficheUpdate.mockResolvedValue({
      id: 12,
      userId: 9,
      subscriptions: [],
    });

    await AdminService.updateFiche(12, { statut: "suspendue" });

    expect(mocks.ficheUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12 },
        data: { statut: "SUSPENDUE" },
      })
    );
  });
});

describe("AdminService.listActionLogs", () => {
  it("returns recent action logs with pagination", async () => {
    const items = [
      {
        id: 21,
        adminName: "Root",
        adminEmail: "root@example.com",
        method: "PATCH",
        path: "/admin/settings",
        statusCode: 200,
        createdAt: new Date("2026-11-02T14:00:00Z"),
      },
    ];
    mocks.actionLogFindMany.mockResolvedValue(items);
    mocks.actionLogCount.mockResolvedValue(26);

    await expect(
      AdminService.listActionLogs({ page: 2, limit: 25 })
    ).resolves.toEqual({
      items,
      pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
    });

    expect(mocks.actionLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 25,
        take: 25,
      })
    );
  });
});

describe("AdminService.stats", () => {
  it("counts card requests in production but excludes delivered and cancelled cards", async () => {
    mocks.printJobCount.mockResolvedValue(3);
    mocks.ficheAggregate.mockResolvedValue({ _sum: { scansTotal: 0 } });
    mocks.userFindMany.mockResolvedValue([]);
    mocks.subscriptionFindMany.mockResolvedValue([]);

    const result = await AdminService.stats();

    expect(mocks.printJobCount).toHaveBeenCalledWith({
      where: {
        statut: { in: ["A_IMPRIMER", "IMPRIMEE", "ENCODEE", "TESTEE"] },
      },
    });
    expect(result.demandesCarte).toBe(3);
    expect(result.derniersClients).toEqual([]);
    expect(result.derniersAbonnements).toEqual([]);
  });

  it("returns the ten most recent clients and subscriptions", async () => {
    const createdAt = new Date("2026-11-02T10:00:00Z");
    mocks.userFindMany.mockResolvedValue([
      { id: 21, nom: "Awa Ndiaye", email: "awa@example.sn", createdAt },
    ]);
    mocks.subscriptionFindMany.mockResolvedValue([
      {
        id: 31,
        status: "ACTIVE",
        createdAt,
        amountFcfa: 25000,
        plan: { type: "PRO", nom: "Pro" },
        fiche: {
          id: 12,
          slug: "chez-awa",
          prenom: "Awa",
          nom: "Ndiaye",
          entreprise: "Chez Awa",
        },
      },
    ]);

    const result = await AdminService.stats();

    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    );
    expect(mocks.subscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    );
    expect(result.derniersClients[0]).toEqual({
      id: 21,
      nom: "Awa Ndiaye",
      email: "awa@example.sn",
      createdAt,
    });
    expect(result.derniersAbonnements[0]).toMatchObject({
      id: 31,
      formule: "pro",
      statut: "active",
      fiche: { id: 12, slug: "chez-awa", nom: "Awa Ndiaye" },
    });
  });
});

describe("AdminService.cancelSubscription", () => {
  it("persists cancellation for a subscription belonging to the selected fiche", async () => {
    mocks.subscriptionFindFirst.mockResolvedValue({
      id: 18,
      ficheId: 12,
      status: "ACTIVE",
    });
    mocks.subscriptionUpdate.mockImplementation(({ data }) =>
      Promise.resolve({ id: 18, ficheId: 12, ...data })
    );

    const result = await AdminService.cancelSubscription(12, 18);

    expect(mocks.subscriptionFindFirst).toHaveBeenCalledWith({
      where: { id: 18, ficheId: 12 },
    });
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: 18 },
      data: { status: "CANCELED", canceledAt: expect.any(Date) },
    });
    expect(result).toMatchObject({ status: "CANCELED" });
  });

  it("does not cancel a subscription belonging to another fiche", async () => {
    mocks.subscriptionFindFirst.mockResolvedValue(null);

    await expect(AdminService.cancelSubscription(12, 18)).rejects.toMatchObject(
      { status: 404 }
    );
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });
});

describe("AdminService.listFiches", () => {
  it("filtre sur les fiches ayant une demande de sticker en attente et la renvoie", async () => {
    const createdAt = new Date("2026-10-29T10:00:00Z");
    mocks.ficheFindMany.mockResolvedValue([
      {
        id: 12,
        slug: "chez-awa",
        prenom: "Awa",
        nom: "Ndiaye",
        entreprise: "Chez Awa",
        statut: "ACTIVE",
        scansTotal: 7,
        createdAt,
        user: null,
        subscriptions: [{ endsAt: null, plan: { type: "PRO" } }],
        sectionStickers: [
          { id: 8, section: "menu", quantite: 20, createdAt },
        ],
      },
    ]);
    mocks.ficheCount.mockResolvedValue(1);

    const result = await AdminService.listFiches({
      sticker: "demande",
      page: 1,
      limit: 20,
      tri: "recent",
    });

    expect(mocks.ficheFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ sectionStickers: { some: { statut: "DEMANDE" } } }],
        },
        select: expect.objectContaining({
          sectionStickers: expect.objectContaining({
            where: { statut: "DEMANDE" },
          }),
        }),
      })
    );
    expect(result).toMatchObject({
      fiches: [
        {
          id: 12,
          demandesSticker: [
            { id: 8, section: "menu", quantite: 20, createdAt },
          ],
        },
      ],
      pagination: { total: 1 },
    });
  });

  describe("AdminService billing lists", () => {
    it("filters subscriptions and payments linked to deleted fiches", async () => {
      mocks.subscriptionFindMany.mockResolvedValue([]);
      mocks.subscriptionCount.mockResolvedValue(0);
      mocks.paymentFindMany.mockResolvedValue([]);
      mocks.paymentCount.mockResolvedValue(0);

      await AdminService.listSubscriptions({
        ficheSupprimee: "oui",
        page: 1,
        limit: 20,
      });
      await AdminService.listPayments({
        ficheSupprimee: "non",
        page: 1,
        limit: 20,
      });

      expect(mocks.subscriptionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ ficheId: null }) })
      );
      expect(mocks.paymentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ficheId: { not: null } }),
        })
      );
    });

    it("returns filtered subscriptions with their associated payment id", async () => {
      const createdAt = new Date("2026-10-12T10:00:00Z");
      mocks.subscriptionFindMany.mockResolvedValue([
        {
          id: 31,
          status: "ACTIVE",
          startsAt: createdAt,
          endsAt: null,
          amountFcfa: 75000,
          paymentRef: "PAY-31",
          createdAt,
          ficheNomSnapshot: null,
          ficheSlugSnapshot: null,
          plan: { type: "SIGNATURE", nom: "Signature" },
          fiche: {
            id: 12,
            slug: "chez-awa",
            prenom: "Awa",
            nom: "Ndiaye",
            entreprise: "Chez Awa",
            user: { email: "awa@example.sn" },
          },
          payments: [{ id: 71 }],
        },
      ]);
      mocks.subscriptionCount.mockResolvedValue(1);

      const result = await AdminService.listSubscriptions({
        statut: "active",
        formule: "signature",
        from: "2026-10-01",
        to: "2026-10-31",
        page: 1,
        limit: 20,
      });

      expect(mocks.subscriptionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "ACTIVE",
            plan: { type: "SIGNATURE" },
            createdAt: {
              gte: new Date("2026-10-01"),
              lt: new Date("2026-11-01"),
            },
          }),
        })
      );
      expect(result.items[0]).toMatchObject({
        id: 31,
        formule: "signature",
        fiche: { id: 12, nom: "Awa Ndiaye", email: "awa@example.sn" },
        paiementId: 71,
      });
    });

    describe("AdminService.deleteFiche", () => {
      it("snapshots financial identity transactionally before deleting the fiche", async () => {
        mocks.transactionFicheFindUnique.mockResolvedValue({
          id: 12,
          prenom: "Awa",
          nom: "Ndiaye",
          slug: "chez-awa",
        });

        await AdminService.deleteFiche(12, "chez-awa");

        expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith({
          where: { ficheId: 12 },
          data: { ficheNomSnapshot: "Awa Ndiaye", ficheSlugSnapshot: "chez-awa" },
        });
        expect(mocks.paymentUpdateMany).toHaveBeenCalledWith({
          where: { ficheId: 12 },
          data: { ficheNomSnapshot: "Awa Ndiaye", ficheSlugSnapshot: "chez-awa" },
        });
        expect(mocks.transactionFicheDelete).toHaveBeenCalledWith({
          where: { id: 12 },
        });
      });
    });

    it("can focus a payment and return its associated subscription", async () => {
      const createdAt = new Date("2026-10-12T10:00:00Z");
      mocks.paymentFindMany.mockResolvedValue([
        {
          id: 71,
          status: "SUCCEEDED",
          provider: "WAVE",
          amountFcfa: 75000,
          currency: "XOF",
          providerReference: "PAY-71",
          failureReason: null,
          createdAt,
          paidAt: createdAt,
          ficheNomSnapshot: null,
          ficheSlugSnapshot: null,
          plan: { type: "SIGNATURE", nom: "Signature" },
          fiche: null,
          subscription: { id: 31 },
        },
      ]);
      mocks.paymentCount.mockResolvedValue(1);

      const result = await AdminService.listPayments({
        paymentId: 71,
        page: 1,
        limit: 20,
      });

      expect(mocks.paymentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 71 }) })
      );
      expect(result.items[0]).toMatchObject({
        id: 71,
        statut: "succeeded",
        fournisseur: "wave",
        abonnementId: 31,
      });
    });
  });
});
