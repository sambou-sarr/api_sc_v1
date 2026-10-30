import { prisma } from "../../database/prisma/prisma-client";
import { s3Storage } from "../../infrastructure/storage/s3.storage";
import { logger } from "../../lib/logger";
import { ficheInclude } from "../fiches/fiches.dto";
import { collectStoredMediaKeys } from "./media.validation";

const ORPHAN_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes unreferenced media objects after a grace period, including uploads abandoned
 * when an editor is closed before saving. Runs as a low-frequency background job.
 */
export async function cleanupOrphanedMedia(now = new Date()): Promise<number> {
  const storage = s3Storage();
  const fiches = await prisma.fiche.findMany({ include: ficheInclude });
  const referenced = new Set<string>();

  for (const fiche of fiches) {
    for (const key of collectStoredMediaKeys(fiche, fiche.id)) {
      referenced.add(`fiches/${fiche.id}/${key}`);
    }
  }

  const cutoff = now.getTime() - ORPHAN_GRACE_PERIOD_MS;
  const objects = await storage.list("fiches/");
  let removed = 0;

  for (const object of objects) {
    const match = object.key.match(
      /^fiches\/(\d+)\/([0-9a-f-]{36}\.(?:jpg|png|webp|mp4|webm))$/i
    );
    if (
      !match ||
      !object.lastModified ||
      object.lastModified.getTime() > cutoff
    )
      continue;
    if (referenced.has(object.key)) continue;

    try {
      await storage.delete(object.key);
      removed += 1;
    } catch (error) {
      logger.warn("Orphan media cleanup failed for object", {
        key: object.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (removed > 0)
    logger.info("Orphan media objects removed", { count: removed });
  return removed;
}
