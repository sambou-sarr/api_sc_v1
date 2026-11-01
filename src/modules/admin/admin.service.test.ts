import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ficheFindUnique: vi.fn(),
  ficheFindFirst: vi.fn(),
  ficheFindMany: vi.fn(),
  ficheCount: vi.fn(),
  ficheUpdate: vi.fn(),
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
  mocks.transaction.mockImplementation((queries: Promise<unknown>[]) =>
    Promise.all(queries)
  );
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
});
