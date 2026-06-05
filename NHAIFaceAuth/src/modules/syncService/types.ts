/**
 * NHAI FaceAuth — Sync Service Types
 *
 * Module-specific type definitions for S3 upload, sync orchestration,
 * and purge operations.
 *
 * @module syncService/types
 */

// ─── S3 Upload ───────────────────────────────────────────────────────────────

/** Credentials and bucket configuration for the S3Uploader. */
export interface S3Config {
  /** AWS access key ID. */
  accessKeyId: string;
  /** AWS secret access key. */
  secretAccessKey: string;
  /** S3 bucket name. */
  bucket: string;
  /** AWS region (e.g. `"ap-south-1"`). */
  region: string;
}

/** Result of a single batch upload attempt. */
export interface UploadResult {
  /** Whether the upload succeeded. */
  success: boolean;
  /** The S3 ETag returned on success. */
  etag?: string;
  /** Human-readable error message on failure. */
  error?: string;
}

// ─── Sync Manager ────────────────────────────────────────────────────────────

/** Internal state tracked by `SyncManager`. */
export interface SyncState {
  /** Current network connectivity status. */
  isOnline: boolean;
  /** Whether a sync cycle is currently running. */
  isSyncing: boolean;
  /** Number of unsynced log records. */
  pendingCount: number;
  /** ISO 8601 UTC timestamp of the last successful sync. */
  lastSyncTime: string | null;
  /** Outcome of the most recent sync attempt. */
  lastSyncResult: 'success' | 'failure' | null;
  /** Number of batches that are in a permanent "failed" state. */
  failedBatches: number;
}

/** Payload envelope sent to S3 for each batch. */
export interface SyncPayload {
  /** Unique batch identifier (UUID). */
  batchId: string;
  /** Device that generated the logs. */
  deviceId: string;
  /** ISO 8601 UTC timestamp of when the batch was created. */
  createdAt: string;
  /** Application version string. */
  appVersion: string;
  /** Number of log records in this batch. */
  recordCount: number;
  /** MD5 hex digest of the JSON-encoded `records` array. */
  checksum: string;
  /** The authentication log records. */
  records: SyncLogRecord[];
}

/** Flattened log record included in a sync batch payload. */
export interface SyncLogRecord {
  id: string;
  timestamp: string;
  userId: string | null;
  latitude: number | null;
  longitude: number | null;
  matchConfidence: number;
  livenessChallenge: string;
  livenessScore: number;
  antiSpoofScore: number;
  result: 'success' | 'failure' | 'retry';
  failureReason: string | null;
  deviceId: string;
  appVersion: string;
}

// ─── Purge Manager ───────────────────────────────────────────────────────────

/** Result of a purge operation. */
export interface PurgeResult {
  /** Number of synced log records deleted. */
  purged: number;
  /** Number of log records retained (synced within retention + unsynced). */
  retained: number;
}

/** Statistics about records eligible for purge. */
export interface RetentionStats {
  /** Total synced log count. */
  syncedCount: number;
  /** Total unsynced (pending) log count. */
  pendingCount: number;
  /** ISO 8601 UTC timestamp of the oldest synced log, or `""` if none. */
  oldestSynced: string;
}
