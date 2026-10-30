import { S3Client } from "@aws-sdk/client-s3";
import { logger } from "../lib/logger";
import { env as ENV } from "./env";

/**
 * Valide et instancie le client S3
 */
export function getS3Client(): { s3Client: S3Client; bucketName: string } {
  const region = ENV.S3_REGION || "us-east-1";
  const accessKeyId = ENV.S3_ACCESS_KEY_ID;
  const secretAccessKey = ENV.S3_SECRET_ACCESS_KEY;
  const bucketName = ENV.S3_BUCKET;
  const endpoint = ENV.S3_ENDPOINT; // Requis pour Cloudflare R2, MinIO, Scaleway, etc.

  if (!accessKeyId || !secretAccessKey || !bucketName) {
    logger.error(
      "Configuration S3 manquante : Définissez S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY et S3_BUCKET_NAME dans le .env"
    );
    throw new Error("Erreur de stockage");
  }

  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });

  return { s3Client, bucketName };
}
