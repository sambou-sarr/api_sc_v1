import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  planFindMany: vi.fn(),
  emplacementFindUnique: vi.fn(),
  emplacementPackFindMany: vi.fn(),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    plan: { findMany: mocks.planFindMany },
    emplacementConfig: { findUnique: mocks.emplacementFindUnique },
    emplacementPack: { findMany: mocks.emplacementPackFindMany },
  },
}));

import { ParametresService } from "./parametres.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emplacementFindUnique.mockResolvedValue({ prixUnitaireFcfa: 1000 });
  mocks.emplacementPackFindMany.mockResolvedValue([]);
});

describe("ParametresService.grille", () => {
  it("garde les formules actives visibles et expose les remises par défaut sans réglages", async () => {
    mocks.planFindMany.mockResolvedValue([
      {
        type: "PRO",
        nom: "Pro",
        prixMensuelFcfa: null,
        prixFcfa: 15000,
        dureeMois: 12,
        actif: true,
        durees: [],
        remises: [],
      },
      {
        type: "SIGNATURE",
        nom: "Signature",
        prixMensuelFcfa: 5000,
        prixFcfa: 75000,
        dureeMois: 12,
        actif: true,
        durees: [{ dureeMois: 12, remisePct: 10 }],
        remises: [{ quantiteMin: 3, remisePct: 5 }],
      },
      {
        type: "ESSENTIELLE",
        nom: "Essentielle",
        prixMensuelFcfa: null,
        prixFcfa: 12000,
        dureeMois: 12,
        actif: false,
        durees: [],
        remises: [],
      },
    ]);

    const result = await ParametresService.grille();

    expect(result.formules.map(formule => formule.formule)).toEqual([
      "pro",
      "signature",
    ]);
    expect(result.formules[0].prixMensuelFcfa).toBeNull();
    expect(result.formules[0].durees).toEqual([
      { dureeMois: 1, remisePct: 0 },
      { dureeMois: 3, remisePct: 10 },
      { dureeMois: 12, remisePct: 20 },
    ]);
    expect(result.formules[0].remises).toEqual([
      { quantiteMin: 10, remisePct: 10 },
      { quantiteMin: 50, remisePct: 20 },
    ]);
    expect(result.formules[1]).toMatchObject({
      prixMensuelFcfa: 5000,
      durees: [{ dureeMois: 12, remisePct: 10 }],
      remises: [{ quantiteMin: 3, remisePct: 5 }],
    });
  });
});
