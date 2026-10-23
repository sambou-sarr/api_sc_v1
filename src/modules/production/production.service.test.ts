import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ficheFindFirst: vi.fn(),
  printFindFirst: vi.fn(),
  printCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    fiche: { findFirst: mocks.ficheFindFirst },
    printJob: { findFirst: mocks.printFindFirst },
    $transaction: mocks.transaction,
  },
}));

import type { AuthUser } from "../../types/user";
import { ProductionService } from "./production.service";

const user: AuthUser = { id: 4, role: "CLIENT", emailVerified: true };
const fiche = {
  id: 12,
  slug: "awa-ndiaye",
  prenom: "Awa",
  nom: "Ndiaye",
  entreprise: "Studio",
  telephone: "770000000",
  email: "awa@example.com",
  fonction: "Créatrice",
  statut: "ACTIVE",
  subscriptions: [{ plan: { type: "PRO" } }],
};
const job = {
  id: 31,
  ficheId: fiche.id,
  tier: "PRO",
  formule: "pro",
  slug: fiche.slug,
  nfcUrl: "https://supportconnecte.com/f/awa-ndiaye",
  rectoUrl: null,
  versoUrl: null,
  design: null,
  statut: "A_IMPRIMER",
  deliveryAddress: "Dakar, Plateau",
  deliveryTelephone: "770000000",
  clientNotes: null,
  amountFcfa: 12_000,
  printedAt: null,
  encodedAt: null,
  testedAt: null,
  deliveredAt: null,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  clientNom: "Awa Ndiaye",
  clientEntreprise: "Studio",
  clientTelephone: "770000000",
  clientEmail: "awa@example.com",
  clientFonction: "Créatrice",
};

const tx = {
  fiche: { findFirst: mocks.ficheFindFirst },
  printJob: { findFirst: mocks.printFindFirst, create: mocks.printCreate },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    (callback: (transaction: typeof tx) => unknown) => callback(tx),
  );
  mocks.ficheFindFirst.mockResolvedValue(fiche);
  mocks.printFindFirst.mockResolvedValue(null);
  mocks.printCreate.mockImplementation(({ data }) =>
    Promise.resolve({ ...job, ...data, fiche }),
  );
});

describe("ProductionService.requestClientCarte", () => {
  const input = {
    adresseLivraison: "Dakar, Plateau",
    telephoneLivraison: "770000000",
  };

  it("creates a card using the fiche subscription and server price", async () => {
    const result = await ProductionService.requestClientCarte(user, fiche.id, input);

    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(mocks.printCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ficheId: fiche.id,
          tier: "PRO",
          amountFcfa: 12_000,
          deliveryAddress: input.adresseLivraison,
          deliveryTelephone: input.telephoneLivraison,
        }),
      }),
    );
    expect(result.carte).toMatchObject({
      id: job.id,
      tier: "pro",
      montantFcfa: 12_000,
      statut: "a_imprimer",
    });
  });

  it("rejects unpublished fiches before creating a job", async () => {
    mocks.ficheFindFirst.mockResolvedValue({ ...fiche, statut: "BROUILLON" });

    await expect(
      ProductionService.requestClientCarte(user, fiche.id, input),
    ).rejects.toMatchObject({
      status: 403,
      code: "FICHE_NON_PUBLIEE",
    });
    expect(mocks.printCreate).not.toHaveBeenCalled();
  });

  it("rejects an active request already in production", async () => {
    mocks.printFindFirst.mockResolvedValue({ id: 25 });

    await expect(
      ProductionService.requestClientCarte(user, fiche.id, input),
    ).rejects.toMatchObject({
      status: 409,
      code: "CARTE_DEJA_EN_COURS",
    });
    expect(mocks.printCreate).not.toHaveBeenCalled();
  });
});
