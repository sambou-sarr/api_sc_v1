import type { Request, Response } from "express";
import { prisma } from "../../database/prisma/prisma-client";
import { asyncHandler } from "../../lib/asyncHandler";
import { AuthService as auth, publicUser } from "./auth.service";

export const AuthController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await auth.register(req.body);

    return res.status(201).json({ status: "ok", data: result });
  }),

  // Connexion classique conservée pour compatibilité avec les clients existants.
  login: asyncHandler(async (req: Request, res: Response) => {
    res.json(await auth.login(req.body));
  }),

  // Connexion dédiée à l’espace client : seuls les comptes CLIENT sont acceptés.
  clientLogin: asyncHandler(async (req: Request, res: Response) => {
    res.json(await auth.login(req.body, "CLIENT"));
  }),

  // Connexion dédiée à l’espace administration : seuls les comptes ADMIN sont acceptés.
  adminLogin: asyncHandler(async (req: Request, res: Response) => {
    res.json(await auth.login(req.body, "ADMIN"));
  }),

  verifyEmail: asyncHandler(async (req: Request, res: Response) => {
    await auth.verifyEmail(req.body.token);
    res.json({ ok: true });
  }),

  resendVerificationEmail: asyncHandler(async (req: Request, res: Response) => {
    await auth.resendVerification(req.user!.id);
    res.json({ ok: true });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    await auth.forgotPassword(req.body.email);
    res.json({ ok: true }); // toujours la même réponse
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    await auth.resetPassword(req.body.token, req.body.password);
    res.json({ ok: true });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
    });
    res.json({ user: publicUser(user) });
  }),
};
