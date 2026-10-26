import { describe, expect, it } from "vitest";
import { createLeadSchema, listLeadsQuery } from "./leads.schemas";

const validLead = {
  intent: "devis",
  intentLabel: "Devis — Création de contenu",
  products: ["Vidéo de présentation"],
  name: "Awa Ndiaye",
  phone: "+221771234567",
  email: "awa@example.sn",
  consent_marketing: false,
  consent_at: "2026-10-26T16:00:00.000Z",
  source: "site",
  page: "/contact",
  website: "",
};

describe("createLeadSchema", () => {
  it("accepts the public contact/devis payload and defaults optional arrays", () => {
    expect(createLeadSchema.parse(validLead)).toMatchObject({
      intent: "devis",
      name: "Awa Ndiaye",
      products: ["Vidéo de présentation"],
      services: [],
    });
  });

  it("rejects malformed email addresses and unexpected properties", () => {
    expect(createLeadSchema.safeParse({ ...validLead, email: "invalid" }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...validLead, extra: "value" }).success).toBe(false);
  });

  it("accepts maquette details while rejecting honeypot submissions in service", () => {
    expect(createLeadSchema.safeParse({
      ...validLead,
      intent: "maquette",
      design: { recto: "logo", taille_logo: 18 },
    }).success).toBe(true);
  });
});

describe("listLeadsQuery", () => {
  it("defaults to the first page and validates request statuses", () => {
    expect(listLeadsQuery.parse({})).toMatchObject({ page: 1, limit: 20 });
    expect(listLeadsQuery.safeParse({ status: "UNKNOWN" }).success).toBe(false);
  });
});
