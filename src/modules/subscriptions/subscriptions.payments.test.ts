import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentFindMany: vi.fn(),
  paymentCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    payment: {
      findMany: mocks.paymentFindMany,
      count: mocks.paymentCount,
    },
    $transaction: mocks.transaction,
  },
}));

import { listPaymentsForUser } from "./subscriptions.service";

const client = { id: 7, role: "CLIENT" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((queries: Promise<unknown>[]) =>
    Promise.all(queries),
  );
  mocks.paymentFindMany.mockResolvedValue([
    {
      id: 99,
      status: "SUCCEEDED",
      plan: { type: "PRO", nom: "Pro" },
      provider: "SIMULATION",
      amountFcfa: 27000,
      currency: "XOF",
      providerReference: "PAY-99",
      failureReason: null,
      createdAt: new Date("2026-11-01T10:00:00Z"),
      paidAt: new Date("2026-11-01T10:00:00Z"),
      dureeMois: 12,
      fiche: {
        id: 10,
        slug: "salon-awa",
        prenom: "Awa",
        nom: "Ndiaye",
        entreprise: "Salon Awa",
      },
      ficheNomSnapshot: null,
      ficheSlugSnapshot: null,
    },
  ]);
  mocks.paymentCount.mockResolvedValue(1);
});

describe("listPaymentsForUser", () => {
  it("limits the history to the signed-in client and returns paginated payment data", async () => {
    const result = await listPaymentsForUser(client, 2, 10);

    expect(mocks.paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7 },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.items[0]).toMatchObject({
      id: 99,
      statut: "succeeded",
      formule: "pro",
      fiche: {
        id: 10,
        slug: "salon-awa",
        nom: "Awa Ndiaye",
        entreprise: "Salon Awa",
      },
    });
    expect(result.pagination).toMatchObject({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns deleted fiche snapshots when the owner remains on the payment", async () => {
    mocks.paymentFindMany.mockResolvedValue([
      {
        id: 100,
        status: "SUCCEEDED",
        plan: { type: "SIGNATURE", nom: "Signature" },
        provider: "WAVE",
        amountFcfa: 75000,
        currency: "XOF",
        providerReference: "PAY-100",
        failureReason: null,
        createdAt: new Date("2026-11-01T10:00:00Z"),
        paidAt: new Date("2026-11-01T10:00:00Z"),
        dureeMois: 12,
        fiche: null,
        ficheNomSnapshot: "Awa Ndiaye",
        ficheSlugSnapshot: "salon-awa",
      },
    ]);

    const result = await listPaymentsForUser(client);

    expect(result.items[0].fiche).toEqual({
      id: null,
      slug: "salon-awa",
      nom: "Awa Ndiaye",
      entreprise: null,
    });
  });

  it("rejects non-client accounts", async () => {
    await expect(
      listPaymentsForUser({ id: 1, role: "ADMIN" } as never),
    ).rejects.toMatchObject({ code: "ACCES_REFUSE" });
    expect(mocks.paymentFindMany).not.toHaveBeenCalled();
  });
});
