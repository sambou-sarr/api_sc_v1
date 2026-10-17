import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { AuthController } from "./auth.controller";
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from "./auth.schemas";

export const authRouter = Router();

authRouter.post(
  "/register",
  validate({ body: registerSchema }),
  AuthController.register
);

// Les deux espaces utilisent le même système d’identités, mais des connexions séparées.
authRouter.post("/login", validate({ body: loginSchema }), AuthController.login);
authRouter.post("/client/login", validate({ body: loginSchema }), AuthController.clientLogin);
authRouter.post("/admin/login", validate({ body: loginSchema }), AuthController.adminLogin);

authRouter.post(
  "/verify-email",
  validate({ body: tokenSchema }),
  AuthController.verifyEmail
);

authRouter.post(
  "/resend-verification",
  requireAuth,
  AuthController.resendVerificationEmail
);

authRouter.post(
  "/forgot-password",
  validate({ body: emailOnlySchema }),
  AuthController.forgotPassword
);

authRouter.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  AuthController.resetPassword
);

authRouter.get("/me", requireAuth, AuthController.me);
