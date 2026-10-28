import { asyncHandler } from "../../lib/asyncHandler";
import { ProductionService } from "../production/production.service";
import { FichePurchasesService } from "./services/fiche-purchases.service";
import { FicheService } from "./services/fiches.service";
import {
  PassageService,
  type PassageSource,
} from "./services/passages.service";
import { RappelService } from "./services/rappels.service";

export const FicheController = {
  createPublicRappel: asyncHandler(async (req, res) => {
    const result = await RappelService.createPublic(
      String(req.params.slug),
      req.body
    );
    res.status(201).json({ ok: true, demande: result });
  }),

  listAllRappels: asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    res.json({
      rappels: await RappelService.listForUser(req.user!, page, limit),
    });
  }),

  totalFiches: asyncHandler(async (req, res) => {
    const status = await FicheService.creationStatus(req.user!);
    res.json({
      isLimitReached: status.freeSlots === 0,
      ...status,
    });
  }),

  quotePurchase: asyncHandler(async (req, res) => {
    res.json({
      quote: await FichePurchasesService.quote(req.user!, req.body),
    });
  }),

  createPurchase: asyncHandler(async (req, res) => {
    res.status(201).json({
      ...(await FichePurchasesService.create(req.user!, req.body)),
    });
  }),

  confirmPurchase: asyncHandler(async (req, res) => {
    res.json({
      ...(await FichePurchasesService.confirmSimulated(
        req.user!,
        Number(req.params.purchaseId)
      )),
    });
  }),

  listRappels: asyncHandler(async (req, res) => {
    res.json({
      rappels: await RappelService.listForFiche(
        req.user!,
        Number(req.params.id)
      ),
    });
  }),

  getCardRequest: asyncHandler(async (req, res) => {
    res.json(
      await ProductionService.getClientCardRequest(
        req.user!,
        Number(req.params.id)
      )
    );
  }),

  createCardRequest: asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await ProductionService.requestClientCarte(
          req.user!,
          Number(req.params.id),
          req.body
        )
      );
  }),

  recordPublicPassage: asyncHandler(async (req, res) => {
    const source = String(req.body.source).toUpperCase() as PassageSource;
    const result = await PassageService.record(
      String(req.params.slug),
      source,
      String(req.body.idempotencyKey),
      req.user
    );
    res.status(result.recorded ? 201 : 200).json({ ok: true, ...result });
  }),

  getPassageStats: asyncHandler(async (req, res) => {
    const result = await PassageService.stats(
      req.user!,
      Number(req.params.id),
      {
        granularity: req.query.granularity === "day" ? "day" : "month",
        ...(typeof req.query.date === "string" ? { date: req.query.date } : {}),
        ...(typeof req.query.month === "string"
          ? { month: req.query.month }
          : {}),
      }
    );
    res.json({ stats: result });
  }),

  getPublicFiche: asyncHandler(async (req, res) => {
    res.json({
      fiche: await FicheService.getPublicFiche(String(req.params.slug)),
    });
  }),

  listFiches: asyncHandler(async (req, res) => {
    res.json({ fiches: await FicheService.listFiches(req.user!) });
  }),

  createFiche: asyncHandler(async (req, res) => {
    res
      .status(201)
      .json({ fiche: await FicheService.createFiche(req.user!, req.body) });
  }),

  getFiche: asyncHandler(async (req, res) => {
    res.json({
      fiche: await FicheService.getFiche(req.user!, Number(req.params.id)),
    });
  }),

  publishFiche: asyncHandler(async (req, res) => {
    res.json({
      fiche: await FicheService.publishFiche(req.user!, Number(req.params.id)),
    });
  }),

  updateFiche: asyncHandler(async (req, res) => {
    res.json({
      fiche: await FicheService.updateFiche(
        req.user!,
        Number(req.params.id),
        req.body
      ),
    });
  }),

  deleteFiche: asyncHandler(async (req, res) => {
    res.json({
      fiche: await FicheService.deleteFiche(req.user!, Number(req.params.id)),
    });
  }),
};
