import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { getS3Client } from "../../config/s3";
import type { StorageListItem, StorageObject, StorageProvider } from "./storage.interface";

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const configured = getS3Client();
    this.client = configured.s3Client;
    this.bucket = configured.bucketName;
  }

  async put(input: { key: string; body: Buffer; contentType: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  }

  async get(key: string, range?: string): Promise<StorageObject> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ...(range ? { Range: range } : {}) })
    );
    if (!result.Body || !("pipe" in result.Body)) {
      throw new Error("Le stockage n'a retourné aucun flux média");
    }
    return {
      body: result.Body as Readable,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      contentRange: result.ContentRange,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async list(prefix: string): Promise<StorageListItem[]> {
    const objects: StorageListItem[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      for (const item of page.Contents ?? []) {
        if (item.Key) objects.push({ key: item.Key, lastModified: item.LastModified });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
  }
}
