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
  remiseDuree,
  remiseQuantite,
} from "./parametres.tarifs";

// Les réglages vivent dans `plans` (+ `plan_durees`, `plan_remises`) et dans
// `emplacement_config` / `emplacement_packs`. Ils servent de VALEURS PAR DÉFAUT :
// les abonnements déjà créés ne changent jamais.
const ORDRE: PlanType[] = ["ESSENTIELLE", "PRO", "SIGNATURE"];

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
  durees: p.durees, // [{ dureeMois, remisePct }]
  remises: p.remises, // [{ quantiteMin, remisePct }]
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
  return { prixUnitaireFcfa: config?.prixUnitaireFcfa ?? null, packs };
}

// Prix d'une ligne d'abonnement, avec les contrôles métier.
function tarifLigne(
  plan: Plan,
  dureeMois: number,
  quantite: number,
  quantiteFormule: number,
  exigerActif: boolean
) {
  if (exigerActif && !plan.actif)
    throw unprocessable("FORMULE_INACTIVE", `La formule ${plan.nom} est désactivée`);
  if (plan.prixMensuelFcfa === null)
    throw unprocessable(
      "PRIX_NON_DEFINI",
      `Aucun prix mensuel n'est défini pour la formule ${plan.nom}`
    );
  const remiseDureePct = remiseDuree(plan.durees, dureeMois);
  if (remiseDureePct === undefined)
    throw unprocessable(
      "DUREE_NON_PROPOSEE",
      `La durée de ${dureeMois} mois n'est pas proposée pour la formule ${plan.nom}`
    );

  return calculerTarif({
    prixMensuelFcfa: plan.prixMensuelFcfa,
    dureeMois,
    remiseDureePct,
    remiseQuantitePct: remiseQuantite(plan.remises, quantiteFormule),
    quantite,
  });
}

export const ParametresService = {
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
  // Seulement les formules actives et chiffrées, sans les champs réservés à l'admin
  // (prixFcfa / dureeMois par défaut, actif). Le calcul d'un panier, lui, réutilise
  // `tarifCommande` ci-dessous : une seule source de vérité pour le prix.
  async grille() {
    const { formules, emplacements } = await ParametresService.get();
    return {
      formules: formules
        .filter(f => f.actif && f.prixMensuelFcfa !== null)
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
      if (input.prixUnitaireFcfa !== undefined)
        await tx.emplacementConfig.upsert({
          where: { id: 1 },
          create: { id: 1, prixUnitaireFcfa: input.prixUnitaireFcfa },
          update: { prixUnitaireFcfa: input.prixUnitaireFcfa },
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
  async tarif(formule: string, dureeMois: number, quantite: number) {
    const plan = await prisma.plan.findUnique({
      where: { type: toType(formule) },
      select: SELECT,
    });
    if (!plan) throw notFound("Formule introuvable");
    return {
      formule: plan.type.toLowerCase(),
      ...tarifLigne(plan, dureeMois, quantite, quantite, false),
    };
  },

  async tarifEmplacements(quantite: number) {
    const { prixUnitaireFcfa, packs } = await lireEmplacements();
    if (prixUnitaireFcfa === null)
      throw unprocessable(
        "PRIX_EMPLACEMENT_NON_DEFINI",
        "Aucun prix n'est défini pour un emplacement supplémentaire"
      );
    return calculerEmplacements(prixUnitaireFcfa, packs, quantite);
  },

  // ───────── Prix d'une commande complète ─────────
  async tarifCommande(input: CommandeTarifInput) {
    // Total de fiches par formule : c'est lui qui détermine le palier de quantité.
    const parFormule = new Map<PlanType, number>();
    for (const l of input.lignes) {
      const type = toType(l.formule);
      parFormule.set(type, (parFormule.get(type) ?? 0) + l.quantite);
    }

    const plans = await prisma.plan.findMany({
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
      const cfg = await lireEmplacements();
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