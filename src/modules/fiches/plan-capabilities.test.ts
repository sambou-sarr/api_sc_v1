import { describe, expect, it } from "vitest";
import type { PlanLimit } from "../../database/prisma/generated/prisma/client";
import { updateFicheSchema } from "./fiches.schemas";
import { toPlanCapabilities } from "./plan-capabilities";

const limits = {
  planId: 1,
  tabsAutorises: ["PRESENTATION", "RESEAUX", "LOCALISATION"],
  headerLayouts: ["PORTRAIT"],
  themes: ["BLEU"],
  canReorder: false,
  canHide: false,
  canAdd: false,
  canRename: false,
  maxCustomTabs: 0,
  maxPresentation: 280,
  maxSocial: 3,
  maxLinks: 0,
  maxPhotos: 0,
  maxVideos: 0,
  maxCatalogSections: 0,
  maxCatalogArticlesPerSection: 0,
  catalogPrices: false,
  maxMenuSections: 0,
  maxMenuItemsPerSection: 0,
  menuVideoPerItem: false,
  maxMenuVideoSeconds: 0,
  maxBiens: 0,
  maxPhotosPerBien: 0,
  hasCatalog: false,
  hasMenu: false,
  hasBiens: false,
  hasGoogleReview: false,
  hasStats: false,
  hasForm: false,
  hasDashboard: false,
} as unknown as PlanLimit;

describe("toPlanCapabilities", () => {
  it("convertit les enums en minuscules, comme le front", () => {
    const c = toPlanCapabilities({ nom: "Essentielle", themeDefaut: "BLEU" }, limits);
    expect(c.label).toBe("Essentielle");
    expect(c.theme).toBe("bleu");
    expect(c.tabs).toEqual(["presentation", "reseaux", "localisation"]);
    expect(c.headerLayouts).toEqual(["portrait"]);
    expect(c.themes).toEqual(["bleu"]);
  });

  it("reprend les quotas tels que stockés en base", () => {
    const c = toPlanCapabilities({ nom: "Pro", themeDefaut: "CLAIR" }, { ...limits, maxPhotos: 4, maxPresentation: 800 });
    expect(c.maxPhotos).toBe(4);
    expect(c.maxPresentation).toBe(800);
  });
});

describe("updateFicheSchema : URL", () => {
  const parse = (site: string) => updateFicheSchema.safeParse({ site }).success;

  it("accepte http(s), tel, mailto, ancre et chemin relatif", () => {
    for (const u of ["https://exemple.sn", "tel:+221770000000", "mailto:a@b.sn", "#contact", "/contact", ""]) {
      expect(parse(u), u).toBe(true);
    }
  });

  it("refuse javascript: et les URL relatives au protocole (//hote)", () => {
    for (const u of ["javascript:alert(1)", "//evil.example", "data:text/html,x"]) {
      expect(parse(u), u).toBe(false);
    }
  });
});
