import { asyncHandler } from "../../lib/asyncHandler";
import type { RelancesQuery } from "./relances.schemas";
import { RelancesService } from "./relances.service";

export const RelancesController = {
  list: asyncHandler(async (req, res) => {
    res.json(await RelancesService.list(req.query as unknown as RelancesQuery));
  }),
};
