import { prisma } from "../../database/prisma/prisma-client";
import { notFound } from "../../lib/httpError";

// Un scan = une ouverture de la fiche publique (tap NFC ou QR code).
// Sans table dédiée, on compte dans fiches.scansTotal et on se protège ainsi :
//  - les robots et aperçus de liens (WhatsApp, Facebook…) ne comptent pas ;
//  - la même personne (IP) n'est comptée qu'une fois par fiche toutes les 10 minutes.
// La mémoire anti-doublon vit dans le processus : elle repart à zéro au redémarrage (sans gravité).
const FENETRE_MS = 10 * 60 * 1000;
const MAX_ENTREES = 20_000;
const ROBOTS =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|headless/i;

const vus = new Map<string, number>();

function dejaCompte(cle: string, maintenant: number): boolean {
  const dernier = vus.get(cle);
  if (dernier !== undefined && maintenant - dernier < FENETRE_MS) return true;

  if (vus.size >= MAX_ENTREES) {
    for (const [k, t] of vus) if (maintenant - t >= FENETRE_MS) vus.delete(k);
    if (vus.size >= MAX_ENTREES) vus.clear(); // garde-fou contre une saturation
  }
  vus.set(cle, maintenant);
  return false;
}

export const ScansService = {
  async enregistrer(slug: string, ip: string, userAgent: string) {
    if (ROBOTS.test(userAgent)) return;

    const cle = `${slug}|${ip}`;
    if (dejaCompte(cle, Date.now())) return;

    // Incrément atomique côté base : deux scans simultanés comptent bien pour deux.
    // Seule une fiche ACTIVE est comptée (une fiche suspendue est masquée au public).
    const { count } = await prisma.fiche.updateMany({
      where: { slug, statut: "ACTIVE" },
      data: { scansTotal: { increment: 1 } },
    });
    if (count === 0) {
      vus.delete(cle);
      throw notFound("Fiche introuvable");
    }
  },
};
