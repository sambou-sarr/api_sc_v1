import {
  Disposition,
  PlanType,
  Prisma,
  TabType,
  Theme,
} from "../database/prisma/generated/prisma/client";
import { prisma } from "../database/prisma/prisma-client";
import { logger } from "../lib/logger";
import {
  DEFAULT_PLAN_DUREES,
  DEFAULT_PLAN_REMISES,
} from "../modules/parametres/parametres.tarifs";

const TOUS_LES_BLOCS: TabType[] = [
  "PRESENTATION",
  "MENU",
  "BIENS",
  "CATALOGUE",
  "GALERIE",
  "VIDEOS",
  "LIENS",
  "RENDEZVOUS",
  "RAPPEL",
  "HORAIRES",
  "AVIS",
  "RESEAUX",
  "LOCALISATION",
  "TEXTE",
];

type PlanSeed = {
  type: PlanType;
  nom: string;
  themeDefaut: Theme;
  prixMensuelFcfa: number | null;
  prixFcfa: number | null; // prix affichés sur la page d'accueil : à confirmer
  dureeMois: number | null; // durée supposée : à confirmer
  limits: Omit<Prisma.PlanLimitUncheckedCreateInput, "planId">;
};

const PLANS: PlanSeed[] = [
  {
    type: "ESSENTIELLE",
    nom: "Essentielle",
    themeDefaut: "BLEU",
    prixMensuelFcfa: null,
    prixFcfa: 12000,
    dureeMois: 12,
    limits: {
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
      hasCatalog: false,
      catalogPrices: false,
      hasGoogleReview: false,
      hasStats: false,
      hasForm: false,
      hasDashboard: false,
    },
  },
  {
    type: "PRO",
    nom: "Pro",
    themeDefaut: "CLAIR",
    prixMensuelFcfa: 2500,
    prixFcfa: 15000,
    dureeMois: 12,
    limits: {
      tabsAutorises: [
        "PRESENTATION",
        "CATALOGUE",
        "GALERIE",
        "VIDEOS",
        "LIENS",
        "HORAIRES",
        "AVIS",
        "RESEAUX",
        "LOCALISATION",
      ],
      headerLayouts: ["PORTRAIT"],
      themes: ["CLAIR", "BLEU"],
      canReorder: true,
      canHide: true,
      canAdd: false,
      canRename: false,
      maxCustomTabs: 0,
      maxPresentation: 800,
      maxSocial: 6,
      maxLinks: 10,
      maxPhotos: 4,
      maxVideos: 1,
      hasCatalog: true,
      maxCatalogSections: 2,
      maxCatalogArticlesPerSection: 12,
      catalogPrices: false,
      hasGoogleReview: true,
      hasStats: true,
      hasForm: false,
      hasDashboard: false,
    },
  },
  {
    type: "SIGNATURE",
    nom: "Signature",
    themeDefaut: "OR",
    prixMensuelFcfa: 5000,
    prixFcfa: 75000,
    dureeMois: 12,
    limits: {
      tabsAutorises: TOUS_LES_BLOCS,
      headerLayouts: ["PORTRAIT", "LOGO", "BANNIERE", "DUO"] as Disposition[],
      themes: ["OR", "CLAIR", "BLEU", "NUIT"],
      canReorder: true,
      canHide: true,
      canAdd: true,
      canRename: true,
      maxCustomTabs: 4,
      maxPresentation: 2000,
      maxSocial: 10,
      maxLinks: 10,
      maxPhotos: 8,
      maxVideos: 3,
      hasCatalog: true,
      maxCatalogSections: 6,
      maxCatalogArticlesPerSection: 12,
      catalogPrices: true,
      hasMenu: true,
      maxMenuSections: 6,
      maxMenuItemsPerSection: 12,
      menuVideoPerItem: true,
      maxMenuVideoSeconds: 30,
      hasBiens: true,
      maxBiens: 30,
      maxPhotosPerBien: 10,
      hasGoogleReview: true,
      hasStats: true,
      hasForm: true,
      hasDashboard: true,
    },
  },
];

async function main() {
  await prisma.emplacementConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, prixUnitaireFcfa: 1000 },
  });

  for (const p of PLANS) {
    const plan = await prisma.plan.upsert({
      where: { type: p.type },
      update: {
        nom: p.nom,
        themeDefaut: p.themeDefaut,
        prixFcfa: p.prixFcfa,
        dureeMois: p.dureeMois,
      },
      create: {
        type: p.type,
        nom: p.nom,
        themeDefaut: p.themeDefaut,
        prixMensuelFcfa: p.prixMensuelFcfa,
        prixFcfa: p.prixFcfa,
        dureeMois: p.dureeMois,
      },
    });

    await prisma.planLimit.upsert({
      where: { planId: plan.id },
      update: p.limits,
      create: { planId: plan.id, ...p.limits },
    });

    if (p.prixMensuelFcfa !== null)
      await prisma.plan.updateMany({
        where: { id: plan.id, prixMensuelFcfa: null },
        data: { prixMensuelFcfa: p.prixMensuelFcfa },
      });

    const dureesParDefaut =
      p.type === "ESSENTIELLE"
        ? p.dureeMois
          ? [{ dureeMois: p.dureeMois, remisePct: 0 }]
          : []
        : DEFAULT_PLAN_DUREES[p.type];
    for (const duree of dureesParDefaut)
      await prisma.planDuree.upsert({
        where: {
          planId_dureeMois: {
            planId: plan.id,
            dureeMois: duree.dureeMois,
          },
        },
        update: {},
        create: { planId: plan.id, ...duree },
      });

    if (p.type !== "ESSENTIELLE")
      for (const remise of DEFAULT_PLAN_REMISES[p.type])
        await prisma.planRemise.upsert({
          where: {
            planId_quantiteMin: {
              planId: plan.id,
              quantiteMin: remise.quantiteMin,
            },
          },
          update: {},
          create: { planId: plan.id, ...remise },
        });

    logger.info("Plan seeded", { planId: plan.id, plan: p.nom });
  }
}

main()
  .catch(e => {
    logger.error("Plan seeding failed", {
      error:
        e instanceof Error
          ? { name: e.name, message: e.message, stack: e.stack }
          : String(e),
    });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
