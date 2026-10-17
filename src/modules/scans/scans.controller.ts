import { asyncHandler } from "../../lib/asyncHandler";
import { ScansService } from "./scans.service";

export const ScansController = {
  hit: asyncHandler(async (req, res) => {
    await ScansService.enregistrer(
      req.params.slug as string,
      req.ip ?? "inconnu",
      req.get("user-agent") ?? ""
    );
    res.status(204).end();
  }),
};
