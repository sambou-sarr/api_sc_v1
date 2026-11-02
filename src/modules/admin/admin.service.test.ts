import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ficheFindUnique: vi.fn(),
  ficheFindFirst: vi.fn(),
  ficheFindMany: vi.fn(),
  ficheCount: vi.fn(),
  ficheUpdate: vi.fn(),
  transactionFicheFindUnique: vi.fn(),
  transactionFicheDelete: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  paymentUpdateMany: vi.fn(),
  subscriptionFindMany: vi.fn(),
  subscriptionCount: vi.fn(),
  paymentFindMany: vi.fn(),
  paymentCount: vi.fn(),
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
      update: mocks.ficheUpdate,
    },
    subscription: {
      findMany: mocks.subscriptionFindMany,
      count: mocks.subscriptionCount,
      updateMany: mocks.subscriptionUpdateMany,
    },
    payment: {
      findMany: mocks.paymentFindMany,
      count: mocks.paymentCount,
      updateMany: mocks.paymentUpdateMany,
    },
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
