import type {
  PlanType,
  Prisma,
} from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { notFound, unprocessable } from "../../lib/httpError";
import type {
  CommandeTarifInput,
  PatchEmplacementsInput,
  PatchFormuleInput,
} from "./parametres.schemas";
import {
  calculerEmplacements,
  calculerTarif,
  dureesAvecValeursParDefaut,
  emplacementsManquants,
  peutCreerEssentielle,
  quotaEssentielle,
  remiseDuree,
  remiseQuantite,
  remisesAvecValeursParDefaut,
} from "./parametres.tarifs";

// Les réglages vivent dans `plans` (+ `plan_durees`, `plan_remises`) et dans
// `emplacement_config` / `emplacement_packs`. Ils servent de VALEURS PAR DÉFAUT :
// les abonnements déjà créés ne changent jamais.
const ORDRE: PlanType[] = ["ESSENTIELLE", "PRO", "SIGNATURE"];
const FICHES_GRATUITES_PAR_DEFAUT = 3;

// L'Essentielle n'a pas d'abonnement : ni prix, ni durée, ni remise. Elle se limite à
// `fichesGratuites` fiches par compte, puis à des emplacements payés une seule fois.
const ESSENTIELLE_SANS_ABONNEMENT = () =>
  unprocessable(
    "ESSENTIELLE_SANS_ABONNEMENT",
    "L'Essentielle n'a pas d'abonnement : seuls les emplacements supplémentaires sont payants (paiement unique)"
  );

const SELECT = {
  type: true,
  nom: true,
  prixMensuelFcfa: true,
  prixFcfa: true,
  dureeMois: true,
  actif: true,
  durees: {
    select: { dureeMois: true, remisePct: true },
    orderBy: { dureeMois: "asc" },
  },
  remises: {
    select: { quantiteMin: true, remisePct: true },
    orderBy: { quantiteMin: "asc" },
  },
} satisfies Prisma.PlanSelect;

type Plan = Prisma.PlanGetPayload<{ select: typeof SELECT }>;
type Db = Prisma.TransactionClient | typeof prisma;

const toDto = (p: Plan) => ({
  formule: p.type.toLowerCase(),
  nom: p.nom,
  prixMensuelFcfa: p.prixMensuelFcfa,
  prixFcfa: p.prixFcfa,
  dureeMois: p.dureeMois,
  actif: p.actif,
  durees: dureesAvecValeursParDefaut(p.type, p.durees),
  remises: remisesAvecValeursParDefaut(p.type, p.remises),
});

const toType = (formule: string) => formule.toUpperCase() as PlanType;

async function lireEmplacements(db: Db = prisma) {
  const [config, packs] = await Promise.all([
    db.emplacementConfig.findUnique({ where: { id: 1 } }),
    db.emplacementPack.findMany({
      select: { quantite: true, prixFcfa: true },
      orderBy: { quantite: "asc" },
    }),
  ]);
  return {
    prixUnitaireFcfa: config?.prixUnitaireFcfa ?? null,
    fichesGratuites: config?.fichesGratuites ?? FICHES_GRATUITES_PAR_DEFAUT,
    packs,
  };
}

// Prix d'une ligne d'abonnement, avec les contrôles métier.
function tarifLigne(
  plan: Plan,
  dureeMois: number,
  quantite: number,
  quantiteFormule: number,
  exigerActif: boolean
) {
  if (plan.type === "ESSENTIELLE") throw ESSENTIELLE_SANS_ABONNEMENT();
  if (exigerActif && !plan.actif)
    throw unprocessable("FORMULE_INACTIVE", `La formule ${plan.nom} est désactivée`);
  if (plan.prixMensuelFcfa === null)
    throw unprocessable(
      "PRIX_NON_DEFINI",
      `Aucun prix mensuel n'est défini pour la formule ${plan.nom}`
    );
  const durees = dureesAvecValeursParDefaut(plan.type, plan.durees);
  const remiseDureePct = remiseDuree(durees, dureeMois);
  if (remiseDureePct === undefined)
    throw unprocessable(
      "DUREE_NON_PROPOSEE",
      `La durée de ${dureeMois} mois n'est pas proposée pour la formule ${plan.nom}`
    );

  return calculerTarif({
    prixMensuelFcfa: plan.prixMensuelFcfa,
    dureeMois,
    remiseDureePct,
    remiseQuantitePct: remiseQuantite(
      remisesAvecValeursParDefaut(plan.type, plan.remises),
      quantiteFormule
    ),
    quantite,
  });
}

export const ParametresService = {
  // ───────── Quota de fiches Essentielle d'un compte ─────────
  // À utiliser par le module fiches (création) et le module paiement (achat d'emplacements) :
  //   const { quota, peutCreer, emplacementsManquants } =
  //     await ParametresService.quotaEssentielle(tx, { existantes, emplacementsPayes });
  async quotaEssentielle(
    db: Db,
    i: { existantes: number; emplacementsPayes: number; voulues?: number }
  ) {
    const { fichesGratuites } = await lireEmplacements(db);
    return {
      fichesGratuites,
      quota: quotaEssentielle(fichesGratuites, i.emplacementsPayes),
      peutCreer: peutCreerEssentielle(
        i.existantes,
        fichesGratuites,
        i.emplacementsPayes
      ),
      emplacementsManquants: emplacementsManquants(
        i.voulues ?? i.existantes + 1,
        fichesGratuites,
        i.emplacementsPayes
      ),
    };
  },

  // ───────── Lecture : tout l'onglet Paramètres en un appel ─────────
  async get() {
    const [plans, emplacements] = await Promise.all([
      prisma.plan.findMany({ select: SELECT }),
      lireEmplacements(),
    ]);
    plans.sort((a, b) => ORDRE.indexOf(a.type) - ORDRE.indexOf(b.type));
    return { formules: plans.map(toDto), emplacements };
  },

  // ───────── Grille visible par les clients (lecture seule) ─────────
  // Toutes les formules actives, même si le prix n'est pas encore configuré,
  // afin que le client puisse distinguer une offre indisponible d'une formule absente.
  // (prixFcfa / dureeMois par défaut, actif). Le calcul d'un panier, lui, réutilise
  // `tarifCommande` ci-dessous : une seule source de vérité pour le prix.
  async grille() {
    const { formules, emplacements } = await ParametresService.get();
    return {
      // Essentielle : pas d'abonnement, à afficher comme « N fiches gratuites, puis emplacement
      // à paiement unique » (prix et packs dans `emplacements`).
      essentielle: {
        fichesGratuites: emplacements.fichesGratuites,
        paiementUnique: true,
      },
      formules: formules
        .filter(f => f.actif && f.formule !== "essentielle")
        .map(f => ({
          formule: f.formule,
          nom: f.nom,
          prixMensuelFcfa: f.prixMensuelFcfa,
          durees: f.durees,
          remises: f.remises,
        })),
      emplacements,
    };
  },

  // ───────── Formule : prix, durée par défaut, actif, remises durée, remises quantité ─────────
  async updateFormule(formule: string, input: PatchFormuleInput) {
    const type = toType(formule);

    if (
      type === "ESSENTIELLE" &&
      (input.prixMensuelFcfa !== undefined ||
        input.prixFcfa !== undefined ||
        input.dureeMois !== undefined ||
        input.durees !== undefined ||
        input.remises !== undefined)
    )
      throw ESSENTIELLE_SANS_ABONNEMENT();

    const plan = await prisma.$transaction(async tx => {
      const existe = await tx.plan.findUnique({
        where: { type },
        select: { id: true },
      });
      if (!existe) throw notFound("Formule introuvable");

      await tx.plan.update({
        where: { type },
        data: {
          ...(input.prixMensuelFcfa !== undefined && {
            prixMensuelFcfa: input.prixMensuelFcfa,
          }),
          ...(input.prixFcfa !== undefined && { prixFcfa: input.prixFcfa }),
          ...(input.dureeMois !== undefined && { dureeMois: input.dureeMois }),
          ...(input.actif !== undefined && { actif: input.actif }),
        },
      });

      // Les listes envoyées REMPLACENT les anciennes, dans la même transaction.
      if (input.durees !== undefined) {
        await tx.planDuree.deleteMany({ where: { planId: existe.id } });
        if (input.durees.length > 0)
          await tx.planDuree.createMany({
            data: input.durees.map(d => ({
              planId: existe.id,
              dureeMois: d.dureeMois,
              remisePct: d.remisePct,
            })),
          });
      }
      if (input.remises !== undefined) {
        await tx.planRemise.deleteMany({ where: { planId: existe.id } });
        if (input.remises.length > 0)
          await tx.planRemise.createMany({
            data: input.remises.map(r => ({
              planId: existe.id,
              quantiteMin: r.quantiteMin,
              remisePct: r.remisePct,
            })),
          });
      }

      return tx.plan.findUniqueOrThrow({ where: { type }, select: SELECT });
    });

    return { formule: toDto(plan) };
  },

  // ───────── Emplacements supplémentaires : prix unitaire + packs ─────────
  async updateEmplacements(input: PatchEmplacementsInput) {
    return prisma.$transaction(async tx => {
      const config = {
        ...(input.prixUnitaireFcfa !== undefined && {
          prixUnitaireFcfa: input.prixUnitaireFcfa,
        }),
        ...(input.fichesGratuites !== undefined && {
          fichesGratuites: input.fichesGratuites,
        }),
      };
      if (Object.keys(config).length > 0)
        await tx.emplacementConfig.upsert({
          where: { id: 1 },
          create: { id: 1, ...config },
          update: config,
        });

      if (input.packs !== undefined) {
        await tx.emplacementPack.deleteMany({});
        if (input.packs.length > 0)
          await tx.emplacementPack.createMany({
            data: input.packs.map(p => ({
              quantite: p.quantite,
              prixFcfa: p.prixFcfa,
            })),
          });
      }

      // Un pack doit toujours coûter moins cher que les mêmes emplacements à l'unité.
      const actuel = await lireEmplacements(tx);
      if (actuel.prixUnitaireFcfa !== null)
        for (const p of actuel.packs)
          if (p.prixFcfa >= p.quantite * actuel.prixUnitaireFcfa)
            throw unprocessable(
              "PACK_NON_AVANTAGEUX",
              `Le pack de ${p.quantite} doit coûter moins que ${p.quantite} × ${actuel.prixUnitaireFcfa} FCFA`
            );

      return { emplacements: actuel };
    });
  },

  // ───────── Aperçus de prix ─────────
  async tarif(
    formule: string,
    dureeMois: number,
    quantite: number,
    db: Db = prisma
  ) {
    const plan = await db.plan.findUnique({
      where: { type: toType(formule) },
      select: SELECT,
    });
    if (!plan) throw notFound("Formule introuvable");
    return {
      formule: plan.type.toLowerCase(),
      ...tarifLigne(plan, dureeMois, quantite, quantite, false),
    };
  },

  async tarifEmplacements(quantite: number, db: Db = prisma) {
    const { prixUnitaireFcfa, packs } = await lireEmplacements(db);
    if (prixUnitaireFcfa === null)
      throw unprocessable(
        "PRIX_EMPLACEMENT_NON_DEFINI",
        "Aucun prix n'est défini pour un emplacement supplémentaire"
      );
    return calculerEmplacements(prixUnitaireFcfa, packs, quantite);
  },

  // ───────── Prix d'une commande complète ─────────
  async tarifCommande(input: CommandeTarifInput, db: Db = prisma) {
    // Total de fiches par formule : c'est lui qui détermine le palier de quantité.
    const parFormule = new Map<PlanType, number>();
    for (const l of input.lignes) {
      const type = toType(l.formule);
      parFormule.set(type, (parFormule.get(type) ?? 0) + l.quantite);
    }

    const plans = await db.plan.findMany({
      where: { type: { in: [...parFormule.keys()] } },
      select: SELECT,
    });

    const lignes = input.lignes.map(l => {
      const type = toType(l.formule);
      const plan = plans.find(p => p.type === type);
      if (!plan) throw notFound("Formule introuvable");
      return {
        formule: l.formule,
        quantiteFormule: parFormule.get(type)!,
        ...tarifLigne(plan, l.dureeMois, l.quantite, parFormule.get(type)!, true),
      };
    });

    let emplacements: Awaited<ReturnType<typeof calculerEmplacements>> | null =
      null;
    if (input.emplacements) {
      // Emplacements = fiches Essentielle au-delà du quota gratuit, paiement unique.
      const cfg = await lireEmplacements(db);
      if (cfg.prixUnitaireFcfa === null)
        throw unprocessable(
          "PRIX_EMPLACEMENT_NON_DEFINI",
          "Aucun prix n'est défini pour un emplacement supplémentaire"
        );
      emplacements = calculerEmplacements(
        cfg.prixUnitaireFcfa,
        cfg.packs,
        input.emplacements
      );
    }

    const totalFcfa =
      lignes.reduce((n, l) => n + l.totalFcfa, 0) +
      (emplacements?.totalFcfa ?? 0);
    const totalSansRemiseFcfa =
      lignes.reduce((n, l) => n + l.totalSansRemiseFcfa, 0) +
      (emplacements?.totalSansPackFcfa ?? 0);

    return {
      lignes,
      emplacements,
      totalFcfa,
      totalSansRemiseFcfa,
      economieFcfa: totalSansRemiseFcfa - totalFcfa,
    };
  },
};