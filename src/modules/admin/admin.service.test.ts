import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ficheFindUnique: vi.fn(),
  ficheFindFirst: vi.fn(),
  ficheUpdate: vi.fn(),
  toFicheDto: vi.fn(() => ({ id: 12 })),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    fiche: {
      findUnique: mocks.ficheFindUnique,
      findFirst: mocks.ficheFindFirst,
      update: mocks.ficheUpdate,
    },
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
