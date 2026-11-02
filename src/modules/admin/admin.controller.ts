import { asyncHandler } from "../../lib/asyncHandler";
import type {
  DeleteFicheQuery,
  ListFichesQuery,
  ListPaymentsQuery,
  ListSubscriptionsQuery,
  ListAdminActionLogsQuery,
  ListUsersQuery,
  CreateAdminInput,
  AdminStatusInput,
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

  listSubscriptions: asyncHandler(async (req, res) => {
    const filtres = req.query as unknown as ListSubscriptionsQuery;
    res.json(await AdminService.listSubscriptions(filtres));
  }),

  listPayments: asyncHandler(async (req, res) => {
    const filtres = req.query as unknown as ListPaymentsQuery;
    res.json(await AdminService.listPayments(filtres));
  }),

  // ───── Fiches ─────
  listFiches: asyncHandler(async (req, res) => {
    const filtres = req.query as unknown as ListFichesQuery;
    res.json(await AdminService.listFiches(filtres));
  }),

  getFiche: asyncHandler(async (req, res) => {
    res.json(await AdminService.getFiche(Number(req.params.id)));
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

  listActionLogs: asyncHandler(async (req, res) => {
    const filtres = req.query as unknown as ListAdminActionLogsQuery;
    res.json(await AdminService.listActionLogs(filtres));
  }),

  createAdmin: asyncHandler(async (req, res) => {
    const result = await AdminService.createAdmin(req.body as CreateAdminInput);
    res.status(result.created ? 201 : 200).json(result);
  }),

  resendAdminInvitation: asyncHandler(async (req, res) => {
    await AdminService.resendAdminInvitation(Number(req.params.id));
    res.json({ ok: true });
  }),

  setAdminStatus: asyncHandler(async (req, res) => {
    const body = req.body as AdminStatusInput;
    await AdminService.setAdminStatus(
      Number(req.params.id),
      req.user!.id,
      body.active
    );
    res.json({ ok: true });
  }),

  deleteAdmin: asyncHandler(async (req, res) => {
    await AdminService.deleteAdmin(Number(req.params.id), req.user!.id);
    res.json({ ok: true });
  }),
};
