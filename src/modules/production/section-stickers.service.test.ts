import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ficheFindFirst: vi.fn(),
  reqFindFirst: vi.fn(),
  reqFindMany: vi.fn(),
  reqFindUnique: vi.fn(),
  reqCreate: vi.fn(),
  reqUpdate: vi.fn(),
}));
vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    fiche: { findFirst: mocks.ficheFindFirst },
    sectionStickerRequest: {
      findFirst: mocks.reqFindFirst,
      findMany: mocks.reqFindMany,
      findUnique: mocks.reqFindUnique,
      create: mocks.reqCreate,
      update: mocks.reqUpdate,
    },
  },
}));

import { Prisma } from "../../database/prisma/generated/prisma/client";
import {
  createSectionStickerSchema,
  listSectionStickersQuery,
  patchSectionStickerSchema,
} from "./section-stickers.schemas";
import { SectionStickerService } from "./section-stickers.service";

const client = { id: 7, role: "CLIENT" } as never;
const admin = { id: 1, role: "ADMIN" } as never;
const row = (over: Record<string, unknown> = {}) => ({
  id: 5, ficheId: 12, userId: 7, section: "menu", quantite: 20, message: null, statut: "DEMANDE",
  activatedAt: null, createdAt: new Date("2026-10-29"), updatedAt: new Date("2026-10-29"), ...over,
});
const ficheOk = (plan: string | null = "PRO", statut = "ACTIVE") => ({
  id: 12, statut, subscriptions: plan ? [{ plan: { type: plan } }] : [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reqFindFirst.mockResolvedValue(null);
  mocks.reqCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
});

describe("SectionStickerService.create : la demande de devis du client", () => {
  const input = { section: "menu", quantite: 20 };

  it.each(["PRO", "SIGNATURE"])("accepte une fiche %s avec abonnement valide", async plan => {
    mocks.ficheFindFirst.mockResolvedValue(ficheOk(plan));
    const { demande } = await SectionStickerService.create(client, 12, { ...input, message: "Pour les 12 tables" });
    expect(mocks.reqCreate.mock.calls[0][0].data).toMatchObject({ ficheId: 12, userId: 7, section: "menu", quantite: 20, message: "Pour les 12 tables" });
    expect(demande).toMatchObject({ statut: "demande", quantite: 20 });
  });

  it("une demande n'active rien : elle reste « demande » tant que l'administration n'a pas décidé", async () => {
    mocks.ficheFindFirst.mockResolvedValue(ficheOk());
    const { demande } = await SectionStickerService.create(client, 12, input);
    expect(mocks.reqCreate.mock.calls[0][0].data).not.toHaveProperty("statut"); // défaut de la base : DEMANDE
    expect(demande.statut).toBe("demande");
    expect(demande.activatedAt).toBeNull();
  });

  it("ne cherche que parmi les fiches du client connecté", async () => {
    mocks.ficheFindFirst.mockResolvedValue(null);
    await expect(SectionStickerService.create(client, 12, input)).rejects.toMatchObject({ status: 404 });
    expect(mocks.ficheFindFirst.mock.calls[0][0].where).toEqual({ id: 12, userId: 7 });
  });

  it.each([
    ["formule Essentielle (abonnement valide)", ficheOk("ESSENTIELLE"), "FORMULE_INSUFFISANTE"],
    ["abonnement échu (aucun abonnement valide)", ficheOk(null), "FORMULE_INSUFFISANTE"],
    ["fiche suspendue", ficheOk("PRO", "SUSPENDUE"), "FICHE_NON_PUBLIEE"],
    ["fiche en brouillon", ficheOk("PRO", "BROUILLON"), "FICHE_NON_PUBLIEE"],
  ])("refuse : %s", async (_label, fiche, code) => {
    mocks.ficheFindFirst.mockResolvedValue(fiche);
    await expect(SectionStickerService.create(client, 12, input)).rejects.toMatchObject({ status: 422, code });
    expect(mocks.reqCreate).not.toHaveBeenCalled();
  });

  it("refuse une seconde demande tant qu'une demande est ouverte sur la même section", async () => {
    mocks.ficheFindFirst.mockResolvedValue(ficheOk());
    mocks.reqFindFirst.mockResolvedValue({ statut: "DEMANDE" });
    await expect(SectionStickerService.create(client, 12, input)).rejects.toMatchObject({ status: 409, code: "DEMANDE_DEJA_EN_COURS" });
    expect(mocks.reqFindFirst.mock.calls[0][0].where).toMatchObject({ ficheId: 12, section: "menu", statut: { in: ["DEMANDE", "ACTIVE"] } });
  });

  it("dit clairement quand la section est déjà activée", async () => {
    mocks.ficheFindFirst.mockResolvedValue(ficheOk());
    mocks.reqFindFirst.mockResolvedValue({ statut: "ACTIVE" });
    await expect(SectionStickerService.create(client, 12, input)).rejects.toMatchObject({ message: expect.stringContaining("déjà activée") });
  });

  it("deux envois simultanés : l'index unique refuse le second (409, pas 500)", async () => {
    mocks.ficheFindFirst.mockResolvedValue(ficheOk());
    mocks.reqCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" }));
    await expect(SectionStickerService.create(client, 12, input)).rejects.toMatchObject({ status: 409, code: "DEMANDE_DEJA_EN_COURS" });
  });

  it("un message vide n'est pas enregistré", async () => {
    mocks.ficheFindFirst.mockResolvedValue(ficheOk());
    await SectionStickerService.create(client, 12, { ...input, message: "" });
    expect(mocks.reqCreate.mock.calls[0][0].data.message).toBeNull();
  });
});

describe("SectionStickerService.listForFiche", () => {
  it("le client ne voit que les demandes de SA fiche", async () => {
    mocks.ficheFindFirst.mockResolvedValue({ id: 12 });
    mocks.reqFindMany.mockResolvedValue([row({ statut: "ACTIVE" })]);
    const { demandes } = await SectionStickerService.listForFiche(client, 12);
    expect(mocks.ficheFindFirst.mock.calls[0][0].where).toEqual({ id: 12, userId: 7 });
    expect(demandes[0]).toMatchObject({ section: "menu", statut: "active" });
    expect(demandes[0]).not.toHaveProperty("userId"); // pas de données internes côté client
  });

  it("un administrateur peut consulter n'importe quelle fiche", async () => {
    mocks.ficheFindFirst.mockResolvedValue({ id: 12 });
    mocks.reqFindMany.mockResolvedValue([]);
    await SectionStickerService.listForFiche(admin, 12);
    expect(mocks.ficheFindFirst.mock.calls[0][0].where).toEqual({ id: 12 });
  });

  it("fiche d'un autre client : 404", async () => {
    mocks.ficheFindFirst.mockResolvedValue(null);
    await expect(SectionStickerService.listForFiche(client, 99)).rejects.toMatchObject({ status: 404 });
    expect(mocks.reqFindMany).not.toHaveBeenCalled();
  });
});

describe("SectionStickerService (administration)", () => {
  it("adminList : filtres, tri récent d'abord, fiche et client joints", async () => {
    mocks.reqFindMany.mockResolvedValue([
      { ...row(), fiche: { id: 12, slug: "le-sunset", prenom: "Rose", nom: "N", entreprise: "Sunset" }, user: { id: 7, nom: "Rose", email: "r@x.sn" } },
    ]);
    const { demandes } = await SectionStickerService.adminList({ statut: "demande", ficheId: 12, limit: 50 });
    const q = mocks.reqFindMany.mock.calls[0][0];
    expect(q.where).toEqual({ statut: "DEMANDE", ficheId: 12 });
    expect(q.orderBy[0]).toEqual({ createdAt: "desc" });
    expect(q.take).toBe(50);
    expect(demandes[0]).toMatchObject({ statut: "demande", fiche: { slug: "le-sunset" }, client: { email: "r@x.sn" } });
  });

  it("adminList sans filtre : toutes les demandes", async () => {
    mocks.reqFindMany.mockResolvedValue([]);
    await SectionStickerService.adminList({ limit: 200 });
    expect(mocks.reqFindMany.mock.calls[0][0].where).toEqual({});
  });

  const withStatus = (statut: string) => mocks.reqFindUnique.mockResolvedValue({ statut });
  const updated = (statut: string) =>
    mocks.reqUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...row({ ...data, statut }), fiche: { id: 12, slug: "s", prenom: "R", nom: "N", entreprise: null }, user: null,
    }));

  it("activer une demande enregistre la date d'activation", async () => {
    withStatus("DEMANDE"); updated("ACTIVE");
    const { demande } = await SectionStickerService.adminSetStatus(5, { statut: "active" });
    const data = mocks.reqUpdate.mock.calls[0][0].data;
    expect(data.statut).toBe("ACTIVE");
    expect(data.activatedAt).toBeInstanceOf(Date);
    expect(demande.statut).toBe("active");
  });

  it.each([
    ["DEMANDE", "refusee", "REFUSEE"],
    ["ACTIVE", "desactivee", "DESACTIVEE"],
    ["DESACTIVEE", "active", "ACTIVE"],
  ])("transition permise : %s → %s", async (from, to, expected) => {
    withStatus(from); updated(expected);
    await expect(SectionStickerService.adminSetStatus(5, { statut: to as never })).resolves.toBeTruthy();
    expect(mocks.reqUpdate.mock.calls[0][0].data.statut).toBe(expected);
  });

  it.each([
    ["REFUSEE", "active"],
    ["REFUSEE", "desactivee"],
    ["DEMANDE", "desactivee"],
    ["ACTIVE", "active"],
    ["ACTIVE", "refusee"],
  ])("transition refusée : %s → %s (409)", async (from, to) => {
    withStatus(from);
    await expect(SectionStickerService.adminSetStatus(5, { statut: to as never })).rejects.toMatchObject({ status: 409, code: "TRANSITION_INVALIDE" });
    expect(mocks.reqUpdate).not.toHaveBeenCalled();
  });

  it("demande inconnue : 404", async () => {
    mocks.reqFindUnique.mockResolvedValue(null);
    await expect(SectionStickerService.adminSetStatus(99, { statut: "active" })).rejects.toMatchObject({ status: 404 });
  });

  it("réactiver alors qu'une nouvelle demande est ouverte sur la même section : 409, pas 500", async () => {
    withStatus("DESACTIVEE");
    mocks.reqUpdate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" }));
    await expect(SectionStickerService.adminSetStatus(5, { statut: "active" })).rejects.toMatchObject({ status: 409, code: "DEMANDE_DEJA_EN_COURS" });
  });
});

describe("validation", () => {
  const ok = { section: "menu", quantite: 20 };
  it("accepte une demande valide, avec une clé d'onglet personnalisé", () => {
    expect(createSectionStickerSchema.safeParse(ok).success).toBe(true);
    expect(createSectionStickerSchema.safeParse({ ...ok, section: "texte-mk1a0" }).success).toBe(true);
  });
  it.each([
    ["quantité nulle", { ...ok, quantite: 0 }],
    ["quantité négative", { ...ok, quantite: -3 }],
    ["quantité décimale", { ...ok, quantite: 2.5 }],
    ["quantité excessive", { ...ok, quantite: 501 }],
    ["quantité en texte", { ...ok, quantite: "20" }],
    ["section avec un slash", { ...ok, section: "menu/../admin" }],
    ["section vide", { ...ok, section: "  " }],
    ["champ inattendu (statut imposé par le client)", { ...ok, statut: "ACTIVE" }],
    ["message trop long", { ...ok, message: "x".repeat(501) }],
  ])("refuse : %s", (_label, body) => {
    expect(createSectionStickerSchema.safeParse(body).success).toBe(false);
  });
  it("l'administration ne peut choisir que active, désactivée ou refusée (jamais « demande »)", () => {
    expect(patchSectionStickerSchema.safeParse({ statut: "active" }).success).toBe(true);
    expect(patchSectionStickerSchema.safeParse({ statut: "demande" }).success).toBe(false);
    expect(patchSectionStickerSchema.safeParse({}).success).toBe(false);
  });
  it("la liste a des valeurs par défaut et refuse un statut inconnu", () => {
    expect(listSectionStickersQuery.parse({}).limit).toBe(200);
    expect(listSectionStickersQuery.safeParse({ statut: "inconnu" }).success).toBe(false);
    expect(listSectionStickersQuery.parse({ ficheId: "12" }).ficheId).toBe(12);
  });
});
