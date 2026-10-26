import { asyncHandler } from "../../lib/asyncHandler";
import type { CreateLeadInput, ListLeadsQuery } from "./leads.schemas";
import { LeadsService } from "./leads.service";

export const LeadsController = {
  create: asyncHandler(async (req, res) => {
    const lead = await LeadsService.create(req.body as CreateLeadInput);
    res.status(201).json({ lead });
  }),

  list: asyncHandler(async (req, res) => {
    res.json(await LeadsService.list(req.query as unknown as ListLeadsQuery));
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const lead = await LeadsService.updateStatus(
      Number(req.params.id),
      req.body.status
    );
    res.json({ lead });
  }),
};
