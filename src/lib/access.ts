import { AuthUser } from "../types/user";
import { notFound } from "./httpError";
import { logger } from "./logger";

export const isAdmin = (u: AuthUser) => u.role === "ADMIN";

export function assertAccess(user: AuthUser, fiche: { userId: number | null }) {
  if (!isAdmin(user) && fiche.userId !== user.id)
    logger.warn("Attemps to access fiche with no permission", user);
  throw notFound("Fiche introuvable");
}

export function belongTo(user: AuthUser, entity: any) {
  console.log(entity);
  if (!isAdmin(user) && entity.userId !== user.id) {
    logger.warn("Attemps to access a ressource with no permission", user);
    return false;
  }
  return true;
}
