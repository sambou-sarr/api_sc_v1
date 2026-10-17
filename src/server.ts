import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./database/prisma/prisma-client";
import { logger } from "./lib/logger";
import { expireDueSubscriptions } from "./modules/subscriptions/subscriptions.service";
import { cleanupOrphanedMedia } from "./modules/media/media.cleanup";

const server = app.listen(env.PORT, () => {
  logger.info("API server listening", {
    port: env.PORT,
    environment: env.NODE_ENV,
  });
});

// Marque « expirés » les abonnements arrivés à échéance (au démarrage puis toutes les heures).
const runExpiry = () =>
  expireDueSubscriptions()
    .then(count => {
      if (count > 0)
        logger.info("Expired subscriptions", { count });
    })
    .catch(error => {
      logger.error("Subscription expiry job failed", {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : String(error),
      });
    });
runExpiry();
const timer = setInterval(runExpiry, 60 * 60_000);

// Nettoie quotidiennement les uploads abandonnés, en conservant 24 h de grâce.
const runMediaCleanup = () =>
  cleanupOrphanedMedia()
    .catch(error => {
      logger.error("Orphan media cleanup job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
const mediaCleanupTimer = setInterval(runMediaCleanup, 24 * 60 * 60_000);
const mediaCleanupInitialTimer = setTimeout(runMediaCleanup, 10 * 60_000);

const shutdown = async () => {
  logger.info("API server shutting down");
  clearInterval(timer);
  clearInterval(mediaCleanupTimer);
  clearTimeout(mediaCleanupInitialTimer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
