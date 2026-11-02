import { asyncHandler } from "../../lib/asyncHandler";
import { RevenusService } from "./revenus.service";

export const RevenusController = {
  get: asyncHandler(async (req, res) => {
    res.json(await RevenusService.get(req.query as { from: string; to: string }));
  }),
};
