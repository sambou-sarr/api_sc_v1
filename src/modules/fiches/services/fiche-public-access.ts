import { getEffectiveSubscription } from "../../subscriptions/subscriptions.service";

export async function getPublicSubscription(ficheId: number, statut: string) {
  if (statut !== "ACTIVE" && statut !== "BROUILLON") return null;
  return getEffectiveSubscription(ficheId);
}
