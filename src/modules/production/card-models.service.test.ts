import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../../database/prisma/prisma-client", () => {
  const cardModel = {
    findMany: mocks.findMany,
    findFirst: mocks.findFirst,
    findUnique: mocks.findUnique,
    create: mocks.create,
    update: mocks.update,
    updateMany: mocks.updateMany,
    deleteMany: mocks.deleteMany,
  };
  return { prisma: { cardModel, $transaction: mocks.transaction } };
});

import { Prisma } from "../../database/prisma/generated/prisma/client";
import { createModeleCarteSchema, patchModeleCarteSchema } from "./card-models.schemas";
import { CardModelService } from "./card-models.service";

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  tier: "PRO",
  nom: "Pro noir mat",
  rectoUrl: "https://res.cloudinary.com/x/recto.png",
  versoUrl: "https://res.cloudinary.com/x/verso.png",
  actif: false,
  createdAt: new Date("2026-10-27"),
  updatedAt: new Date("2026-10-27"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  const tx = {
    cardModel: {
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  };
  mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
  mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
});

describe("CardModelService.list", () => {
  it("trie par formule, modèle actif en premier, et renvoie la formule en minuscules", async () => {
    mocks.findMany.mockResolvedValue([row({ tier: "SIGNATURE", actif: true })]);
    const { modeles } = await CardModelService.list();
    expect(mocks.findMany.mock.calls[0][0].orderBy).toEqual([
      { tier: "asc" },
      { actif: "desc" },
      { createdAt: "desc" },
    ]);
    expect(modeles[0]).toMatchObject({ tier: "signature", actif: true });
  });
});

describe("CardModelService.create", () => {
  const input = { tier: "pro" as const, nom: "Pro noir mat", rectoUrl: row().rectoUrl, versoUrl: row().versoUrl };

  it("crée un modèle inactif par défaut, sans toucher aux autres", async () => {
    const { modele } = await CardModelService.create(input);
    expect(modele.actif).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ tier: "PRO", actif: false });
  });

  it("créé actif : désactive d'abord l'ancien modèle actif de la MÊME formule", async () => {
    await CardModelService.create({ ...input, actif: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { tier: "PRO", actif: true }, data: { actif: false } });
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
  });

  it("deux activations simultanées : l'index unique refuse la seconde (409)", async () => {
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" })
    );
    await expect(CardModelService.create({ ...input, actif: true })).rejects.toMatchObject({
      status: 409,
      code: "MODELE_ACTIF_EXISTANT",
    });
  });
});

describe("CardModelService.update", () => {
  it("activer un modèle désactive les autres de sa formule (pas lui-même)", async () => {
    mocks.findUnique.mockResolvedValue(row({ id: 5, tier: "SIGNATURE" }));
    await CardModelService.update(5, { actif: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { tier: "SIGNATURE", actif: true, id: { not: 5 } },
      data: { actif: false },
    });
  });

  it("désactiver ou renommer ne touche pas aux autres modèles", async () => {
    mocks.findUnique.mockResolvedValue(row({ id: 5 }));
    await CardModelService.update(5, { actif: false });
    await CardModelService.update(5, { nom: "Nouveau nom" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    mocks.findUnique.mockResolvedValue(row());
    await CardModelService.update(1, { nom: "Autre" });
    expect(mocks.update.mock.calls[0][0].data).toEqual({ nom: "Autre" });
  });

  it("modèle inconnu : 404", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(CardModelService.update(99, { nom: "x" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("CardModelService.remove / activeFor", () => {
  it("supprime un modèle", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    await expect(CardModelService.remove(1)).resolves.toEqual({ ok: true });
  });

  it("modèle inconnu : 404", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    await expect(CardModelService.remove(99)).rejects.toMatchObject({ status: 404 });
  });

  it("activeFor : vue client sans état ni dates ; null quand aucun modèle n'est actif", async () => {
    mocks.findFirst.mockResolvedValueOnce(row({ actif: true }));
    const m = await CardModelService.activeFor("PRO");
    expect(m).toEqual({ id: 1, tier: "pro", nom: "Pro noir mat", rectoUrl: row().rectoUrl, versoUrl: row().versoUrl });
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { tier: "PRO", actif: true } });
    mocks.findFirst.mockResolvedValueOnce(null);
    expect(await CardModelService.activeFor("ESSENTIELLE")).toBeNull();
  });
});

describe("validation des modèles de carte", () => {
  const ok = { tier: "pro", nom: "Pro", rectoUrl: "https://cdn.exemple.sn/r.png", versoUrl: "https://cdn.exemple.sn/v.png" };

  it("accepte un modèle valide", () => {
    expect(createModeleCarteSchema.safeParse(ok).success).toBe(true);
  });
  it.each([
    ["adresse http (non sécurisée)", { ...ok, rectoUrl: "http://cdn.exemple.sn/r.png" }],
    ["adresse javascript:", { ...ok, versoUrl: "javascript:alert(1)" }],
    ["formule inconnue", { ...ok, tier: "platine" }],
    ["nom vide", { ...ok, nom: "   " }],
    ["champ inattendu", { ...ok, prix: 1 }],
    ["recto manquant", { tier: "pro", nom: "Pro", versoUrl: ok.versoUrl }],
  ])("refuse : %s", (_label, body) => {
    expect(createModeleCarteSchema.safeParse(body).success).toBe(false);
  });
  it("une modification doit changer au moins un champ", () => {
    expect(patchModeleCarteSchema.safeParse({}).success).toBe(false);
    expect(patchModeleCarteSchema.safeParse({ actif: true }).success).toBe(true);
  });
});
