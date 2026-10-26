import { describe, expect, it } from "vitest";
import {
  calculerEmplacements,
  calculerTarif,
  dureesAvecValeursParDefaut,
  remisesAvecValeursParDefaut,
} from "./parametres.tarifs";

describe("valeurs par défaut des formules", () => {
  it("fournit les remises Pro et Signature quand aucun réglage n’existe", () => {
    for (const formule of ["PRO", "SIGNATURE"]) {
      expect(dureesAvecValeursParDefaut(formule, [])).toEqual([
        { dureeMois: 1, remisePct: 0 },
        { dureeMois: 3, remisePct: 10 },
        { dureeMois: 12, remisePct: 20 },
      ]);
      expect(remisesAvecValeursParDefaut(formule, [])).toEqual([
        { quantiteMin: 10, remisePct: 10 },
        { quantiteMin: 50, remisePct: 20 },
      ]);
    }
  });

  it("respecte les remises personnalisées déjà définies", () => {
    expect(
      dureesAvecValeursParDefaut("PRO", [
        { dureeMois: 3, remisePct: 15 },
        { dureeMois: 12, remisePct: 25 },
      ]),
    ).toEqual([
      { dureeMois: 3, remisePct: 15 },
      { dureeMois: 12, remisePct: 25 },
    ]);
    expect(
      remisesAvecValeursParDefaut("SIGNATURE", [
        { quantiteMin: 5, remisePct: 8 },
      ]),
    ).toEqual([{ quantiteMin: 5, remisePct: 8 }]);
  });
});

describe("calculerTarif", () => {
  it("applique les valeurs par défaut pour 10 fiches Pro sur 3 mois", () => {
    const result = calculerTarif({
      prixMensuelFcfa: 2500,
      dureeMois: 3,
      remiseDureePct: 10,
      remiseQuantitePct: 10,
      quantite: 10,
    });

    expect(result).toMatchObject({
      prixApresDureeFcfa: 6750,
      prixUnitaireFcfa: 6075,
      totalFcfa: 60750,
      totalSansRemiseFcfa: 75000,
      economieFcfa: 14250,
    });
  });

  it("cumule les remises de durée et de quantité sur le même plan", () => {
    const result = calculerTarif({
      prixMensuelFcfa: 2000,
      dureeMois: 6,
      remiseDureePct: 10,
      remiseQuantitePct: 15,
      quantite: 3,
    });

    expect(result).toMatchObject({
      prixApresDureeFcfa: 10800,
      prixUnitaireFcfa: 9180,
      totalFcfa: 27540,
      economieFcfa: 8460,
    });
  });
});

describe("calculerEmplacements", () => {
  it("choisit le pack le moins cher pour les emplacements Essentielle payants", () => {
    const result = calculerEmplacements(
      1000,
      [{ quantite: 3, prixFcfa: 2500 }],
      4,
    );

    expect(result.totalFcfa).toBe(3500);
    expect(result.detail).toEqual({
      unitaires: 1,
      packs: [{ quantite: 3, prixFcfa: 2500, nombre: 1 }],
    });
  });
});
