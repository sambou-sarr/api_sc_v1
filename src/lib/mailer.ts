// Envoi d'e-mails : à brancher sur ton fournisseur (Resend, Brevo, SMTP…).
// En développement, les messages utilisent le transport SMTP de test.

import { MailtrapTransport } from "mailtrap";
import nodemailer from "nodemailer";
import { env } from "../config/env";
import { User } from "../database/prisma/generated/prisma/client";
import { createAuthToken } from "./authTokens";
import { logger } from "./logger";
import { resetPasswordEmailTemplate } from "./mailer/reset-password-template";
import { verificationEmailTemplate } from "./mailer/verification-template";

type SendParams = {
  to: string;
  subject: string;
  html: any;
  text: string;
};

const LOGO_URL = "";

const transport = selectTransport(env.NODE_ENV);

const sender = {
  address: "hello@demomailtrap.co",
  name: "Mailtrap Test",
};
const recipients = ["anomshacket@gmail.com"];

export const sendVerificationEmail = async (user: User) => {
  const token = await createAuthToken(user.id, "verify_email", 60 * 24);
  const verifyUrl = `${env.APP_URL}/verify-email?token=${token}`;
  const verificationPayload: SendParams = {
    to: user.email,
    subject: "Confirme ton adresse e-mail",
    html: verificationEmailTemplate(
      LOGO_URL,
      user.nom ?? "",
      verifyUrl,
      "24 heures"
    ),
    text: `Bonjour ${user.nom ?? ""}, confirmez votre e-mail : ${verifyUrl}`,
  };
  await sendMail(verificationPayload);
};

// ? send forgot password email
export const sendForgotPasswordMail = async (user: User) => {
  const token = await createAuthToken(user.id, "reset_password", 30);
  const verifyUrl = `${env.APP_URL}/reset-password?token=${token}`;

  const forgotPayload: SendParams = {
    to: user.email,
    subject: "Réinitialisation du mot de passe",
    html: resetPasswordEmailTemplate(
      LOGO_URL,
      user.nom ?? "",
      verifyUrl,
      "24 heures"
    ),
    text: `Bonjour ${user.nom ?? ""}, clicker sur ce lien pou réinitialisée votre mot de passe : ${verifyUrl}`,
  };

  await sendMail(forgotPayload);
};

// ? dynamic send email function
export const sendMail = async (data: {
  to: string;
  subject: string;
  html: any;
  text: string;
}) => {
  try {
    await transport.sendMail({
      from: sender,
      to: data.to,
      html: data.html,
      text: data.text,
      subject: data.subject,
    });
    logger.info("Email sent", { subject: data.subject });
  } catch (e) {
    logger.error("Email delivery failed", {
      subject: data.subject,
      errorName: e instanceof Error ? e.name : "UnknownError",
    });
    throw e;
  }
};

// ? Selected trasport depending on environment
function selectTransport(nodeEnv: string) {
  if (nodeEnv === "development") {
    return nodemailer.createTransport({
      host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: {
        user: "16b2a4f2957a59",
        pass: "35a7fc22f1f924",
      },
    });

    // production
  } else {
    return nodemailer.createTransport(
      MailtrapTransport({
        token: env.MAILTRAP_API_TOKEN,
      })
    );
  }
}
