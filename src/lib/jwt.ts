import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export type JwtPayload = { sub: string }; // id de l'utilisateur ; le rôle est relu en base à chaque requête

export const signToken = (userId: number) =>
  jwt.sign({ sub: String(userId) } satisfies JwtPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });

export const verifyToken = (token: string): JwtPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || typeof decoded.sub !== "string")
    throw new Error("Token invalide");
  return { sub: decoded.sub };
};
