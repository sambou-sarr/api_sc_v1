import { beforeEach, describe, expect, it, vi } from "vitest";

/* GET /fiches/:id/card-request : le client reçoit aussi le modèle (recto / verso) de la formule qui sera facturée. */
const mocks = vi.hoisted(() => ({
  ficheFindFirst: vi.fn(),
  printJobFindFirst: vi.fn(),
  cardModelFindFirst: vi.fn(),
}));
vi.mock("../../config/env", () => ({ env: { SERVER: "http://localhost:4000/api" } }));
vi.mock("../../infrastructure/storage/s3.storage", () => ({ S3StorageProvider: class {} }));
vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    fiche: { findFirst: mocks.ficheFindFirst },
    printJob: { findFirst: mocks.printJobFindFirst },
    cardModel: { findFirst: mocks.cardModelFindFirst },
  },
}));

import { ProductionService } from "./production.service";

const user = { id: 7, role: "CLIENT" } as never;
const modele = (tier: string) => ({
  id: 3, tier, nom: "Modèle", rectoUrl: "https://cdn/r.png", versoUrl: "https://cdn/v.png",
  actif: true, createdAt: new Date(), updatedAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.printJobFindFirst.mockResolvedValue(null);
});

describe("ProductionService.getClientCardRequest : modèle de carte", () => {
  it("renvoie le modèle actif de la formule de l'abonnement valide", async () => {
    mocks.ficheFindFirst.mockResolvedValue({ id: 1, subscriptions: [{ plan: { type: "SIGNATURE" } }] });
    mocks.cardModelFindFirst.mockResolvedValue(modele("SIGNATURE"));

    const res = await ProductionService.getClientCardRequest(user, 1);

    expect(mocks.cardModelFindFirst).toHaveBeenCalledWith({ where: { tier: "SIGNATURE", actif: true } });
    expect(res.modele).toEqual({ id: 3, tier: "signature", nom: "Modèle", rectoUrl: "https://cdn/r.png", versoUrl: "https://cdn/v.png" });
    expect(res.carte).toBeNull();
  });

  it("sans abonnement valide (fiche échue) : modèle Essentielle, comme le prix facturé", async () => {
    mocks.ficheFindFirst.mockResolvedValue({ id: 1, subscriptions: [] });
    mocks.cardModelFindFirst.mockResolvedValue(null);
    const res = await ProductionService.getClientCardRequest(user, 1);
    expect(mocks.cardModelFindFirst).toHaveBeenCalledWith({ where: { tier: "ESSENTIELLE", actif: true } });
    expect(res.modele).toBeNull(); // aucun modèle défini : le client garde l'aperçu par défaut
  });

  it("ne cherche que parmi les fiches du client connecté", async () => {
    mocks.ficheFindFirst.mockResolvedValue(null);
    await expect(ProductionService.getClientCardRequest(user, 1)).rejects.toMatchObject({ status: 404 });
    expect(mocks.ficheFindFirst.mock.calls[0][0].where).toEqual({ id: 1, userId: 7 });
    expect(mocks.cardModelFindFirst).not.toHaveBeenCalled();
  });
});
