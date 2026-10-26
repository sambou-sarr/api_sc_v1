import { prisma } from "../../../database/prisma/prisma-client";
import { badRequest, notFound } from "../../../lib/httpError";
import type { AuthUser } from "../../../types/user";

const normalizePhone = (value: string) => value.replace(/[\s().-]/g, "");

export const RappelService = {
  async createPublic(slug: string, input: { nom: string; telephone: string }) {
    const fiche = await prisma.fiche.findUnique({
      where: { slug },
      select: { id: true, statut: true },
    });
    if (!fiche || fiche.statut !== "ACTIVE") {
      throw notFound("Cette fiche est indisponible");
    }

    const nom = input.nom.trim();
    const telephone = normalizePhone(input.telephone.trim());
    if (nom.length < 2) {
      throw badRequest("NOM_INVALIDE", "Veuillez saisir un nom valide.");
    }
    if (!/^\+?[0-9]{7,15}$/.test(telephone)) {
      throw badRequest(
        "TELEPHONE_INVALIDE",
        "Veuillez saisir un numéro de téléphone valide."
      );
    }

    const demande = await prisma.demandeRappel.create({
      data: { ficheId: fiche.id, nom, telephone },
      select: { id: true, createdAt: true },
    });
    return { id: demande.id, createdAt: demande.createdAt };
  },

  async listForFiche(user: AuthUser, ficheId: number) {
    const fiche = await prisma.fiche.findUnique({
      where: { id: ficheId },
      select: { id: true, userId: true },
    });
    if (!fiche || (user.role !== "ADMIN" && fiche.userId !== user.id)) {
      throw notFound("Fiche introuvable");
    }

    const [total, demandes] = await prisma.$transaction([
      prisma.demandeRappel.count({ where: { ficheId } }),
      prisma.demandeRappel.findMany({
        where: { ficheId },
        select: { id: true, nom: true, telephone: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return { ficheId, total, demandes };
  },

  async listForUser(user: AuthUser, page: number, limit: number) {
    const where = { fiche: { userId: user.id } };
    const [total, demandes] = await prisma.$transaction([
      prisma.demandeRappel.count({ where }),
      prisma.demandeRappel.findMany({
        where,
        select: {
          id: true,
          nom: true,
          telephone: true,
          createdAt: true,
          fiche: {
            select: { id: true, slug: true, prenom: true, nom: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      demandes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};
