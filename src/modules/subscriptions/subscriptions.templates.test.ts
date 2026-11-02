import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentFindUniqueOrThrow: vi.fn(),
  paymentUpdateMany: vi.fn(),
  paymentUpdate: vi.fn(),
  subscriptionFindFirst: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  subscriptionCreate: vi.fn(),
  ficheFindUnique: vi.fn(),
  ficheUpdate: vi.fn(),
  planFindMany: vi.fn(),
  ficheOngletFindMany: vi.fn(),
  ficheOngletDeleteMany: vi.fn(),
  ficheOngletCreateMany: vi.fn(),
  toFicheDto: vi.fn(() => ({ id: 12, formule: "signature" })),
}));

vi.mock("../../config/env", () => ({
  env: { NODE_ENV: "test", REQUIRE_EMAIL_VERIFICATION: false },
}));
vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("../fiches/fiches.dto", () => ({
  ficheInclude: {},
  toFicheDto: mocks.toFicheDto,
}));

import { confirmSimulatedPayment } from "./subscriptions.service";

const ficheId = 12;
const paymentId = 51;
const userId = 7;
const proTabs = [
  "PRESENTATION",
  "CATALOGUE",
  "GALERIE",
  "VIDEOS",
  "LIENS",
  "HORAIRES",
  "AVIS",
  "RESEAUX",
  "LOCALISATION",
];
const signatureTabs = [
  "PRESENTATION",
  "MENU",
  "BIENS",
  "CATALOGUE",
  "GALERIE",
  "VIDEOS",
  "LIENS",
  "RENDEZVOUS",
  "RAPPEL",
  "HORAIRES",
  "AVIS",
  "RESEAUX",
  "LOCALISATION",
  "TEXTE",
];
const planWithTabs = (id: number, type: string, tabs: string[]) => ({
  id,
  type,
  nom: type,
  themeDefaut: type === "SIGNATURE" ? "OR" : "CLAIR",
  actif: true,
  dureeMois: 12,
  limits: {
    tabsAutorises: tabs,
    headerLayouts:
      type === "SIGNATURE"
        ? ["PORTRAIT", "LOGO", "BANNIERE", "DUO"]
        : ["PORTRAIT"],
  },
});
const tx = {
  payment: {
    findUnique: mocks.paymentFindUnique,
    findUniqueOrThrow: mocks.paymentFindUniqueOrThrow,
    updateMany: mocks.paymentUpdateMany,
    update: mocks.paymentUpdate,
  },
  subscription: {
    findFirst: mocks.subscriptionFindFirst,
    updateMany: mocks.subscriptionUpdateMany,
    create: mocks.subscriptionCreate,
  },
  fiche: {
    findUnique: mocks.ficheFindUnique,
    update: mocks.ficheUpdate,
  },
  plan: { findMany: mocks.planFindMany },
  ficheOnglet: {
    findMany: mocks.ficheOngletFindMany,
    deleteMany: mocks.ficheOngletDeleteMany,
    createMany: mocks.ficheOngletCreateMany,
  },
};
const user = { id: userId, role: "CLIENT", emailVerified: true } as never;

const defaultTabRows = (types: string[]) =>
  types.map(type => ({
    type,
    visible: true,
    titre: null,
    contenu: null,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    async (operation: (client: typeof tx) => unknown) => operation(tx),
  );
  mocks.paymentFindUnique.mockResolvedValue({
    id: paymentId,
    status: "PENDING",
    provider: "SIMULATION",
    ficheId,
    planId: 3,
    dureeMois: 12,
    amountFcfa: 75000,
    providerReference: "PAY-51",
    fiche: {
      id: ficheId,
      userId,
      statut: "ACTIVE",
      enteteTheme: "CLAIR",
      enteteDisposition: "PORTRAIT",
    },
    plan: planWithTabs(3, "SIGNATURE", signatureTabs),
  });
  mocks.paymentUpdateMany.mockResolvedValue({ count: 1 });
  mocks.paymentFindUniqueOrThrow.mockResolvedValue({
    id: paymentId,
    providerReference: "PAY-51",
  });
  mocks.subscriptionFindFirst
    .mockResolvedValueOnce({ plan: { type: "PRO", limits: {} } })
    .mockResolvedValueOnce({ plan: { type: "SIGNATURE", limits: {} } });
  mocks.subscriptionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.subscriptionCreate.mockResolvedValue({ id: 81 });
  mocks.paymentUpdate.mockResolvedValue({});
  mocks.ficheFindUnique.mockResolvedValue({ id: ficheId });
  mocks.ficheUpdate.mockResolvedValue({});
  mocks.planFindMany.mockResolvedValue([
    planWithTabs(2, "PRO", proTabs),
    planWithTabs(3, "SIGNATURE", signatureTabs),
  ]);
  mocks.ficheOngletFindMany.mockResolvedValue(defaultTabRows(proTabs));
  mocks.ficheOngletDeleteMany.mockResolvedValue({ count: proTabs.length });
  mocks.ficheOngletCreateMany.mockResolvedValue({
    count: signatureTabs.length,
  });
});

describe("confirmSimulatedPayment template activation", () => {
  it("replaces the old default tabs with the new plan tabs when an upgrade is confirmed", async () => {
    await confirmSimulatedPayment(user, paymentId);

    expect(mocks.ficheOngletDeleteMany).toHaveBeenCalledWith({
      where: { ficheId },
    });
    expect(mocks.ficheOngletCreateMany).toHaveBeenCalledWith({
      data: signatureTabs.map((type, position) => ({
        ficheId,
        type,
        visible: true,
        position,
      })),
    });
    expect(mocks.ficheUpdate).toHaveBeenCalledWith({
      where: { id: ficheId },
      data: { enteteTheme: "OR", enteteDisposition: "PORTRAIT" },
    });
  });

  it("preserves customized tabs instead of overwriting them during an upgrade", async () => {
    const customized = defaultTabRows(proTabs);
    customized[0].visible = false;
    mocks.ficheOngletFindMany.mockResolvedValue(customized);

    await confirmSimulatedPayment(user, paymentId);

    expect(mocks.ficheOngletDeleteMany).not.toHaveBeenCalled();
    expect(mocks.ficheOngletCreateMany).not.toHaveBeenCalled();
    expect(mocks.ficheUpdate).toHaveBeenCalledWith({
      where: { id: ficheId },
      data: { enteteTheme: "OR", enteteDisposition: "PORTRAIT" },
    });
  });
});
