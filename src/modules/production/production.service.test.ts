import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ficheFindFirst: vi.fn(),
  ficheFindUnique: vi.fn(),
  printFindFirst: vi.fn(),
  printFindUnique: vi.fn(),
  printUpdate: vi.fn(),
  printCreate: vi.fn(),
  cardModelFindFirst: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    fiche: { findFirst: mocks.ficheFindFirst, findUnique: mocks.ficheFindUnique },
    printJob: {
      findFirst: mocks.printFindFirst,
      findUnique: mocks.printFindUnique,
      create: mocks.printCreate,
      update: mocks.printUpdate,
    },
    cardModel: { findFirst: mocks.cardModelFindFirst },
    $transaction: mocks.transaction,
  },
}));

import { env } from "../../config/env";
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
  nfcUrl: `${env.PUBLIC_SITE_URL}/f/awa-ndiaye`,
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
  printJob: {
    findFirst: mocks.printFindFirst,
    findUnique: mocks.printFindUnique,
    create: mocks.printCreate,
    update: mocks.printUpdate,
  },
  cardModel: { findFirst: mocks.cardModelFindFirst },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    (callback: (transaction: typeof tx) => unknown) => callback(tx)
  );
  mocks.ficheFindFirst.mockResolvedValue(fiche);
  mocks.ficheFindUnique.mockResolvedValue(fiche);
  mocks.printFindFirst.mockResolvedValue(null);
  mocks.cardModelFindFirst.mockResolvedValue({
    rectoUrl: "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000001.webp",
    versoUrl: "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000002.webp",
  });
  mocks.printFindUnique.mockResolvedValue({
    statut: "A_IMPRIMER",
    printedAt: null,
    encodedAt: null,
    testedAt: null,
    deliveredAt: null,
    nfcUrl: `${env.PUBLIC_SITE_URL}/f/awa-ndiaye`,
    fiche: { slug: "awa-ndiaye" },
  });
  mocks.printCreate.mockImplementation(({ data }) =>
    Promise.resolve({ ...job, ...data, fiche })
  );
  mocks.printUpdate.mockImplementation(({ data }) =>
    Promise.resolve({ ...job, ...data, fiche })
  );
});

describe("ProductionService.requestClientCarte", () => {
  const input = {
    adresseLivraison: "Dakar, Plateau",
    telephoneLivraison: "770000000",
  };

  it("creates a card using the fiche subscription and server price", async () => {
    const result = await ProductionService.requestClientCarte(
      user,
      fiche.id,
      input
    );

    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });

    expect(mocks.printCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ficheId: fiche.id,
          tier: "PRO",
          rectoUrl: "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000001.webp",
          versoUrl: "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000002.webp",
          amountFcfa: 12_000,
          deliveryAddress: input.adresseLivraison,
          deliveryTelephone: input.telephoneLivraison,
        }),
      })
    );
    expect(result.carte).toMatchObject({
      id: job.id,
      tier: "pro",
      montantFcfa: 12_000,
      statut: "a_imprimer",
      rectoUrl: "http://localhost:4000/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000001.webp",
    });
  });

  it("keeps no card-model images when the formula has no active model", async () => {
    mocks.cardModelFindFirst.mockResolvedValue(null);

    await ProductionService.requestClientCarte(user, fiche.id, input);

    expect(mocks.printCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rectoUrl: null, versoUrl: null }),
      })
    );
  });

  describe("ProductionService.updateCarte", () => {
    it("persists the selected status and its transition timestamp", async () => {
      const result = await ProductionService.updateCarte(31, {
        statut: "imprimee",
      });

      expect(mocks.printUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 31 },
          data: expect.objectContaining({
            statut: "IMPRIMEE",
            printedAt: expect.any(Date),
          }),
        })
      );
      expect(result.carte.statut).toBe("imprimee");
    });

    it("rejects a status that skips production steps without writing it", async () => {
      await expect(
        ProductionService.updateCarte(31, { statut: "livree" })
      ).rejects.toMatchObject({ status: 422 });

      expect(mocks.printUpdate).not.toHaveBeenCalled();
    });

    it("does not deliver a card if the fiche address changed", async () => {
      mocks.printFindUnique.mockResolvedValue({
        statut: "TESTEE",
        printedAt: new Date("2026-01-02T00:00:00.000Z"),
        encodedAt: new Date("2026-01-03T00:00:00.000Z"),
        testedAt: new Date("2026-01-04T00:00:00.000Z"),
        deliveredAt: null,
        nfcUrl: `${env.PUBLIC_SITE_URL}/f/old-slug`,
        fiche: { slug: "new-slug" },
      });

      await expect(
        ProductionService.updateCarte(31, { statut: "livree" })
      ).rejects.toMatchObject({ status: 422 });
      expect(mocks.printUpdate).not.toHaveBeenCalled();
    });
  });

  describe("ProductionService.updateCarte : image persistence", () => {
    it("normalizes an uploaded image URL before storing it", async () => {
      await ProductionService.updateCarte(31, {
        rectoUrl: "http://localhost:4000/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000001.webp",
      });

      expect(mocks.printUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 31 },
          data: { rectoUrl: "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000001.webp" },
        })
      );
    });

    it("refuses image changes after printing has started", async () => {
      mocks.printFindUnique.mockResolvedValue({
        statut: "IMPRIMEE",
        printedAt: new Date("2026-01-02T00:00:00.000Z"),
        encodedAt: null,
        testedAt: null,
        deliveredAt: null,
        nfcUrl: `${env.PUBLIC_SITE_URL}/f/awa-ndiaye`,
        fiche: { slug: "awa-ndiaye" },
      });

      await expect(
        ProductionService.updateCarte(31, {
          rectoUrl: "https://cdn.example/recto.webp",
        })
      ).rejects.toMatchObject({
        status: 422,
        code: "FICHIERS_CARTE_VERROUILLES",
      });
      expect(mocks.printUpdate).not.toHaveBeenCalled();
    });
  });

  it("rejects unpublished fiches before creating a job", async () => {
    mocks.ficheFindFirst.mockResolvedValue({ ...fiche, statut: "BROUILLON" });

    await expect(
      ProductionService.requestClientCarte(user, fiche.id, input)
    ).rejects.toMatchObject({
      status: 403,
      code: "FICHE_NON_PUBLIEE",
    });
    expect(mocks.printCreate).not.toHaveBeenCalled();
  });

  it("rejects an active request already in production", async () => {
    mocks.printFindFirst.mockResolvedValue({ id: 25 });

    await expect(
      ProductionService.requestClientCarte(user, fiche.id, input)
    ).rejects.toMatchObject({
      status: 409,
      code: "CARTE_DEJA_EN_COURS",
    });
    expect(mocks.printCreate).not.toHaveBeenCalled();
  });
});

describe("ProductionService.createCarte : modèle figé sur la commande", () => {
  it("uses the active model of the selected formula", async () => {
    await ProductionService.createCarte({ ficheId: fiche.id, tier: "signature" });

    expect(mocks.cardModelFindFirst).toHaveBeenCalledWith({
      where: { tier: "SIGNATURE", actif: true },
      select: { rectoUrl: true, versoUrl: true },
    });
    expect(mocks.printCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tier: "SIGNATURE",
          rectoUrl: "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000001.webp",
          versoUrl: "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000002.webp",
        }),
      })
    );
  });
});
