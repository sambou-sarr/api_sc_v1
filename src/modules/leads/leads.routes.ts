import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { LeadsController } from "./leads.controller";
import {
  createLeadSchema,
  leadIdParams,
  listLeadsQuery,
  updateLeadSchema,
} from "./leads.schemas";

export const publicLeadsRouter = Router();
publicLeadsRouter.post(
  "/",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  validate({ body: createLeadSchema }),
  LeadsController.create
);

export const adminLeadsRouter = Router();
adminLeadsRouter.use(requireAuth, requireRole("ADMIN"));
adminLeadsRouter.get(
  "/",
  validate({ query: listLeadsQuery }),
  LeadsController.list
);
adminLeadsRouter.patch(
  "/:id",
  validate({ params: leadIdParams, body: updateLeadSchema }),
  LeadsController.updateStatus
);
