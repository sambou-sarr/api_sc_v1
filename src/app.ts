import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import {
  errorHandler,
  notFoundHandler,
  rateLimitHandler,
} from "./middlewares/errorHandler";
import { adminActionLogger } from "./middlewares/adminActionLogger";
import { requestLogger } from "./middlewares/requestLogger";
import { adminRouter } from "./modules/admin/admin.routes";
import {
  adminAppSettingsRouter,
  publicAppSettingsRouter,
} from "./modules/admin/app-settings.routes";
import { authRouter } from "./modules/auth/auth.routes";
import clientRoute from "./modules/client/client.route";
import { fichesRouter } from "./modules/fiches/fiches.routes";
import {
  adminLeadsRouter,
  publicLeadsRouter,
} from "./modules/leads/leads.routes";
import { mediaRouter } from "./modules/media/media.routes";
import {
  formulesRouter,
  parametresClientRouter,
} from "./modules/parametres/parametres.routes";
import { plansRouter } from "./modules/plans/plans.routes";
import { qrcodeRouter } from "./modules/qrcode/qrcode.routes";
import { relancesRouter } from "./modules/relances/relances.routes";
import { revenusRouter } from "./modules/revenus/revenus.routes";
import { scansRouter } from "./modules/scans/scans.routes";

import { env } from "./config/env";
import {
  productionRouter,
  qrPublicRouter,
} from "./modules/production/production.routes";
import subscriptionRoute from "./modules/subscriptions/subsctiption.route";

export const app = express();

app.set("trust proxy", 1); // derrière Nginx : indispensable pour que le rate limit voie la vraie IP
app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map(o => o.trim()) }));
// app.use(cors({ origin: "*" }));

app.use(express.json({ limit: "1mb" }));
app.use("/api", adminActionLogger);

// Redirection publique des QR dynamiques (les stickers imprimés pointent ici).
app.use("/q", qrPublicRouter);

// Limite globale + limite stricte sur l'authentification (anti brute-force).
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  })
);
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  })
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/plans", plansRouter);
app.use("/api/media", mediaRouter);
app.use("/api/fiches", fichesRouter);
app.use("/api/leads", publicLeadsRouter);
app.use("/api/scans", scansRouter); // route publique : pas de connexion

// Routes admin spécialisées : avant app.use("/api/admin", adminRouter)
app.use("/api/admin/formules", formulesRouter);
app.use("/api/admin/settings", adminAppSettingsRouter);
app.use("/api/public/settings", publicAppSettingsRouter);
app.use("/api/client/parametres", parametresClientRouter);
app.use("/api/admin/relances", relancesRouter);
app.use("/api/admin/revenus", revenusRouter);
app.use("/api/admin/qrcodes", qrcodeRouter);
app.use("/api/admin/leads", adminLeadsRouter);

app.use("/api/admin/production", productionRouter);
app.use("/api/admin", adminRouter);
app.use("/api/subscription", subscriptionRoute);
app.use("/api/client", clientRoute);

app.use(notFoundHandler);
app.use(errorHandler);
