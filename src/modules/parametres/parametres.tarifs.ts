// Calculs de prix : fonctions pures (aucun accès base), faciles à tester et à réutiliser
// par les autres modules (upgrade, activation admin, futur paiement Wave / Orange Money).

export type Duree = { dureeMois: number; remisePct: number };
export type Palier = { quantiteMin: number; remisePct: number };
export type Pack = { quantite: number; prixFcfa: number };

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
