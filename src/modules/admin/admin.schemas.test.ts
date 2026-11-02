import { describe, expect, it } from "vitest";
import {
  createAdminSchema,
  listFichesQuery,
  patchFicheSchema,
} from "./admin.schemas";

describe("createAdminSchema", () => {
  it("normalizes the email and validates the administrator name", () => {
    expect(
      createAdminSchema.parse({ email: "  ADMIN@EXAMPLE.COM ", nom: " Awa " })
    ).toEqual({ email: "admin@example.com", nom: "Awa" });
  });

  it("rejects invalid addresses and short names", () => {
    expect(
      createAdminSchema.safeParse({ email: "invalid", nom: "A" }).success
    ).toBe(false);
  });
});

describe("listFichesQuery", () => {
  it("accepts the pending sticker request filter only", () => {
    expect(listFichesQuery.safeParse({ sticker: "demande" }).success).toBe(true);
    expect(listFichesQuery.safeParse({ sticker: "active" }).success).toBe(false);
  });
});

describe("patchFicheSchema", () => {
  it("accepts a validated slug before a client account is created", () => {
    expect(
      patchFicheSchema.safeParse({ slug: "nouvelle-adresse" }).success
    ).toBe(true);
  });

  it("keeps fiche status updates available", () => {
    expect(
      patchFicheSchema.safeParse({ statut: "suspendue" }).success
    ).toBe(true);
  });

  it("rejects admin ownership assignment and removal", () => {
    expect(patchFicheSchema.safeParse({ userId: 7 }).success).toBe(false);
    expect(patchFicheSchema.safeParse({ userId: null }).success).toBe(false);
  });
});
