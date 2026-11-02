import { Prisma } from "../../database/prisma/generated/prisma/client";
import type { CardModel, PlanType } from "../../database/prisma/generated/prisma/client";
import { prisma } from "../../database/prisma/prisma-client";
import { conflict, notFound } from "../../lib/httpError";
import { CardImageService, isCardImageRef } from "../media/card-images.service";
import type { CreateModeleCarteInput, PatchModeleCarteInput } from "./card-models.schemas";

/*
  Modèles de carte (recto / verso) par formule, gérés par l'administration.
  UN SEUL modèle actif par formule : c'est celui que le client voit dans sa demande de carte
  (GET /fiches/:id/card-request). Garanti par un index unique partiel en base ; activer un modèle
  désactive d'abord l'ancien dans la même transaction.
*/

const lower = (t: PlanType) => t.toLowerCase() as "essentielle" | "pro" | "signature";
const upper = (t: string) => t.toUpperCase() as PlanType;

/**
 * Valeur à persister : référence relative pour nos propres images (indépendante de l'origine de l'API),
 * adresse https pour un lien externe. Tout le reste est refusé.
 */
/** Supprime les fichiers qui ne sont plus référencés par aucun modèle (au mieux, sans bloquer l'administrateur). */
const releaseImages = async (refs: string[]) => {
  for (const ref of new Set(refs)) {
    if (!isCardImageRef(ref)) continue;
    const absoluteRef = CardImageService.toAbsolute(ref);
    const [modelCount, jobCount] = await Promise.all([
      prisma.cardModel.count({ where: { OR: [{ rectoUrl: ref }, { versoUrl: ref }] } }),
      prisma.printJob.count({
        where: {
          OR: [
            { rectoUrl: ref },
            { versoUrl: ref },
            { rectoUrl: absoluteRef },
            { versoUrl: absoluteRef },
          ],
        },
      }),
    ]);
    if (modelCount === 0 && jobCount === 0) await CardImageService.deleteRef(ref);
  }
};

/** Vue administrateur. */
const dto = (m: CardModel) => ({
  id: m.id,
  tier: lower(m.tier),
  nom: m.nom,
  rectoUrl: CardImageService.toAbsolute(m.rectoUrl),
  versoUrl: CardImageService.toAbsolute(m.versoUrl),
  actif: m.actif,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

/** Vue client : ce qu'il faut pour afficher la carte. */
const publicDto = (m: CardModel) => ({
  id: m.id,
  tier: lower(m.tier),
  nom: m.nom,
  rectoUrl: CardImageService.toAbsolute(m.rectoUrl),
  versoUrl: CardImageService.toAbsolute(m.versoUrl),
});

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const ACTIF_EXISTANT = () =>
  conflict("MODELE_ACTIF_EXISTANT", "Un autre modèle est déjà actif pour cette formule. Réessayez.");

export const CardModelService = {
  async releaseUnusedImages(refs: string[]) {
    await releaseImages(refs);
  },

  async list() {
    const rows = await prisma.cardModel.findMany({
      orderBy: [{ tier: "asc" }, { actif: "desc" }, { createdAt: "desc" }],
    });
    return { modeles: rows.map(dto) };
  },

  async create(input: CreateModeleCarteInput) {
    const tier = upper(input.tier);
    const rectoUrl = CardImageService.toStoredRef(input.rectoUrl);
    const versoUrl = CardImageService.toStoredRef(input.versoUrl);
    try {
      return await prisma.$transaction(async tx => {
        if (input.actif) {
          await tx.cardModel.updateMany({ where: { tier, actif: true }, data: { actif: false } });
        }
        const modele = await tx.cardModel.create({
          data: {
            tier,
            nom: input.nom,
            rectoUrl,
            versoUrl,
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
    const rectoUrl = input.rectoUrl !== undefined ? CardImageService.toStoredRef(input.rectoUrl) : undefined;
    const versoUrl = input.versoUrl !== undefined ? CardImageService.toStoredRef(input.versoUrl) : undefined;
    try {
      const result = await prisma.$transaction(async tx => {
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
            ...(rectoUrl !== undefined && { rectoUrl }),
            ...(versoUrl !== undefined && { versoUrl }),
            ...(input.actif !== undefined && { actif: input.actif }),
          },
        });
        return { modele: dto(modele), replaced: [existant.rectoUrl, existant.versoUrl].filter(ref => ref !== modele.rectoUrl && ref !== modele.versoUrl) };
      });
      // Les images remplacées ne servent plus à rien : on les retire du stockage.
      await releaseImages(result.replaced);
      return { modele: result.modele };
    } catch (e) {
      if (isUniqueViolation(e)) throw ACTIF_EXISTANT();
      throw e;
    }
  },

  /**
   * Suppression : les commandes déjà passées conservent leurs propres références d'images.
   * Supprimer le modèle actif laisse la formule sans modèle : le client voit alors l'aperçu par défaut.
   */
  async remove(id: number) {
    const existant = await prisma.cardModel.findUnique({ where: { id } });
    const { count } = await prisma.cardModel.deleteMany({ where: { id } });
    if (count === 0) throw notFound("Modèle de carte introuvable");
    if (existant) await releaseImages([existant.rectoUrl, existant.versoUrl]);
    return { ok: true as const };
  },

  /** Modèle actif d'une formule, vue client (null si l'administration n'en a pas défini). */
  async activeFor(tier: PlanType) {
    const modele = await prisma.cardModel.findFirst({ where: { tier, actif: true } });
    return modele ? publicDto(modele) : null;
  },
};
