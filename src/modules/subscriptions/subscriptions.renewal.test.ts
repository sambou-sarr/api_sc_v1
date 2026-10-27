import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Le renouvellement d'une fiche dont l'abonnement est échu passe par le même parcours que l'upgrade :
  une fiche sans abonnement valide est traitée comme Essentielle, donc toute formule payante est acceptée.
  Ces tests fixent ce comportement, sur lequel s'appuie le client (bouton « Renouveler »).
*/
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  ficheFindUnique: vi.fn(),
  subscriptionFindFirst: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  subscriptionCreate: vi.fn(),
  planFindUnique: vi.fn(),
  paymentCreate: vi.fn(),
  tarif: vi.fn(),
}));

vi.mock("../../config/env", () => ({
  env: { NODE_ENV: "test", REQUIRE_EMAIL_VERIFICATION: false },
}));
vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("../parametres/parametres.service", () => ({
  ParametresService: { tarif: mocks.tarif },
}));
vi.mock("../fiches/fiches.dto", () => ({ ficheInclude: {}, toFicheDto: vi.fn() }));

import { upgrade } from "./subscriptions.service";

const user = { id: 7, role: "CLIENT", emailVerified: true } as never;
const tx = {
  fiche: { findUnique: mocks.ficheFindUnique },
  subscription: {
    findFirst: mocks.subscriptionFindFirst,
    updateMany: mocks.subscriptionUpdateMany,
    create: mocks.subscriptionCreate,
  },
  plan: { findUnique: mocks.planFindUnique },
  payment: { create: mocks.paymentCreate },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  mocks.ficheFindUnique.mockResolvedValue({ id: 10, userId: 7, statut: "ACTIVE" });
  mocks.planFindUnique.mockResolvedValue({ id: 2, actif: true, dureeMois: 12 });
  mocks.tarif.mockResolvedValue({ totalFcfa: 27000 });
  mocks.paymentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 99,
    providerReference: data.providerReference,
    amountFcfa: data.amountFcfa,
  }));
});

describe("renouvellement d'une fiche expirée", () => {
  it("accepte la MÊME formule : sans abonnement valide, la fiche est traitée comme Essentielle", async () => {
    mocks.subscriptionFindFirst.mockResolvedValue(null); // abonnement échu : aucun abonnement effectif

    const res = await upgrade(user, 10, "PRO", 12);

    expect(res.payment).toMatchObject({ status: "pending", dureeMois: 12, amountFcfa: 27000 });
    expect(mocks.tarif).toHaveBeenCalledWith("pro", 12, 1, tx); // prix calculé par le serveur
    expect(mocks.paymentCreate.mock.calls[0][0].data).toMatchObject({ ficheId: 10, status: "PENDING" });
    // aucune formule n'est activée avant la confirmation du paiement
    expect(mocks.subscriptionCreate).not.toHaveBeenCalled();
  });

  it("accepte aussi une formule différente (Signature après un Pro échu)", async () => {
    mocks.subscriptionFindFirst.mockResolvedValue(null);
    await expect(upgrade(user, 10, "SIGNATURE", 3)).resolves.toBeTruthy();
  });

  it("refuse de « renouveler » la même formule tant que l'abonnement est valide (limite actuelle)", async () => {
    mocks.subscriptionFindFirst.mockResolvedValue({ plan: { type: "PRO" } });
    await expect(upgrade(user, 10, "PRO", 12)).rejects.toMatchObject({
      status: 409,
      code: "FORMULE_NON_SUPERIEURE",
    });
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });

  it("refuse une fiche suspendue", async () => {
    mocks.ficheFindUnique.mockResolvedValue({ id: 10, userId: 7, statut: "SUSPENDUE" });
    await expect(upgrade(user, 10, "PRO", 12)).rejects.toMatchObject({ code: "FICHE_SUSPENDUE" });
  });

  it("refuse la fiche d'un autre client", async () => {
    mocks.ficheFindUnique.mockResolvedValue({ id: 10, userId: 999, statut: "ACTIVE" });
    await expect(upgrade(user, 10, "PRO", 12)).rejects.toMatchObject({ status: 404 });
  });
});
