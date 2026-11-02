import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { SubscriptionController } from "./subsctiption.controller";

const subscriptionRoute = Router();

const upgradeSchema = z.object({
  ficheId: z.number().int().positive(),
  plan: z.enum(["pro", "signature"]),
  dureeMois: z.number().int().min(1).max(120).optional(),
});

subscriptionRoute.use(requireAuth);
subscriptionRoute.get("/kpi", SubscriptionController.subscriptionKpi);
subscriptionRoute.get(
  "/payments",
  validate({
    query: z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  SubscriptionController.listPayments
);
subscriptionRoute.post(
  "/upgrade",
  validate({ body: upgradeSchema }),
  SubscriptionController.upgradePlan
);
subscriptionRoute.post(
  "/payments/:paymentId/simulate-confirmation",
  validate({
    params: z.object({ paymentId: z.coerce.number().int().positive() }),
  }),
  SubscriptionController.confirmSimulatedPayment
);
subscriptionRoute.get("/filter", SubscriptionController.filter);

export default subscriptionRoute;
