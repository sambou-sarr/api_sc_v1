import { Prisma } from "../../database/prisma/generated/prisma/client";
import type { CardModel, PlanType } from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { conflict, notFound } from "../../lib/httpError";
import type { CreateModeleCarteInput, PatchModeleCarteInput } from "./card-models.schemas";

/*
  Modèles de carte (recto / verso) par formule, gérés par l'administration.
  UN SEUL modèle actif par formule : c'est celui que le client voit dans sa demande de carte
  (GET /fiches/:id/card-request). Garanti par un index unique partiel en base ; activer un modèle
  désactive d'abord l'ancien dans la même transaction.
*/

const lower = (t: PlanType) => t.toLowerCase() as "essentielle" | "pro" | "signature";
const upper = (t: string) => t.toUpperCase() as PlanType;

/** Vue administrateur. */
const dto = (m: CardModel) => ({
  id: m.id,
  tier: lower(m.tier),
  nom: m.nom,
  rectoUrl: m.rectoUrl,
  versoUrl: m.versoUrl,
  actif: m.actif,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

/** Vue client : ce qu'il faut pour afficher la carte. */
const publicDto = (m: CardModel) => ({
  id: m.id,
  tier: lower(m.tier),
  nom: m.nom,
  rectoUrl: m.rectoUrl,
  versoUrl: m.versoUrl,
});

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const ACTIF_EXISTANT = () =>
  conflict("MODELE_ACTIF_EXISTANT", "Un autre modèle est déjà actif pour cette formule. Réessayez.");

export const CardModelService = {
  async list() {
    const rows = await prisma.cardModel.findMany({
      orderBy: [{ tier: "asc" }, { actif: "desc" }, { createdAt: "desc" }],
    });
    return { modeles: rows.map(dto) };
  },

  async create(input: CreateModeleCarteInput) {
    const tier = upper(input.tier);
    try {
      return await prisma.$transaction(async tx => {
        if (input.actif) {
          await tx.cardModel.updateMany({ where: { tier, actif: true }, data: { actif: false } });
        }
        const modele = await tx.cardModel.create({
          data: {
            tier,
            nom: input.nom,
            rectoUrl: input.rectoUrl,
            versoUrl: input.versoUrl,
            actif: input.actif ?? false,
          },
        });
        return { modele: dto(modele) };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw ACTIF_EXISTANT();
      throw e;
    }
  },

  async update(id: number, input: PatchModeleCarteInput) {
    try {
      return await prisma.$transaction(async tx => {
        const existant = await tx.cardModel.findUnique({ where: { id } });
        if (!existant) throw notFound("Modèle de carte introuvable");
        if (input.actif === true) {
          await tx.cardModel.updateMany({
            where: { tier: existant.tier, actif: true, id: { not: id } },
            data: { actif: false },
          });
        }
        const modele = await tx.cardModel.update({
          where: { id },
          data: {
            ...(input.nom !== undefined && { nom: input.nom }),
            ...(input.rectoUrl !== undefined && { rectoUrl: input.rectoUrl }),
            ...(input.versoUrl !== undefined && { versoUrl: input.versoUrl }),
            ...(input.actif !== undefined && { actif: input.actif }),
          },
        });
        return { modele: dto(modele) };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw ACTIF_EXISTANT();
      throw e;
    }
  },

  /**
   * Suppression : les demandes déjà passées ne sont pas touchées (elles ne référencent pas le modèle).
   * Supprimer le modèle actif laisse la formule sans modèle : le client voit alors l'aperçu par défaut.
   */
  async remove(id: number) {
    const { count } = await prisma.cardModel.deleteMany({ where: { id } });
    if (count === 0) throw notFound("Modèle de carte introuvable");
    return { ok: true as const };
  },

  /** Modèle actif d'une formule, vue client (null si l'administration n'en a pas défini). */
  async activeFor(tier: PlanType) {
    const modele = await prisma.cardModel.findFirst({ where: { tier, actif: true } });
    return modele ? publicDto(modele) : null;
  },
};
