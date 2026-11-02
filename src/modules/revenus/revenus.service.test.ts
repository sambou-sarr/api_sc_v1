import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscriptionFindMany: vi.fn(),
  ficheFindMany: vi.fn(),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    subscription: { findMany: mocks.subscriptionFindMany },
    fiche: { findMany: mocks.ficheFindMany },
  },
}));

import { RevenusService } from "./revenus.service";

beforeEach(() => vi.clearAllMocks());

describe("RevenusService.get", () => {
  it("uses the selected dates and returns daily revenue and fiche series", async () => {
    mocks.subscriptionFindMany
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-10-01T10:00:00Z"),
          amountFcfa: 5000,
          plan: { type: "PRO" },
        },
        {
          createdAt: new Date("2026-10-03T10:00:00Z"),
          amountFcfa: 1500,
          plan: { type: "SIGNATURE" },
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-09-28T10:00:00Z"),
          amountFcfa: 3000,
          plan: { type: "PRO" },
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.ficheFindMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-10-01T10:00:00Z") },
      { createdAt: new Date("2026-10-01T12:00:00Z") },
    ]);

    const result = await RevenusService.get({
      from: "2026-10-01",
      to: "2026-10-03",
    });

    expect(result).toMatchObject({
      grouping: "day",
      encaisse: {
        montantFcfa: 6500,
        periodePrecedenteFcfa: 3000,
        evolutionPct: 117,
      },
      encaissements: [
        { periode: "2026-10-01", montantFcfa: 5000, nbPaiements: 1 },
        { periode: "2026-10-02", montantFcfa: 0, nbPaiements: 0 },
        { periode: "2026-10-03", montantFcfa: 1500, nbPaiements: 1 },
      ],
      nouvellesFiches: [
        { periode: "2026-10-01", nombre: 2 },
        { periode: "2026-10-02", nombre: 0 },
        { periode: "2026-10-03", nombre: 0 },
      ],
      parFormule: {
        pro: { montantFcfa: 5000, nbPaiements: 1 },
        signature: { montantFcfa: 1500, nbPaiements: 1 },
      },
    });

    expect(mocks.subscriptionFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2026-10-01T00:00:00.000Z"),
            lt: new Date("2026-10-04T00:00:00.000Z"),
          },
        }),
      })
    );
    expect(mocks.subscriptionFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2026-09-28T00:00:00.000Z"),
            lt: new Date("2026-10-01T00:00:00.000Z"),
          },
        }),
      })
    );
  });

  it("groups a 30-day range by week to keep chart labels readable", async () => {
    mocks.subscriptionFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.ficheFindMany.mockResolvedValueOnce([]);

    const result = await RevenusService.get({
      from: "2026-10-01",
      to: "2026-10-30",
    });

    expect(result.grouping).toBe("week");
    expect(result.encaissements).toHaveLength(5);
    expect(result.nouvellesFiches).toHaveLength(5);
  });
});
