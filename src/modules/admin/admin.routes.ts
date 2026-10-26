import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { idParam } from "../fiches/fiches.schemas";
import { AdminController } from "./admin.controller";
import {
  deleteFicheQuery,
  listFichesQuery,
  listUsersQuery,
  patchFicheSchema,
  subscriptionParams,
  subscriptionSchema,
} from "./admin.schemas";

// Tout ce qu'un CLIENT ne peut jamais faire : voir toutes les fiches,
// statut, propriétaire, formule, suppression.
export const adminRouter = Router();

// Équivalent de Route::middleware(['auth', 'role:admin'])->group(...)
// Toutes les routes ci-dessous sont protégées.
adminRouter.use(requireAuth, requireRole("ADMIN"));

// ───────── Tableau de bord ─────────
// GET /api/admin/stats
adminRouter.get("/stats", AdminController.stats);

// ───────── Fiches ─────────
// GET    /api/admin/fiches?search=&statut=&formule=&expiration=&userId=&tri=&page=&limit=
adminRouter.get(
  "/fiches",
  validate({ query: listFichesQuery }),
  AdminController.listFiches
);

// GET    /api/admin/fiches/:id                 détail + historique des abonnements
adminRouter.get(
  "/fiches/:id",
  validate({ params: idParam }),
  AdminController.getFiche
);

// PATCH  /api/admin/fiches/:id                 statut (active/suspendue), slug avant compte client
adminRouter.patch(
  "/fiches/:id",
  validate({ params: idParam, body: patchFicheSchema }),
  AdminController.updateFiche
);

// DELETE /api/admin/fiches/:id?confirmer=<slug> suppression définitive
adminRouter.delete(
  "/fiches/:id",
  validate({ params: idParam, query: deleteFicheQuery }),
  AdminController.deleteFiche
);

// ───────── Abonnements d'une fiche ─────────
// POST   /api/admin/fiches/:id/subscription    activer une formule (ancienne route conservée)
adminRouter.post(
  "/fiches/:id/subscription",
  validate({ params: idParam, body: subscriptionSchema }),
  AdminController.activateSubscription
);

// POST   /api/admin/fiches/:id/subscriptions/:subId/cancel
adminRouter.post(
  "/fiches/:id/subscriptions/:subId/cancel",
  validate({ params: subscriptionParams }),
  AdminController.cancelSubscription
);

// ───────── Utilisateurs ─────────
// GET    /api/admin/users?search=&role=&page=&limit=
adminRouter.get(
  "/users",
  validate({ query: listUsersQuery }),
  AdminController.listUsers
);