import { createHash, randomBytes } from "crypto";
import { prisma } from "../database/prisma/prisma-client";

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

// On ne stocke que le hash : le token brut n'existe que dans l'e-mail.
export async function createAuthToken(
  userId: number,
  type: "verify_email" | "reset_password",
  ttlMinutes: number
) {
  const raw = randomBytes(32).toString("hex");
  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    },
  });
  return raw;
}

// Retourne l'id de l'utilisateur si le token est valide, et le marque comme utilisé.
export async function consumeAuthToken(
  raw: string,
  type: "verify_email" | "reset_password"
) {
  const row = await prisma.authToken.findUnique({
    where: { tokenHash: hash(raw) },
  });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date())
    return null;
  await prisma.authToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return row.userId;
}
