import type { PlanType } from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { notFound } from "../../lib/httpError";
import type { PatchFormuleInput } from "./parametres.schemas";

// Les réglages sont ceux de la table `plans` (aucune table en plus).
// Ils servent de VALEURS PAR DÉFAUT à l'activation d'un abonnement :
// montant = plan.prixFcfa, fin = début + plan.dureeMois. Les abonnements déjà créés ne changent pas.
const ORDRE: PlanType[] = ["ESSENTIELLE", "PRO", "SIGNATURE"];

const SELECT = {
  type: true,
  nom: true,
  prixFcfa: true,
  dureeMois: true,
  actif: true,
} as const;

type Plan = {
  type: PlanType;
  nom: string;
  prixFcfa: number | null;
  dureeMois: number | null;
  actif: boolean;
};

const toDto = (p: Plan) => ({
  formule: p.type.toLowerCase(),
  nom: p.nom,
  prixFcfa: p.prixFcfa,
  dureeMois: p.dureeMois,
  actif: p.actif,
});

export const ParametresService = {
  async get() {
    const plans = await prisma.plan.findMany({ select: SELECT });
    plans.sort((a, b) => ORDRE.indexOf(a.type) - ORDRE.indexOf(b.type));
    return { formules: plans.map(toDto) };
  },

  async updateFormule(formule: string, input: PatchFormuleInput) {
    const type = formule.toUpperCase() as PlanType;
    const existe = await prisma.plan.findUnique({
      where: { type },
      select: { id: true },
    });
    if (!existe) throw notFound("Formule introuvable");

    const plan = await prisma.plan.update({
      where: { type },
      data: {
        ...(input.prixFcfa !== undefined && { prixFcfa: input.prixFcfa }),
        ...(input.dureeMois !== undefined && { dureeMois: input.dureeMois }),
        ...(input.actif !== undefined && { actif: input.actif }),
      },
      select: SELECT,
    });
    return { formule: toDto(plan) };
  },
};
