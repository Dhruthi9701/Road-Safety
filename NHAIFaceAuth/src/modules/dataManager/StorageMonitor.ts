/**
 * NHAI FaceAuth — StorageMonitor
 *
 * Provides device-storage health checks and housekeeping utilities:
 *   - Free-space monitoring with warning / critical thresholds
 *   - Archiving (deleting) old synced logs to reclaim space
 *   - Database file size measurement
 *   - Consolidated storage health report
 *
 * All methods are static and stateless.
 *
 * @module dataManager/StorageMonitor
 */

import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import {
  DB_NAME,
  STORAGE_WARNING_BYTES,
  STORAGE_CRITICAL_BYTES,
  MAX_LOCAL_SYNCED_DAYS,
} from '../../constants/config';
import type { DatabaseManager } from './DatabaseManager';

/** Storage space check result. */
export interface StorageSpaceResult {
  /** Free bytes available on the device. */
  available: number;
  /** True when free space is below the warning threshold (50 MB). */
  warning: boolean;
  /** True when free space is below the critical threshold (20 MB). */
  critical: boolean;
}

/** Comprehensive storage health report. */
export interface StorageReport {
  /** Database file size in bytes. */
  dbSize: number;
  /** Free space on the device in bytes. */
  freeSpace: number;
  /** Total authentication log count. */
  logCount: number;
  /** Total enrolled user count. */
  userCount: number;
}

/**
 * Static utilities for monitoring and managing on-device storage.
 *
 * @example
 * ```ts
 * const space = await StorageMonitor.checkStorageSpace();
 * if (space.critical) {
 *   await StorageMonitor.archiveOldLogs(db);
 * }
 * ```
 */
export class StorageMonitor {
  // ────────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Check the available free space on the device and compare it against
   * the configured warning / critical thresholds.
   *
   * @returns An object with available bytes, warning flag, and critical flag.
   */
  static async checkStorageSpace(): Promise<StorageSpaceResult> {
    try {
      const freeBytes = await StorageMonitor.getDeviceFreeSpace();

      return {
        available: freeBytes,
        warning: freeBytes < STORAGE_WARNING_BYTES,
        critical: freeBytes < STORAGE_CRITICAL_BYTES,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[StorageMonitor] checkStorageSpace failed: ${msg}`);

      // Fail safe — assume we are NOT in trouble so the app doesn't block
      // critical flows. The next check will try again.
      return { available: Number.MAX_SAFE_INTEGER, warning: false, critical: false };
    }
  }

  /**
   * Delete the oldest **synced** authentication logs that are beyond the
   * retention window (`MAX_LOCAL_SYNCED_DAYS`).
   *
   * Un-synced logs are **never** deleted.
   *
   * @param db  A fully-initialised `DatabaseManager` instance.
   * @returns The number of log rows deleted.
   */
  static async archiveOldLogs(db: DatabaseManager): Promise<number> {
    const cutoff = new Date(
      Date.now() - MAX_LOCAL_SYNCED_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const database = db.getDatabase();

    try {
      const result = await database.execute(
        `DELETE FROM auth_logs
         WHERE synced = 1 AND created_at < ?`,
        [cutoff],
      );

      const deleted = result.rowsAffected ?? 0;
      if (deleted > 0) {
        console.info(
          `[StorageMonitor] Archived ${deleted} old synced log(s).`,
        );
      }
      return deleted;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[StorageMonitor] archiveOldLogs failed: ${msg}`);
    }
  }

  /**
   * Return the size of the SQLite database file on disk.
   *
   * @returns Size in bytes, or `0` if the file does not exist.
   */
  static async getDatabaseSize(): Promise<number> {
    try {
      const dbPath = StorageMonitor.getDatabasePath();
      const exists = await RNFS.exists(dbPath);
      if (!exists) {
        return 0;
      }
      const stat = await RNFS.stat(dbPath);
      return Number(stat.size);
    } catch {
      return 0;
    }
  }

  /**
   * Build a consolidated storage health report.
   *
   * @param db  A fully-initialised `DatabaseManager` instance.
   * @returns Report with DB size, free space, log count, and user count.
   */
  static async getStorageReport(db: DatabaseManager): Promise<StorageReport> {
    const [dbSize, spaceResult, logCount, userCount] = await Promise.all([
      StorageMonitor.getDatabaseSize(),
      StorageMonitor.checkStorageSpace(),
      StorageMonitor.countTable(db, 'auth_logs'),
      StorageMonitor.countTable(db, 'enrolled_users'),
    ]);

    return {
      dbSize,
      freeSpace: spaceResult.available,
      logCount,
      userCount,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Resolve the absolute path of the database file.
   * `op-sqlite` stores databases in the app's "Documents" (iOS) or
   * "Files" (Android) directory.
   */
  private static getDatabasePath(): string {
    const dir =
      Platform.OS === 'ios'
        ? RNFS.DocumentDirectoryPath
        : RNFS.DocumentDirectoryPath;
    return `${dir}/${DB_NAME}`;
  }

  /**
   * Read the device's free space in bytes.
   * Uses `react-native-fs` which exposes this for both platforms.
   */
  private static async getDeviceFreeSpace(): Promise<number> {
    const info = await RNFS.getFSInfo();
    return info.freeSpace;
  }

  /**
   * Generic helper: `SELECT COUNT(*) FROM <table>`.
   */
  private static async countTable(
    db: DatabaseManager,
    table: string,
  ): Promise<number> {
    try {
      const database = db.getDatabase();
      const result = await database.execute(
        `SELECT COUNT(*) as cnt FROM ${table}`,
      );
      const rows = result.rows?._array ?? result.rows ?? [];
      if (rows.length === 0) {
        return 0;
      }
      return Number((rows[0] as Record<string, unknown>).cnt ?? 0);
    } catch {
      return 0;
    }
  }
}
