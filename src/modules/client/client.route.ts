import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { ClientController } from "./client.controller";

const clientRoute = Router();

clientRoute.use(requireAuth);
clientRoute.get("/dashboard/fiches", ClientController.getFichesDetail);

export default clientRoute;
