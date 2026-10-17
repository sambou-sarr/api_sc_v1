import { asyncHandler } from "../../lib/asyncHandler";
import { RevenusService } from "./revenus.service";

export const RevenusController = {
  get: asyncHandler(async (_req, res) => {
    res.json(await RevenusService.get());
  }),
};
