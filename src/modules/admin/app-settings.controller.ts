import { asyncHandler } from "../../lib/asyncHandler";
import { AppSettingsService } from "./app-settings.service";

export const AppSettingsController = {
  getAdmin: asyncHandler(async (_req, res) => {
    res.json({ settings: await AppSettingsService.getAdmin() });
  }),

  update: asyncHandler(async (req, res) => {
    res.json({ settings: await AppSettingsService.update(req.body) });
  }),

  getPublic: asyncHandler(async (_req, res) => {
    res.json({ settings: await AppSettingsService.getPublic() });
  }),
};
