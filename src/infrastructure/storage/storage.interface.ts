import type { Readable } from "node:stream";

export interface StorageListItem { key: string; lastModified?: Date; }

export interface StorageObject {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
}

export interface StorageProvider {
  put(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  get(key: string, range?: string): Promise<StorageObject>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StorageListItem[]>;
}
