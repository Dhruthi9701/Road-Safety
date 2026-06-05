/**
 * NHAI FaceAuth — PurgeManager
 *
 * Deletes synced authentication logs that are older than the retention
 * window (7 days). Un-synced logs and enrolled_users are never touched.
 *
 * Deletes are performed in batches of 500 to keep transactions short and
 * avoid locking the database for long periods.
 *
 * @module syncService/PurgeManager
 */

import type { DatabaseManager } from '../dataManager/DatabaseManager';
import {
  PURGE_BATCH_SIZE,
  MAX_LOCAL_SYNCED_DAYS,
} from '../../constants/config';
import type { PurgeResult, RetentionStats } from './types';

/**
 * Manages the deletion of old, synced log records.
 *
 * @example
 * ```ts
 * const purge = new PurgeManager();
 * if (await purge.shouldPurge(db)) {
 *   const result = await purge.purge(db);
 *   console.log(`Purged ${result.purged} rows.`);
 * }
 * ```
 */
export class PurgeManager {
  // ────────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Purge synced logs that are older than the retention window.
   *
   * - Only rows with `synced = 1` are eligible for deletion.
   * - Rows newer than `MAX_LOCAL_SYNCED_DAYS` (7 days) are kept.
   * - Deletes happen in batches of `PURGE_BATCH_SIZE` (500).
   * - `enrolled_users` is **never** modified.
   *
   * @param db  Initialised `DatabaseManager` instance.
   * @returns Object with the number of purged and retained records.
   */
  async purge(db: DatabaseManager): Promise<PurgeResult> {
    const cutoff = PurgeManager.retentionCutoffISO();
    const database = db.getDatabase();

    let totalPurged = 0;

    // Loop: delete in batches until no more qualifying rows remain.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        // Identify the next batch of IDs to delete.
        const selectResult = await database.execute(
          `SELECT id FROM auth_logs
           WHERE synced = 1 AND created_at < ?
           ORDER BY created_at ASC
           LIMIT ?`,
          [cutoff, PURGE_BATCH_SIZE],
        );

        const rows = PurgeManager.extractRows(selectResult);
        if (rows.length === 0) {
          break; // Nothing left to purge.
        }

        const ids = rows.map((r) => String((r as Record<string, unknown>).id));
        const placeholders = ids.map(() => '?').join(',');

        await database.execute(
          `DELETE FROM auth_logs WHERE id IN (${placeholders})`,
          ids,
        );

        totalPurged += ids.length;

        // If we got fewer rows than the batch size, we are done.
        if (rows.length < PURGE_BATCH_SIZE) {
          break;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[PurgeManager] Batch delete failed: ${msg}`);
        break; // Stop purging on error — we may retry later.
      }
    }

    // Count retained rows.
    const retained = await PurgeManager.countLogs(database);

    if (totalPurged > 0) {
      console.info(
        `[PurgeManager] Purged ${totalPurged} synced log(s). ${retained} retained.`,
      );
    }

    return { purged: totalPurged, retained };
  }

  /**
   * Determine whether a purge is warranted.
   *
   * A purge is recommended when there is at least one synced log older than
   * the retention window.
   *
   * @param db  Initialised `DatabaseManager` instance.
   * @returns `true` if there are logs eligible for purge.
   */
  async shouldPurge(db: DatabaseManager): Promise<boolean> {
    const cutoff = PurgeManager.retentionCutoffISO();
    const database = db.getDatabase();

    try {
      const result = await database.execute(
        `SELECT COUNT(*) as cnt FROM auth_logs
         WHERE synced = 1 AND created_at < ?`,
        [cutoff],
      );

      const rows = PurgeManager.extractRows(result);
      if (rows.length === 0) {
        return false;
      }
      return Number((rows[0] as Record<string, unknown>).cnt ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Retrieve retention statistics: synced count, pending count, and the
   * oldest synced log timestamp.
   *
   * @param db  Initialised `DatabaseManager` instance.
   * @returns Stats object.
   */
  async getRetentionStats(db: DatabaseManager): Promise<RetentionStats> {
    const database = db.getDatabase();

    try {
      const syncedResult = await database.execute(
        'SELECT COUNT(*) as cnt FROM auth_logs WHERE synced = 1',
      );
      const pendingResult = await database.execute(
        'SELECT COUNT(*) as cnt FROM auth_logs WHERE synced = 0',
      );
      const oldestResult = await database.execute(
        `SELECT created_at FROM auth_logs
         WHERE synced = 1
         ORDER BY created_at ASC
         LIMIT 1`,
      );

      const syncedRows = PurgeManager.extractRows(syncedResult);
      const pendingRows = PurgeManager.extractRows(pendingResult);
      const oldestRows = PurgeManager.extractRows(oldestResult);

      const syncedCount = Number(
        (syncedRows[0] as Record<string, unknown>)?.cnt ?? 0,
      );
      const pendingCount = Number(
        (pendingRows[0] as Record<string, unknown>)?.cnt ?? 0,
      );
      const oldestSynced =
        oldestRows.length > 0
          ? String((oldestRows[0] as Record<string, unknown>).created_at ?? '')
          : '';

      return { syncedCount, pendingCount, oldestSynced };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[PurgeManager] getRetentionStats failed: ${msg}`);
      return { syncedCount: 0, pendingCount: 0, oldestSynced: '' };
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Compute the ISO-8601 timestamp for the retention cutoff.
   *
   * Logs synced **before** this date are eligible for purge.
   */
  private static retentionCutoffISO(): string {
    const cutoffMs = Date.now() - MAX_LOCAL_SYNCED_DAYS * 24 * 60 * 60 * 1000;
    return new Date(cutoffMs).toISOString();
  }

  /**
   * Count total rows in `auth_logs`.
   */
  private static async countLogs(
    database: ReturnType<DatabaseManager['getDatabase']>,
  ): Promise<number> {
    try {
      const result = await database.execute(
        'SELECT COUNT(*) as cnt FROM auth_logs',
      );
      const rows = PurgeManager.extractRows(result);
      return Number((rows[0] as Record<string, unknown>)?.cnt ?? 0);
    } catch {
      return 0;
    }
  }

  /**
   * Extract row array from op-sqlite result, handling both direct arrays and
   * the `_array` wrapper.
   */
  private static extractRows(result: {
    rows?: { _array?: Record<string, unknown>[] } | Record<string, unknown>[];
  }): Record<string, unknown>[] {
    if (!result.rows) {
      return [];
    }
    if (Array.isArray(result.rows)) {
      return result.rows as Record<string, unknown>[];
    }
    if (
      (result.rows as { _array?: Record<string, unknown>[] })._array &&
      Array.isArray(
        (result.rows as { _array?: Record<string, unknown>[] })._array,
      )
    ) {
      return (result.rows as { _array: Record<string, unknown>[] })._array;
    }
    return [];
  }
}
