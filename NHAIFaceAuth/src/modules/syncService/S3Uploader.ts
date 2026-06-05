/**
 * NHAI FaceAuth — S3Uploader
 *
 * Handles gzip-compressed uploads of authentication log batches to
 * Amazon S3 using `@aws-sdk/client-s3`.
 *
 * Features:
 *   - Lazy client initialisation (only creates the S3 client when configured)
 *   - Gzip compression with `pako` before upload (saves bandwidth)
 *   - ETag verification after upload
 *   - HEAD-based upload verification
 *   - Graceful handling of missing / invalid credentials
 *
 * S3 key format:
 *   `nhai-face-auth/{deviceId}/{YYYY-MM-DD}/{batchId}.json.gz`
 *
 * @module syncService/S3Uploader
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import pako from 'pako';
import {
  S3_BUCKET,
  S3_REGION,
  S3_KEY_PREFIX,
} from '../../constants/config';
import type { S3Config, UploadResult } from './types';

/**
 * Uploads log batches to S3 as gzip-compressed JSON.
 *
 * @example
 * ```ts
 * const uploader = new S3Uploader();
 * uploader.initialize({ accessKeyId: '…', secretAccessKey: '…', bucket, region });
 * const result = await uploader.uploadBatch(jsonPayload, s3Key);
 * ```
 */
export class S3Uploader {
  private client: S3Client | null = null;
  private bucket: string = S3_BUCKET;
  private configured = false;

  // ────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Configure the AWS S3 client with the provided credentials and bucket.
   *
   * Can be called multiple times — each call replaces the previous config.
   *
   * @param config  AWS credentials, bucket name, and region.
   */
  initialize(config: S3Config): void {
    if (!config.accessKeyId || !config.secretAccessKey) {
      console.warn(
        '[S3Uploader] Credentials not provided — uploads will fail until configured.',
      );
      this.configured = false;
      this.client = null;
      return;
    }

    this.client = new S3Client({
      region: config.region || S3_REGION,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    this.bucket = config.bucket || S3_BUCKET;
    this.configured = true;

    console.info(
      `[S3Uploader] Initialised for bucket "${this.bucket}" in region "${config.region || S3_REGION}".`,
    );
  }

  /**
   * Whether the uploader has been successfully configured with credentials.
   */
  isConfigured(): boolean {
    return this.configured && this.client !== null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Upload
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Compress `data` with gzip and upload it to S3.
   *
   * @param data  The raw JSON string to upload.
   * @param key   The S3 object key (path).
   * @returns An `UploadResult` with success status and optional ETag or error.
   */
  async uploadBatch(data: string, key: string): Promise<UploadResult> {
    if (!this.client || !this.configured) {
      return {
        success: false,
        error: 'S3 client not configured. Call initialize() with valid credentials.',
      };
    }

    try {
      // 1. Gzip compress the payload.
      const compressed = pako.gzip(data);

      // 2. Build the PutObject command.
      const params: PutObjectCommandInput = {
        Bucket: this.bucket,
        Key: key,
        Body: compressed,
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
        Metadata: {
          'x-nhai-uncompressed-size': String(data.length),
          'x-nhai-compressed-size': String(compressed.length),
          'x-nhai-upload-time': new Date().toISOString(),
        },
      };

      const command = new PutObjectCommand(params);
      const response = await this.client.send(command);

      const etag = response.ETag?.replace(/"/g, '') ?? undefined;

      console.info(
        `[S3Uploader] Uploaded ${key} (${compressed.length} bytes gzipped). ETag=${etag ?? 'n/a'}`,
      );

      return { success: true, etag };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[S3Uploader] Upload failed for ${key}: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Verify that an uploaded object exists in S3 and optionally matches
   * an expected ETag (checksum).
   *
   * @param key               The S3 object key to check.
   * @param expectedChecksum  ETag value to verify against (without quotes).
   * @returns `true` if the object exists and the ETag matches (when provided).
   */
  async verifyUpload(
    key: string,
    expectedChecksum: string,
  ): Promise<boolean> {
    if (!this.client || !this.configured) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!expectedChecksum) {
        // No checksum to verify — existence is sufficient.
        return true;
      }

      const remoteETag = response.ETag?.replace(/"/g, '') ?? '';
      return remoteETag === expectedChecksum;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[S3Uploader] verifyUpload failed for ${key}: ${msg}`);
      return false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Key generation
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Build the standard S3 key for a log batch.
   *
   * Format: `nhai-face-auth/{deviceId}/{YYYY-MM-DD}/{batchId}.json.gz`
   *
   * @param deviceId  Unique device identifier.
   * @param batchId   Unique batch identifier (UUID).
   * @param date      Optional date override (defaults to now, UTC).
   * @returns The S3 object key string.
   */
  static buildS3Key(
    deviceId: string,
    batchId: string,
    date?: Date,
  ): string {
    const d = date ?? new Date();
    const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
    return `${S3_KEY_PREFIX}/${deviceId}/${dateStr}/${batchId}.json.gz`;
  }
}
