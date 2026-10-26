// Calculs de prix : fonctions pures (aucun accès base), faciles à tester et à réutiliser
// par les autres modules (upgrade, activation admin, futur paiement Wave / Orange Money).

export type Duree = { dureeMois: number; remisePct: number };
export type Palier = { quantiteMin: number; remisePct: number };
export type Pack = { quantite: number; prixFcfa: number };

export const quotaEssentielle = (
  fichesGratuites: number,
  emplacementsPayes: number
) => fichesGratuites + emplacementsPayes;

export const peutCreerEssentielle = (
  existantes: number,
  fichesGratuites: number,
  emplacementsPayes: number
) => existantes < quotaEssentielle(fichesGratuites, emplacementsPayes);

export const emplacementsManquants = (
  voulues: number,
  fichesGratuites: number,
  emplacementsPayes: number
) => Math.max(0, voulues - quotaEssentielle(fichesGratuites, emplacementsPayes));

export const DEFAULT_PLAN_DUREES: Record<"PRO" | "SIGNATURE", Duree[]> = {
  PRO: [
    { dureeMois: 1, remisePct: 0 },
    { dureeMois: 3, remisePct: 10 },
    { dureeMois: 12, remisePct: 20 },
  ],
  SIGNATURE: [
    { dureeMois: 1, remisePct: 0 },
    { dureeMois: 3, remisePct: 10 },
    { dureeMois: 12, remisePct: 20 },
  ],
};

export const DEFAULT_PLAN_REMISES: Record<"PRO" | "SIGNATURE", Palier[]> = {
  PRO: [
    { quantiteMin: 10, remisePct: 10 },
    { quantiteMin: 50, remisePct: 20 },
  ],
  SIGNATURE: [
    { quantiteMin: 10, remisePct: 10 },
    { quantiteMin: 50, remisePct: 20 },
  ],
};

export function dureesAvecValeursParDefaut(
  formule: string,
  configurees: Duree[],
): Duree[] {
  if (configurees.length > 0) return configurees;
  if (formule !== "PRO" && formule !== "SIGNATURE") return configurees;
  return DEFAULT_PLAN_DUREES[formule];
}

export function remisesAvecValeursParDefaut(
  formule: string,
  configurees: Palier[],
): Palier[] {
  if (configurees.length > 0) return configurees;
  if (formule !== "PRO" && formule !== "SIGNATURE") return configurees;
  return DEFAULT_PLAN_REMISES[formule];
}

// Remise liée à la durée d'engagement. undefined = durée non proposée.
export const remiseDuree = (durees: Duree[], dureeMois: number) =>
  durees.find(d => d.dureeMois === dureeMois)?.remisePct;

// Remise liée au nombre de fiches prises d'un coup : le palier le plus haut atteint.
export const remiseQuantite = (paliers: Palier[], quantite: number) =>
  paliers
    .filter(p => p.quantiteMin <= quantite)
    .reduce((max, p) => Math.max(max, p.remisePct), 0);

// Prix d'un abonnement :
//   prix d'une fiche pour la durée = prix mensuel × mois × (1 − remise durée)
//   prix unitaire                  = prix d'une fiche × (1 − remise quantité)
//   total                          = prix unitaire × quantité
// Les deux remises se cumulent (multiplicatif). Chaque étape est arrondie au FCFA.
export function calculerTarif(i: {
  prixMensuelFcfa: number;
  dureeMois: number;
  remiseDureePct: number;
  remiseQuantitePct: number;
  quantite: number;
}) {
  const prixSansRemiseFcfa = i.prixMensuelFcfa * i.dureeMois;
  const prixApresDureeFcfa = Math.round(
    (prixSansRemiseFcfa * (100 - i.remiseDureePct)) / 100
  );
  const prixUnitaireFcfa = Math.round(
    (prixApresDureeFcfa * (100 - i.remiseQuantitePct)) / 100
  );
  const totalFcfa = prixUnitaireFcfa * i.quantite;
  const totalSansRemiseFcfa = prixSansRemiseFcfa * i.quantite;
  return {
    dureeMois: i.dureeMois,
    quantite: i.quantite,
    prixMensuelFcfa: i.prixMensuelFcfa,
    remiseDureePct: i.remiseDureePct,
    remiseQuantitePct: i.remiseQuantitePct,
    prixApresDureeFcfa,
    prixUnitaireFcfa,
    totalFcfa,
    totalSansRemiseFcfa,
    economieFcfa: totalSansRemiseFcfa - totalFcfa,
  };
}

// Emplacements supplémentaires : prix à l'unité + packs (ex. pack de 3 à 3 500).
// On cherche la combinaison la moins chère (packs + unités) pour la quantité demandée.
export function calculerEmplacements(
  prixUnitaireFcfa: number,
  packs: Pack[],
  quantite: number
) {
  const cout: number[] = new Array(quantite + 1).fill(0);
  const choix: number[] = new Array(quantite + 1).fill(0); // taille du pack choisi (0 = à l'unité)

  for (let i = 1; i <= quantite; i++) {
    cout[i] = cout[i - 1] + prixUnitaireFcfa;
    choix[i] = 0;
    for (const p of packs) {
      if (p.quantite > i) continue;
      const c = cout[i - p.quantite] + p.prixFcfa;
      if (c < cout[i]) {
        cout[i] = c;
        choix[i] = p.quantite;
      }
    }
  }

  const nombreParPack = new Map<number, number>();
  let unitaires = 0;
  for (let i = quantite; i > 0; ) {
    const taille = choix[i];
    if (taille === 0) {
      unitaires++;
      i--;
    } else {
      nombreParPack.set(taille, (nombreParPack.get(taille) ?? 0) + 1);
      i -= taille;
    }
  }

  const totalFcfa = cout[quantite];
  const totalSansPackFcfa = prixUnitaireFcfa * quantite;
  return {
    quantite,
    prixUnitaireFcfa,
    totalFcfa,
    totalSansPackFcfa,
    economieFcfa: totalSansPackFcfa - totalFcfa,
    detail: {
      unitaires,
      packs: packs
        .filter(p => nombreParPack.has(p.quantite))
        .map(p => ({
          quantite: p.quantite,
          prixFcfa: p.prixFcfa,
          nombre: nombreParPack.get(p.quantite)!,
        })),
    },
  };
}
