import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { AppSettingsController } from "./app-settings.controller";
import { updateAppSettingsSchema } from "./app-settings.schemas";

export const adminAppSettingsRouter = Router();
adminAppSettingsRouter.use(requireAuth, requireRole("ADMIN"));
adminAppSettingsRouter.get("/", AppSettingsController.getAdmin);
adminAppSettingsRouter.patch(
  "/",
  validate({ body: updateAppSettingsSchema }),
  AppSettingsController.update
);

export const publicAppSettingsRouter = Router();
publicAppSettingsRouter.get("/", AppSettingsController.getPublic);
