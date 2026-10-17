import { asyncHandler } from "../../lib/asyncHandler";
import type {
  DeleteFicheQuery,
  ListFichesQuery,
  ListUsersQuery,
} from "./admin.schemas";
import { AdminService } from "./admin.service";

// Un controller ne fait que 3 choses : lire la requête, appeler le service, répondre.
// asyncHandler = pour que les erreurs (404, 409...) arrivent bien dans errorHandler.
//
// validate() (dans les routes) a déjà nettoyé et converti body / params / query :
// ici on peut leur faire confiance.
export const AdminController = {
  // ───── Tableau de bord ─────
  stats: asyncHandler(async (_req, res) => {
    res.json(await AdminService.stats());
  }),

  // ───── Fiches ─────
  listFiches: asyncHandler(async (req, res) => {
    const filtres = req.query as unknown as ListFichesQuery;
    res.json(await AdminService.listFiches(filtres));
  }),

  getFiche: asyncHandler(async (req, res) => {
    res.json(await AdminService.getFiche(Number(req.params.id)));
  }),

  createFiche: asyncHandler(async (req, res) => {
    res.status(201).json(await AdminService.createFiche(req.body));
  }),

  updateFiche: asyncHandler(async (req, res) => {
    const fiche = await AdminService.updateFiche(
      Number(req.params.id),
      req.body
    );
    res.json({ fiche });
  }),

  deleteFiche: asyncHandler(async (req, res) => {
    const { confirmer } = req.query as unknown as DeleteFicheQuery;
    await AdminService.deleteFiche(Number(req.params.id), confirmer);
    res.json({ ok: true });
  }),

  generateClaimCode: asyncHandler(async (req, res) => {
    res.json(await AdminService.generateClaimCode(Number(req.params.id)));
  }),

  // ───── Abonnements ─────
  activateSubscription: asyncHandler(async (req, res) => {
    const subscription = await AdminService.activateSubscription(
      Number(req.params.id),
      req.body
    );
    res.status(201).json({ subscription });
  }),

  cancelSubscription: asyncHandler(async (req, res) => {
    const subscription = await AdminService.cancelSubscription(
      Number(req.params.id),
      Number(req.params.subId)
    );
    res.json({ subscription });
  }),

  // ───── Utilisateurs ─────
  listUsers: asyncHandler(async (req, res) => {
    const filtres = req.query as unknown as ListUsersQuery;
    res.json(await AdminService.listUsers(filtres));
  }),
};
