import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../database/prisma/prisma-client", () => ({
  prisma: {
    leadRequest: {
      create: mocks.create,
      findMany: mocks.findMany,
      count: mocks.count,
      updateMany: mocks.updateMany,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
    },
    $transaction: mocks.transaction,
  },
}));

import { LeadsService } from "./leads.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((operations: Promise<unknown>[]) =>
    Promise.all(operations),
  );
});

describe("LeadsService.create", () => {
  it("persists the request fields and consent in the admin inbox", async () => {
    mocks.create.mockResolvedValue({ id: 42, createdAt: new Date("2026-10-26T16:00:00Z") });
    const createdAt = "2026-10-26T16:00:00.000Z";

    await LeadsService.create({
      intent: "devis",
      intentLabel: "Devis vidéo",
      products: ["Vidéo de présentation"],
      services: ["video"],
      name: "Awa Ndiaye",
      phone: "+221771234567",
      email: "awa@example.sn",
      consent_marketing: true,
      consent_text: "Accord",
      consent_at: createdAt,
      source: "site",
      page: "/contact",
      website: "",
    });

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        intent: "devis",
        name: "Awa Ndiaye",
        products: ["Vidéo de présentation"],
        services: ["video"],
        consentMarketing: true,
        consentAt: new Date(createdAt),
      }),
      select: { id: true, createdAt: true },
    });
  });

  it("rejects a filled honeypot rather than storing the submission", async () => {
    await expect(LeadsService.create({
      intent: "question",
      intentLabel: "Question",
      products: [],
      services: [],
      name: "Robot",
      website: "spam",
      consent_marketing: false,
    })).rejects.toMatchObject({ status: 422 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("LeadsService.list and updateStatus", () => {
  it("paginates filtered requests and updates status", async () => {
    mocks.findMany.mockResolvedValue([{ id: 42, status: "NEW" }]);
    mocks.count.mockResolvedValue(1);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({ id: 42, status: "CONTACTED" });

    await expect(LeadsService.list({
      search: "Awa",
      status: "NEW",
      page: 2,
      limit: 10,
    })).resolves.toMatchObject({
      items: [{ id: 42, status: "NEW" }],
      pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });
    await expect(LeadsService.updateStatus(42, "CONTACTED")).resolves.toMatchObject({
      status: "CONTACTED",
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: "CONTACTED" },
    });
  });
});
