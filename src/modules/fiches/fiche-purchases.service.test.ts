import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  planFindUnique: vi.fn(),
  ficheCount: vi.fn(),
  purchasesAggregate: vi.fn(),
  purchasesCreate: vi.fn(),
  purchasesFindFirst: vi.fn(),
  purchasesUpdateMany: vi.fn(),
  paymentCreateMany: vi.fn(),
  transaction: vi.fn(),
  tarifEmplacements: vi.fn(),
  tarifCommande: vi.fn(),
  createPurchasedFiches: vi.fn(),
}));

vi.mock("../../config/env", () => ({
  env: {
    NODE_ENV: "test",
    REQUIRE_EMAIL_VERIFICATION: false,
    MAX_FICHES_PER_USER: 3,
  },
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    plan: { findUnique: mocks.planFindUnique },
    fiche: { count: mocks.ficheCount },
    fichePurchase: {
      aggregate: mocks.purchasesAggregate,
      create: mocks.purchasesCreate,
      findFirst: mocks.purchasesFindFirst,
      updateMany: mocks.purchasesUpdateMany,
    },
    payment: { createMany: mocks.paymentCreateMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../parametres/parametres.service", () => ({
  ParametresService: {
    tarifEmplacements: mocks.tarifEmplacements,
    tarifCommande: mocks.tarifCommande,
  },
}));

vi.mock("./services/fiches.service", () => ({
  createPurchasedFiches: mocks.createPurchasedFiches,
}));

import { FichePurchasesService } from "./services/fiche-purchases.service";
import type { AuthUser } from "../../types/user";

const user: AuthUser = { id: 7, role: "CLIENT", emailVerified: true };
const essentialPlan = {
  id: 1,
  type: "ESSENTIELLE",
  nom: "Essentielle",
  actif: true,
  themeDefaut: "BLEU",
  limits: { tabsAutorises: ["PRESENTATION"] },
};

const db = {
  plan: { findUnique: mocks.planFindUnique },
  fiche: { count: mocks.ficheCount },
  fichePurchase: {
    aggregate: mocks.purchasesAggregate,
    create: mocks.purchasesCreate,
    findFirst: mocks.purchasesFindFirst,
    updateMany: mocks.purchasesUpdateMany,
  },
  payment: { createMany: mocks.paymentCreateMany },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    async (callback: (tx: typeof db) => unknown) => callback(db),
  );
  mocks.ficheCount.mockResolvedValue(0);
  mocks.purchasesAggregate.mockResolvedValue({ _sum: { quantity: 0 } });
});

describe("FichePurchasesService.quote", () => {
  it("applique d'abord les places gratuites puis chiffre les emplacements payants", async () => {
    mocks.ficheCount.mockResolvedValue(2);
    mocks.planFindUnique.mockResolvedValue(essentialPlan);
    mocks.tarifEmplacements.mockResolvedValue({
      totalFcfa: 2000,
      totalSansPackFcfa: 2000,
      economieFcfa: 0,
      detail: { unitaires: 2, packs: [] },
    });

    const quote = await FichePurchasesService.quote(user, {
      plan: "essentielle",
      quantity: 3,
    });

    expect(quote).toMatchObject({
      freeQuantity: 1,
      paidQuantity: 2,
      totalFcfa: 2000,
    });
    expect(mocks.tarifEmplacements).toHaveBeenCalledWith(2, expect.anything());
  });

  it("calcule une commande Pro avec durée et remise de quantité", async () => {
    const proPlan = { ...essentialPlan, id: 2, type: "PRO", nom: "Pro" };
    mocks.ficheCount.mockResolvedValue(1);
    mocks.planFindUnique.mockResolvedValue(proPlan);
    mocks.tarifCommande.mockResolvedValue({
      totalFcfa: 27000,
      lignes: [{ totalFcfa: 27000, remiseQuantitePct: 10 }],
    });

    const quote = await FichePurchasesService.quote(user, {
      plan: "pro",
      quantity: 3,
      dureeMois: 12,
    });

    expect(mocks.tarifCommande).toHaveBeenCalledWith(
      {
        lignes: [{ formule: "pro", dureeMois: 12, quantite: 3 }],
      },
      expect.anything(),
    );
    expect(quote).toMatchObject({
      freeQuantity: 0,
      paidQuantity: 3,
      totalFcfa: 27000,
    });
    expect(mocks.tarifEmplacements).not.toHaveBeenCalled();
  });
});

describe("FichePurchasesService.create / confirmSimulated", () => {
  it("enregistre le paiement en attente sans créer les fiches avant confirmation", async () => {
    mocks.ficheCount.mockResolvedValue(3);
    mocks.planFindUnique.mockResolvedValue(essentialPlan);
    mocks.tarifEmplacements.mockResolvedValue({
      totalFcfa: 1000,
      totalSansPackFcfa: 1000,
      economieFcfa: 0,
      detail: { unitaires: 1, packs: [] },
    });
    mocks.purchasesCreate.mockResolvedValue({
      id: 12,
      reference: "SIMULATED-order",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await FichePurchasesService.create(user, {
      plan: "essentielle",
      quantity: 1,
    });

    expect(result.purchase).toMatchObject({ id: 12, status: "pending" });
    expect(mocks.createPurchasedFiches).not.toHaveBeenCalled();
    expect(mocks.paymentCreateMany).not.toHaveBeenCalled();
  });

  it("ne crée le lot qu’une fois et enregistre chaque paiement confirmé", async () => {
    const purchase = {
      id: 14,
      userId: user.id,
      planId: essentialPlan.id,
      quantity: 2,
      freeQuantity: 1,
      dureeMois: null,
      amountFcfa: 1000,
      status: "PENDING",
      reference: "SIMULATED-order-14",
      expiresAt: new Date(Date.now() + 60_000),
      plan: essentialPlan,
    };
    mocks.purchasesFindFirst
      .mockResolvedValueOnce(purchase)
      .mockResolvedValueOnce({ ...purchase, status: "CONFIRMED" });
    mocks.purchasesUpdateMany.mockResolvedValue({ count: 1 });
    mocks.createPurchasedFiches.mockResolvedValue([
      {
        ficheId: 21,
        subscriptionId: 31,
        amountFcfa: 0,
        paymentRef: null,
        fiche: { id: 21 },
      },
      {
        ficheId: 22,
        subscriptionId: 32,
        amountFcfa: 1000,
        paymentRef: "SIMULATED-order-14-2",
        fiche: { id: 22 },
      },
    ]);

    const result = await FichePurchasesService.confirmSimulated(user, 14);

    expect(result.fiches).toHaveLength(2);
    expect(mocks.createPurchasedFiches).toHaveBeenCalledTimes(1);
    expect(mocks.createPurchasedFiches).toHaveBeenCalledWith(
      expect.anything(),
      user.id,
      essentialPlan,
      [0, 1000],
      null,
      purchase.reference,
    );
    expect(mocks.paymentCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.paymentCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            amountFcfa: 1000,
            status: "SUCCEEDED",
            providerReference: "SIMULATED-order-14-2",
          }),
        ]),
      }),
    );
    await expect(
      FichePurchasesService.confirmSimulated(user, 14),
    ).rejects.toMatchObject({ code: "COMMANDE_NON_EN_ATTENTE" });
    expect(mocks.createPurchasedFiches).toHaveBeenCalledTimes(1);
  });
});
