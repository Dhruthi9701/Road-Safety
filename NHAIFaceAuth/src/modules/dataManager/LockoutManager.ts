/**
 * NHAI FaceAuth — LockoutManager
 *
 * Implements a tiered lockout policy to prevent brute-force attacks:
 *
 * | Consecutive failures (last 1 hr) | Lockout duration |
 * |----------------------------------|------------------|
 * | 3                                | 5 minutes        |
 * | 5                                | 15 minutes       |
 * | 10+                              | 1 hour           |
 *
 * Failed attempts older than 1 hour are automatically cleaned up.
 *
 * @module dataManager/LockoutManager
 */

import type { DatabaseManager } from './DatabaseManager';
import {
  LOCKOUT_THRESHOLD_1,
  LOCKOUT_DURATION_1_MS,
  LOCKOUT_THRESHOLD_2,
  LOCKOUT_DURATION_2_MS,
  LOCKOUT_THRESHOLD_3,
  LOCKOUT_DURATION_3_MS,
} from '../../constants/config';

/** One hour in milliseconds. */
const ONE_HOUR_MS = 3_600_000;

/** Result of a lockout check. */
export interface LockoutStatus {
  /** Whether the device is currently locked out. */
  locked: boolean;
  /** Milliseconds remaining until the lockout expires (0 if not locked). */
  remainingMs: number;
  /** Number of consecutive failed attempts in the last hour. */
  attempts: number;
}

/**
 * Tracks and enforces tiered lockout based on consecutive failed authentication
 * attempts stored in the `failed_attempts` table.
 *
 * @example
 * ```ts
 * const lockout = new LockoutManager(db);
 * const status = await lockout.isLockedOut(deviceId);
 * if (status.locked) {
 *   console.warn(`Device locked for ${status.remainingMs}ms`);
 * }
 * ```
 */
export class LockoutManager {
  private readonly db: DatabaseManager;

  /**
   * @param db  A fully-initialised `DatabaseManager` instance.
   */
  constructor(db: DatabaseManager) {
    this.db = db;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Record a failed authentication attempt for the given device.
   *
   * Old attempts (> 1 hour) are cleaned up automatically before the insert.
   *
   * @param deviceId  Unique device identifier.
   * @param userIdAttempted  Optional user ID that was attempted.
   */
  async recordFailedAttempt(
    deviceId: string,
    userIdAttempted?: string,
  ): Promise<void> {
    await this.cleanOldAttempts(deviceId);

    const now = new Date().toISOString();
    const database = this.db.getDatabase();

    try {
      await database.execute(
        `INSERT INTO failed_attempts (device_id, attempt_time, user_id_attempted)
         VALUES (?, ?, ?)`,
        [deviceId, now, userIdAttempted ?? null],
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[LockoutManager] Failed to record attempt: ${msg}`);
    }
  }

  /**
   * Check whether the device is currently locked out.
   *
   * @param deviceId  Unique device identifier.
   * @returns Lock status including remaining cooldown and attempt count.
   */
  async isLockedOut(deviceId: string): Promise<LockoutStatus> {
    await this.cleanOldAttempts(deviceId);

    const attempts = await this.getRecentAttemptCount(deviceId);

    if (attempts < LOCKOUT_THRESHOLD_1) {
      return { locked: false, remainingMs: 0, attempts };
    }

    // Determine the applicable lockout tier.
    const lockoutDurationMs = LockoutManager.getLockoutDuration(attempts);

    // Find the most recent attempt time to compute when the lockout expires.
    const lastAttemptTime = await this.getLastAttemptTime(deviceId);
    if (lastAttemptTime === null) {
      // Edge case — records disappeared between the count and this query.
      return { locked: false, remainingMs: 0, attempts: 0 };
    }

    const elapsed = Date.now() - lastAttemptTime.getTime();
    const remainingMs = Math.max(0, lockoutDurationMs - elapsed);

    return {
      locked: remainingMs > 0,
      remainingMs,
      attempts,
    };
  }

  /**
   * Clear all failed-attempt records for the given device.
   *
   * Call this after a **successful** authentication to reset the counter.
   *
   * @param deviceId  Unique device identifier.
   */
  async resetAttempts(deviceId: string): Promise<void> {
    const database = this.db.getDatabase();

    try {
      await database.execute(
        'DELETE FROM failed_attempts WHERE device_id = ?',
        [deviceId],
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[LockoutManager] Failed to reset attempts: ${msg}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Delete attempts older than 1 hour for the given device.
   */
  private async cleanOldAttempts(deviceId: string): Promise<void> {
    const cutoff = new Date(Date.now() - ONE_HOUR_MS).toISOString();
    const database = this.db.getDatabase();

    try {
      await database.execute(
        'DELETE FROM failed_attempts WHERE device_id = ? AND attempt_time < ?',
        [deviceId, cutoff],
      );
    } catch {
      // Non-critical — if cleanup fails, the counts will self-correct on the
      // next successful pass once the hour elapses.
    }
  }

  /**
   * Count failed attempts in the last hour for a given device.
   */
  private async getRecentAttemptCount(deviceId: string): Promise<number> {
    const cutoff = new Date(Date.now() - ONE_HOUR_MS).toISOString();
    const database = this.db.getDatabase();

    const result = await database.execute(
      `SELECT COUNT(*) as cnt
       FROM failed_attempts
       WHERE device_id = ? AND attempt_time >= ?`,
      [deviceId, cutoff],
    );

    const rows = result.rows?._array ?? result.rows ?? [];
    if (rows.length === 0) {
      return 0;
    }
    return Number((rows[0] as Record<string, unknown>).cnt ?? 0);
  }

  /**
   * Get the timestamp of the most recent failed attempt for the device.
   */
  private async getLastAttemptTime(deviceId: string): Promise<Date | null> {
    const database = this.db.getDatabase();

    const result = await database.execute(
      `SELECT attempt_time
       FROM failed_attempts
       WHERE device_id = ?
       ORDER BY attempt_time DESC
       LIMIT 1`,
      [deviceId],
    );

    const rows = result.rows?._array ?? result.rows ?? [];
    if (rows.length === 0) {
      return null;
    }
    const timeStr = (rows[0] as Record<string, unknown>).attempt_time;
    return timeStr ? new Date(String(timeStr)) : null;
  }

  /**
   * Map the number of consecutive failures to the correct lockout duration.
   *
   * @param attempts  Number of consecutive failures in the last hour.
   * @returns Lockout duration in milliseconds.
   */
  private static getLockoutDuration(attempts: number): number {
    if (attempts >= LOCKOUT_THRESHOLD_3) {
      return LOCKOUT_DURATION_3_MS;
    }
    if (attempts >= LOCKOUT_THRESHOLD_2) {
      return LOCKOUT_DURATION_2_MS;
    }
    if (attempts >= LOCKOUT_THRESHOLD_1) {
      return LOCKOUT_DURATION_1_MS;
    }
    return 0;
  }
}
