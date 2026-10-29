import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storageDelete: vi.fn(),
  count: vi.fn(),
  transaction: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../../config/env", () => ({ env: { SERVER: "http://localhost:4000/api" } }));
vi.mock("../../infrastructure/storage/s3.storage", () => ({
  S3StorageProvider: class {
    put = vi.fn();
    get = vi.fn();
    delete = mocks.storageDelete;
  },
}));
vi.mock("../../database/prisma/prisma-client", () => {
  const cardModel = {
    count: mocks.count,
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

const UUID_A = "0a1b2c3d-0000-4000-8000-000000000001";
const UUID_B = "0a1b2c3d-0000-4000-8000-000000000002";
const refA = `/api/media/cartes/${UUID_A}.webp`;
const refB = `/api/media/cartes/${UUID_B}.webp`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(0);
  mocks.storageDelete.mockResolvedValue(undefined);
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

describe("images téléversées", () => {
  const base = { tier: "pro" as const, nom: "Pro" };
  /** Modèle existant ; la mise à jour renvoie la ligne complète, comme une vraie base. */
  const existing = (r: ReturnType<typeof row>) => {
    mocks.findUnique.mockResolvedValue(r);
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...r, ...data }));
  };

  it("enregistre une référence RELATIVE (indépendante de l'origine de l'API)", async () => {
    await CardModelService.create({
      ...base,
      rectoUrl: `http://localhost:4000${refA}`, // l'URL absolue renvoyée par l'envoi
      versoUrl: refB,
    });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ rectoUrl: refA, versoUrl: refB });
  });

  it("renvoie des adresses ABSOLUES à l'administrateur et au client", async () => {
    mocks.findMany.mockResolvedValue([row({ rectoUrl: refA, versoUrl: "https://res.cloudinary.com/x/v.png", actif: true })]);
    const { modeles } = await CardModelService.list();
    expect(modeles[0].rectoUrl).toBe(`http://localhost:4000${refA}`);
    expect(modeles[0].versoUrl).toBe("https://res.cloudinary.com/x/v.png"); // lien externe inchangé
    mocks.findFirst.mockResolvedValue(row({ rectoUrl: refA, versoUrl: refB, actif: true }));
    const actif = await CardModelService.activeFor("PRO");
    expect(actif?.rectoUrl).toBe(`http://localhost:4000${refA}`);
  });

  it.each([
    ["adresse http d'un autre site", "http://autre-site.example/img.png"],
    ["chemin relatif quelconque", "/etc/passwd"],
    ["autre dossier de médias", `/api/media/12/${UUID_A}.webp`],
  ])("refuse : %s", async (_label, bad) => {
    await expect(CardModelService.create({ ...base, rectoUrl: bad, versoUrl: refB })).rejects.toMatchObject({
      status: 422,
      code: "IMAGE_INVALIDE",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("remplacer une image supprime l'ancien fichier du stockage", async () => {
    existing(row({ id: 5, rectoUrl: refA, versoUrl: refB }));
    const nouvelle = "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000003.webp";
    await CardModelService.update(5, { rectoUrl: nouvelle });
    expect(mocks.storageDelete).toHaveBeenCalledTimes(1);
    expect(mocks.storageDelete).toHaveBeenCalledWith(`card-models/${UUID_A}.webp`); // l'ancien recto, pas le verso
  });

  it("ne supprime pas un fichier encore utilisé par un autre modèle", async () => {
    existing(row({ id: 5, rectoUrl: refA, versoUrl: refB }));
    mocks.count.mockResolvedValue(1);
    await CardModelService.update(5, { rectoUrl: "/api/media/cartes/0a1b2c3d-0000-4000-8000-000000000003.webp" });
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });

  it("remplacer un lien externe ne touche pas au stockage", async () => {
    existing(row({ id: 5, rectoUrl: "https://res.cloudinary.com/x/r.png", versoUrl: refB }));
    await CardModelService.update(5, { rectoUrl: refA });
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });

  it("garder les mêmes images (simple renommage) ne supprime rien", async () => {
    existing(row({ id: 5, rectoUrl: refA, versoUrl: refB }));
    await CardModelService.update(5, { nom: "Autre nom" });
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });

  it("supprimer un modèle supprime ses deux fichiers", async () => {
    mocks.findUnique.mockResolvedValue(row({ rectoUrl: refA, versoUrl: refB }));
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    await CardModelService.remove(1);
    expect(mocks.storageDelete.mock.calls.map(c => c[0]).sort()).toEqual([`card-models/${UUID_A}.webp`, `card-models/${UUID_B}.webp`]);
  });

  it("un échec de suppression du fichier ne fait pas échouer l'opération", async () => {
    mocks.findUnique.mockResolvedValue(row({ rectoUrl: refA, versoUrl: refB }));
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.storageDelete.mockRejectedValue(new Error("S3 indisponible"));
    await expect(CardModelService.remove(1)).resolves.toEqual({ ok: true });
  });
});

describe("validation des modèles de carte", () => {
  const ok = { tier: "pro", nom: "Pro", rectoUrl: "https://cdn.exemple.sn/r.png", versoUrl: "https://cdn.exemple.sn/v.png" };

  it("accepte un modèle valide", () => {
    expect(createModeleCarteSchema.safeParse(ok).success).toBe(true);
  });
  it("accepte une image téléversée, en URL absolue (http en local) ou relative", () => {
    const own = `http://localhost:4000/api/media/cartes/${UUID_A}.webp`;
    expect(createModeleCarteSchema.safeParse({ ...ok, rectoUrl: own, versoUrl: refB }).success).toBe(true);
  });
  it("refuse un fichier téléversé hors du dossier des modèles de carte", () => {
    expect(createModeleCarteSchema.safeParse({ ...ok, rectoUrl: `/api/media/7/${UUID_A}.webp` }).success).toBe(false);
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
