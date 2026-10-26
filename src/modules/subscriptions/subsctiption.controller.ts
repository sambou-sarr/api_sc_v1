import type { PlanType } from "../../database/prisma/generated/prisma/client";
import { responseSuccess } from "../../lib/apiResponse";
import { asyncHandler } from "../../lib/asyncHandler";
import { confirmSimulatedPayment, filter, subscriptionKpi, upgrade } from "./subscriptions.service";

export const SubscriptionController = {
  subscriptionKpi: asyncHandler(async (req, res) => {
    const kpi = await subscriptionKpi(req.user!);
    responseSuccess(
      res,
      {
        nbrFiche: kpi.nbrFiche,
        nbrFicheActive: kpi.nbrFicheActive,
        nbrPayingFiche: kpi.nbrPayingFiche,
      },
      200
    );
  }),

  upgradePlan: asyncHandler(async (req, res) => {
    const { ficheId, plan, dureeMois } = req.body as {
      ficheId: number;
      plan: "pro" | "signature";
      dureeMois?: number;
    };
    const result = await upgrade(
      req.user!,
      ficheId,
      plan.toUpperCase() as PlanType,
      dureeMois
    );
    responseSuccess(
      res,
      result,
      201,
      "Demande de paiement créée ; la formule reste inchangée jusqu’à confirmation"
    );
  }),

  confirmSimulatedPayment: asyncHandler(async (req, res) => {
    const paymentId = Number(req.params.paymentId);
    const result = await confirmSimulatedPayment(req.user!, paymentId);
    responseSuccess(res, result, 200, "Paiement simulé confirmé et formule activée");
  }),

  filter: asyncHandler(async (req, res) => {
    const { plan } = req.query;

    const result = await filter(plan as string);
    responseSuccess(res, result, 200);
  }),
};
