import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env", () => ({ env: { SERVER: "http://localhost:4000/api" } }));

import { toFicheDto, type FicheFull } from "./fiches.dto";

/* La fiche publique n'expose que les sections de stickers ACTIVÉES par l'administration. */
const fiche = (sections: string[]) =>
  ({
    id: 1, slug: "le-sunset", statut: "ACTIVE", enLigneSeule: false, prenom: "Rose", nom: "N", fonction: null, entreprise: null,
    photo: null, logo: null, telephone: null, whatsapp: null, email: null, site: null, adresse: null, googlePlaceId: null,
    scansTotal: 0, updatedAt: new Date("2026-10-29"), secteur: null, premierBouton: "WHATSAPP", messageWhatsapp: null,
    presentation: null, enteteDisposition: "PORTRAIT", enteteTaille: "M", enteteTheme: null, enteteCouverture: null,
    rdvLabel: null, rdvUrl: null,
    reseaux: [], liens: [], horaires: [], medias: [], catalogueSections: [], menuSections: [], biens: [], onglets: [],
    sectionStickers: sections.map(section => ({ section })),
  }) as unknown as FicheFull;
const sub = (type = "PRO") => ({ plan: { type, limits: null }, endsAt: null }) as never;

describe("toFicheDto : stickerSections", () => {
  it("expose les sections activées", () => {
    expect(toFicheDto(fiche(["menu", "horaires"]), sub()).stickerSections).toEqual(["menu", "horaires"]);
  });
  it("aucune section activée : tableau vide", () => {
    expect(toFicheDto(fiche([]), sub()).stickerSections).toEqual([]);
  });
  it("abonnement échu : aucune section servie, même si elles étaient activées", () => {
    const dto = toFicheDto(fiche(["menu"]), null);
    expect(dto.expiree).toBe(true);
    expect(dto.stickerSections).toEqual([]);
  });
});
