import type { User } from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { consumeAuthToken } from "../../lib/authTokens";
import { badRequest, conflict, unauthorized } from "../../lib/httpError";
import { signToken } from "../../lib/jwt";
import { logger } from "../../lib/logger";
import {
  sendForgotPasswordMail,
  sendVerificationEmail,
} from "../../lib/mailer";
import { hashPassword, verifyPassword } from "../../lib/password";

export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  nom: u.nom,
  role: u.role,
  emailVerified: u.emailVerifiedAt !== null,
});

// Hash factice : on compare toujours un mot de passe, même si l'e-mail n'existe pas (limite l'énumération par le temps de réponse).
const DUMMY_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5vLq6o3k1p6n4wP6b4v0Y0o0o0o0o0o";

export const AuthService = {
  // ? Register
  register: async (input: {
    email: string;
    password: string;
    nom?: string;
  }) => {
    const exists = await prisma.user.findUnique({
      where: { email: input.email },
    }); 
    if (exists)
      throw conflict(
        "EMAIL_DEJA_UTILISE",
        "Un compte existe déjà avec cet e-mail"
      );

    // Le rôle n'est JAMAIS pris dans la requête : toute inscription = CLIENT.
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        nom: input.nom,
        role: "CLIENT",
      },
    });

    logger.info("User registered", { userId: user.id });
    await sendVerificationEmail(user);
    return { user: publicUser(user), token: signToken(user.id) };
  },

  // Login
  login: async (input: { email: string; password: string }, expectedRole?: "CLIENT" | "ADMIN") => {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    const ok = await verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_HASH
    );
    if (!user || !ok) {
      logger.warn("Authentication failed", { reason: "invalid_credentials" });
      throw unauthorized("E-mail ou mot de passe incorrect");
    }
    // Un espace ne peut accepter que le rôle prévu : un client ne peut pas entrer dans /admin.
    if (expectedRole && user.role !== expectedRole) {
      logger.warn("Authentication failed", {
        reason: "wrong_role_for_space",
        userId: user.id,
        expectedRole,
      });
      throw unauthorized("Identifiants invalides");
    }
    logger.info("User authenticated", { userId: user.id });
    return { user: publicUser(user), token: signToken(user.id) };
  },

  verifyEmail: async (token: string) => {
    const userId = await consumeAuthToken(token, "verify_email");
    if (!userId) throw badRequest("TOKEN_INVALIDE", "Lien invalide ou expiré");
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    logger.info("User email verified", { userId });
  },

  // ==========================================
  resendVerification: async (userId: number) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) {
      logger.info("Verification email request skipped", {
        userId,
        reason: "email_already_verified",
      });
      return;
    }
    await sendVerificationEmail(user);
    logger.info("Verification email resent", { userId });
  },

  forgotPassword: async (email: string) => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }
    await sendForgotPasswordMail(user);
    logger.info("Password reset email requested", { userId: user.id });
  },

  resetPassword: async (token: string, password: string) => {
    const userId = await consumeAuthToken(token, "reset_password");
    if (!userId) throw badRequest("TOKEN_INVALIDE", "Lien invalide ou expiré");
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password) },
    });
    logger.info("User password reset", { userId });
  },
};
