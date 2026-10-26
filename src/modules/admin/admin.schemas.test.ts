import { describe, expect, it } from "vitest";
import { patchFicheSchema } from "./admin.schemas";

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
