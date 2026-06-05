/**
 * NHAI FaceAuth — DatabaseManager
 *
 * Singleton that owns the SQLCipher-encrypted op-sqlite database.
 *
 * Responsibilities:
 *   - Open / close the database with encryption key from `KeyManager`
 *   - Run schema migrations (create tables, indices)
 *   - CRUD for enrolled_users, auth_logs, sync_queue, failed_attempts, app_config
 *   - Integrity verification (PRAGMA integrity_check)
 *   - Storage-size reporting
 *   - Automatic backup-and-recreate on corruption
 *
 * All write operations are wrapped in transactions with try/catch/rollback.
 *
 * @module dataManager/DatabaseManager
 */

import { open, type DB } from '@op-engineering/op-sqlite';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { DB_NAME } from '../../constants/config';
import { KeyManager } from './KeyManager';
import type { EnrolledUser, AuthLog } from '../../types';

/** Log count statistics. */
export interface LogCountStats {
  total: number;
  synced: number;
  pending: number;
}

/**
 * Singleton database manager backed by op-sqlite with SQLCipher encryption.
 *
 * @example
 * ```ts
 * const db = DatabaseManager.getInstance();
 * await db.initialize();
 * const users = await db.getAllUsers();
 * ```
 */
export class DatabaseManager {
  // ────────────────────────────────────────────────────────────────────────────
  // Singleton
  // ────────────────────────────────────────────────────────────────────────────

  private static instance: DatabaseManager | null = null;

  /**
   * Return the singleton `DatabaseManager`.
   * Call `initialize()` before using any CRUD methods.
   */
  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /** Reset the singleton (used in tests and factory-reset). */
  static resetInstance(): void {
    DatabaseManager.instance = null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Instance state
  // ────────────────────────────────────────────────────────────────────────────

  private db: DB | null = null;
  private initialized = false;

  private constructor() {}

  // ────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Open the database, run migrations, and verify integrity.
   *
   * If the integrity check fails the corrupt database is backed up and a fresh
   * one is created.
   *
   * @throws If the database cannot be opened even after recovery.
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }

    const encryptionKey = await KeyManager.getOrCreateKey();

    try {
      this.db = open({
        name: DB_NAME,
        encryptionKey,
      });

      // Enable WAL mode for better write concurrency.
      await this.db.execute('PRAGMA journal_mode = WAL');
      await this.db.execute('PRAGMA foreign_keys = ON');

      await this.createTables();

      const healthy = await this.verifyIntegrity();
      if (!healthy) {
        console.warn(
          '[DatabaseManager] Integrity check failed — attempting recovery.',
        );
        await this.recoverCorruptDatabase(encryptionKey);
      }

      this.initialized = true;
      console.info('[DatabaseManager] Database initialised successfully.');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      // Try recovery once.
      try {
        await this.recoverCorruptDatabase(encryptionKey);
        this.initialized = true;
      } catch (recoveryError: unknown) {
        const rMsg =
          recoveryError instanceof Error
            ? recoveryError.message
            : String(recoveryError);
        throw new Error(
          `[DatabaseManager] Initialisation failed after recovery: ${msg} → ${rMsg}`,
        );
      }
    }
  }

  /**
   * Create all tables and indices.
   *
   * Uses `IF NOT EXISTS` so it is safe to call repeatedly (idempotent).
   */
  async createTables(): Promise<void> {
    const database = this.requireDb();

    const statements: string[] = [
      // ─── enrolled_users ──────────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS enrolled_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        employee_id TEXT UNIQUE,
        embedding TEXT NOT NULL,
        enrollment_date TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        photo_count INTEGER DEFAULT 1,
        metadata TEXT,
        enrolled_by TEXT,
        zone TEXT
      )`,

      // ─── auth_logs ───────────────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS auth_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user_id TEXT,
        latitude REAL,
        longitude REAL,
        match_confidence REAL DEFAULT 0,
        liveness_challenge TEXT,
        liveness_score REAL DEFAULT 0,
        antispoof_score REAL DEFAULT 0,
        result TEXT NOT NULL CHECK(result IN ('success','failure','retry')),
        failure_reason TEXT,
        device_id TEXT NOT NULL,
        app_version TEXT,
        synced INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )`,

      // ─── sync_queue ──────────────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        batch_data TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','uploading','completed','failed')),
        attempts INTEGER DEFAULT 0,
        last_attempt TEXT,
        checksum TEXT,
        s3_key TEXT,
        created_at TEXT NOT NULL
      )`,

      // ─── failed_attempts ─────────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS failed_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        attempt_time TEXT NOT NULL,
        user_id_attempted TEXT
      )`,

      // ─── app_config ──────────────────────────────────────────────────
      `CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,

      // ─── Indices ─────────────────────────────────────────────────────
      'CREATE INDEX IF NOT EXISTS idx_auth_logs_synced ON auth_logs(synced)',
      'CREATE INDEX IF NOT EXISTS idx_auth_logs_timestamp ON auth_logs(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_enrolled_users_employee ON enrolled_users(employee_id)',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)',
    ];

    for (const sql of statements) {
      await database.execute(sql);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Enrolled Users CRUD
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Insert a new enrolled user inside a transaction.
   *
   * @param user  The user record to persist.
   * @throws On constraint violation or DB error (transaction is rolled back).
   */
  async insertUser(user: EnrolledUser): Promise<void> {
    const database = this.requireDb();

    try {
      await database.execute('BEGIN TRANSACTION');

      await database.execute(
        `INSERT INTO enrolled_users
          (id, name, employee_id, embedding, enrollment_date, last_updated,
           photo_count, metadata, enrolled_by, zone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.name,
          user.employeeId,
          JSON.stringify(user.embedding),
          user.enrollmentDate,
          user.lastUpdated,
          user.photoCount,
          user.metadata ? JSON.stringify(user.metadata) : null,
          user.metadata?.enrolledBy ?? null,
          user.metadata?.zone ?? null,
        ],
      );

      await database.execute('COMMIT');
    } catch (error: unknown) {
      await this.safeRollback(database);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[DatabaseManager] insertUser failed: ${msg}`);
    }
  }

  /**
   * Fetch a single enrolled user by employee ID.
   *
   * @param employeeId  The unique employee identifier.
   * @returns The user record, or `null` if not found.
   */
  async getUserByEmployeeId(employeeId: string): Promise<EnrolledUser | null> {
    const database = this.requireDb();

    const result = await database.execute(
      'SELECT * FROM enrolled_users WHERE employee_id = ? LIMIT 1',
      [employeeId],
    );

    const rows = this.extractRows(result);
    if (rows.length === 0) {
      return null;
    }
    return DatabaseManager.rowToUser(rows[0]);
  }

  /**
   * Retrieve every enrolled user.
   *
   * Used during face-matching to compare against all known embeddings.
   *
   * @returns Array of all enrolled users (may be empty).
   */
  async getAllUsers(): Promise<EnrolledUser[]> {
    const database = this.requireDb();
    const result = await database.execute('SELECT * FROM enrolled_users');
    return this.extractRows(result).map(DatabaseManager.rowToUser);
  }

  /**
   * Count enrolled users.
   */
  async getUserCount(): Promise<number> {
    return this.countTable('enrolled_users');
  }

  /**
   * Delete an enrolled user by ID.
   *
   * @param userId  The primary-key `id` of the user.
   */
  async deleteUser(userId: string): Promise<void> {
    const database = this.requireDb();

    try {
      await database.execute('BEGIN TRANSACTION');
      await database.execute('DELETE FROM enrolled_users WHERE id = ?', [
        userId,
      ]);
      await database.execute('COMMIT');
    } catch (error: unknown) {
      await this.safeRollback(database);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[DatabaseManager] deleteUser failed: ${msg}`);
    }
  }

  /**
   * Update the embedding vector and photo count for an existing user.
   *
   * @param userId     The primary-key `id` of the user.
   * @param embedding  The new embedding vector (JSON-safe number array).
   * @param photoCount Updated number of enrollment photos.
   */
  async updateUserEmbedding(
    userId: string,
    embedding: number[],
    photoCount: number,
  ): Promise<void> {
    const database = this.requireDb();

    try {
      await database.execute('BEGIN TRANSACTION');
      await database.execute(
        `UPDATE enrolled_users
         SET embedding = ?, photo_count = ?, last_updated = ?
         WHERE id = ?`,
        [JSON.stringify(embedding), photoCount, new Date().toISOString(), userId],
      );
      await database.execute('COMMIT');
    } catch (error: unknown) {
      await this.safeRollback(database);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[DatabaseManager] updateUserEmbedding failed: ${msg}`,
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Auth Logs CRUD
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Insert an authentication log entry in a transaction.
   *
   * @param log  The auth log to persist.
   */
  async insertAuthLog(log: AuthLog): Promise<void> {
    const database = this.requireDb();

    try {
      await database.execute('BEGIN TRANSACTION');

      await database.execute(
        `INSERT INTO auth_logs
          (id, timestamp, user_id, latitude, longitude, match_confidence,
           liveness_challenge, liveness_score, antispoof_score, result,
           failure_reason, device_id, app_version, synced, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.id,
          log.timestamp,
          log.userId,
          log.latitude,
          log.longitude,
          log.matchConfidence,
          log.livenessChallenge,
          log.livenessScore,
          log.antiSpoofScore,
          log.result,
          log.failureReason,
          log.deviceId,
          log.appVersion,
          log.synced ? 1 : 0,
          log.createdAt,
        ],
      );

      await database.execute('COMMIT');
    } catch (error: unknown) {
      await this.safeRollback(database);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[DatabaseManager] insertAuthLog failed: ${msg}`);
    }
  }

  /**
   * Fetch unsynced authentication logs.
   *
   * @param limit  Maximum number of records to return.
   * @returns Array of auth logs where `synced = 0`.
   */
  async getUnsyncedLogs(limit: number): Promise<AuthLog[]> {
    const database = this.requireDb();

    const result = await database.execute(
      `SELECT * FROM auth_logs
       WHERE synced = 0
       ORDER BY created_at ASC
       LIMIT ?`,
      [limit],
    );

    return this.extractRows(result).map(DatabaseManager.rowToAuthLog);
  }

  /**
   * Mark a batch of logs as synced.
   *
   * @param logIds  Array of log `id` values to update.
   */
  async markLogsSynced(logIds: string[]): Promise<void> {
    if (logIds.length === 0) {
      return;
    }

    const database = this.requireDb();
    const placeholders = logIds.map(() => '?').join(',');

    try {
      await database.execute('BEGIN TRANSACTION');
      await database.execute(
        `UPDATE auth_logs SET synced = 1 WHERE id IN (${placeholders})`,
        logIds,
      );
      await database.execute('COMMIT');
    } catch (error: unknown) {
      await this.safeRollback(database);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[DatabaseManager] markLogsSynced failed: ${msg}`);
    }
  }

  /**
   * Return total, synced, and pending log counts.
   */
  async getLogCount(): Promise<LogCountStats> {
    const database = this.requireDb();

    const totalResult = await database.execute(
      'SELECT COUNT(*) as cnt FROM auth_logs',
    );
    const syncedResult = await database.execute(
      'SELECT COUNT(*) as cnt FROM auth_logs WHERE synced = 1',
    );

    const total = this.extractCount(totalResult);
    const synced = this.extractCount(syncedResult);

    return { total, synced, pending: total - synced };
  }

  /**
   * Fetch the most recent auth logs, regardless of sync status.
   *
   * @param limit  Number of records.
   */
  async getRecentLogs(limit: number): Promise<AuthLog[]> {
    const database = this.requireDb();

    const result = await database.execute(
      `SELECT * FROM auth_logs
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit],
    );

    return this.extractRows(result).map(DatabaseManager.rowToAuthLog);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // App Config
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Retrieve a configuration value by key.
   *
   * @param key  The config key.
   * @returns The value string, or `null` if not set.
   */
  async getConfig(key: string): Promise<string | null> {
    const database = this.requireDb();

    const result = await database.execute(
      'SELECT value FROM app_config WHERE key = ? LIMIT 1',
      [key],
    );

    const rows = this.extractRows(result);
    if (rows.length === 0) {
      return null;
    }
    return String((rows[0] as Record<string, unknown>).value ?? '');
  }

  /**
   * Upsert a configuration key-value pair.
   *
   * @param key    The config key.
   * @param value  The value to store.
   */
  async setConfig(key: string, value: string): Promise<void> {
    const database = this.requireDb();

    try {
      await database.execute('BEGIN TRANSACTION');
      await database.execute(
        `INSERT INTO app_config (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, new Date().toISOString()],
      );
      await database.execute('COMMIT');
    } catch (error: unknown) {
      await this.safeRollback(database);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[DatabaseManager] setConfig failed: ${msg}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Integrity & Diagnostics
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Run `PRAGMA integrity_check` and return whether the database is healthy.
   *
   * @returns `true` if the database passes the integrity check.
   */
  async verifyIntegrity(): Promise<boolean> {
    try {
      const database = this.requireDb();
      const result = await database.execute('PRAGMA integrity_check');
      const rows = this.extractRows(result);

      if (rows.length === 0) {
        return false;
      }

      const firstRow = rows[0] as Record<string, unknown>;
      const value = String(
        firstRow.integrity_check ?? firstRow['integrity_check'] ?? '',
      );
      return value.toLowerCase() === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Return the database file size in bytes.
   */
  async getStorageSize(): Promise<number> {
    try {
      const dbPath = this.getDatabasePath();
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
   * Close the database connection and reset the singleton state.
   */
  async close(): Promise<void> {
    if (this.db) {
      try {
        await this.db.close();
      } catch {
        // Best-effort close; swallow errors.
      }
      this.db = null;
      this.initialized = false;
    }
  }

  /**
   * Expose the raw DB handle for modules that need direct access
   * (e.g. `LockoutManager`, `StorageMonitor`).
   *
   * @returns The underlying `DB` instance.
   * @throws  If the database has not been initialised.
   */
  getDatabase(): DB {
    return this.requireDb();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Guard: ensure the database handle is available.
   */
  private requireDb(): DB {
    if (!this.db) {
      throw new Error(
        '[DatabaseManager] Database not initialised. Call initialize() first.',
      );
    }
    return this.db;
  }

  /**
   * Safely attempt a ROLLBACK — suppress errors so we don't mask the
   * original exception.
   */
  private async safeRollback(database: DB): Promise<void> {
    try {
      await database.execute('ROLLBACK');
    } catch {
      // Already rolled back or not in a transaction.
    }
  }

  /**
   * Extract row array from op-sqlite result object.
   * op-sqlite v1+ stores rows in `result.rows` (plain array) or
   * `result.rows._array` in some older bridges.
   */
  private extractRows(result: {
    rows?: { _array?: Record<string, unknown>[] } | Record<string, unknown>[];
  }): Record<string, unknown>[] {
    if (!result.rows) {
      return [];
    }
    if (Array.isArray(result.rows)) {
      return result.rows as Record<string, unknown>[];
    }
    if (result.rows._array && Array.isArray(result.rows._array)) {
      return result.rows._array;
    }
    return [];
  }

  /**
   * Extract a `COUNT(*)` value from a query result.
   */
  private extractCount(result: {
    rows?: { _array?: Record<string, unknown>[] } | Record<string, unknown>[];
  }): number {
    const rows = this.extractRows(result);
    if (rows.length === 0) {
      return 0;
    }
    return Number((rows[0] as Record<string, unknown>).cnt ?? 0);
  }

  /**
   * Generic `SELECT COUNT(*)` for any table.
   */
  private async countTable(table: string): Promise<number> {
    const database = this.requireDb();
    const result = await database.execute(
      `SELECT COUNT(*) as cnt FROM ${table}`,
    );
    return this.extractCount(result);
  }

  /**
   * Resolve the absolute file path of the database.
   */
  private getDatabasePath(): string {
    const dir =
      Platform.OS === 'ios'
        ? RNFS.DocumentDirectoryPath
        : RNFS.DocumentDirectoryPath;
    return `${dir}/${DB_NAME}`;
  }

  /**
   * Back up a corrupt database and re-create it from scratch.
   */
  private async recoverCorruptDatabase(encryptionKey: string): Promise<void> {
    // 1. Close existing handle.
    if (this.db) {
      try {
        await this.db.close();
      } catch {
        // Ignore.
      }
      this.db = null;
    }

    // 2. Rename the corrupt file.
    const dbPath = this.getDatabasePath();
    const backupPath = `${dbPath}.corrupt.${Date.now()}`;

    try {
      const exists = await RNFS.exists(dbPath);
      if (exists) {
        await RNFS.moveFile(dbPath, backupPath);
        console.warn(`[DatabaseManager] Corrupt DB backed up → ${backupPath}`);
      }
    } catch {
      // If rename fails, try unlinking.
      try {
        await RNFS.unlink(dbPath);
      } catch {
        // Last resort — proceed and let open() create a new file.
      }
    }

    // 3. Also try to remove WAL / SHM files.
    for (const suffix of ['-wal', '-shm']) {
      try {
        const walPath = `${dbPath}${suffix}`;
        const walExists = await RNFS.exists(walPath);
        if (walExists) {
          await RNFS.unlink(walPath);
        }
      } catch {
        // Non-critical.
      }
    }

    // 4. Re-open a fresh database.
    this.db = open({
      name: DB_NAME,
      encryptionKey,
    });

    await this.db.execute('PRAGMA journal_mode = WAL');
    await this.db.execute('PRAGMA foreign_keys = ON');
    await this.createTables();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Row ↔ Domain-object mapping
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Map a raw DB row to an `EnrolledUser` domain object.
   */
  private static rowToUser(row: Record<string, unknown>): EnrolledUser {
    let embedding: number[] = [];
    try {
      embedding = JSON.parse(String(row.embedding ?? '[]'));
    } catch {
      embedding = [];
    }

    let metadata = undefined;
    try {
      if (row.metadata) {
        metadata = JSON.parse(String(row.metadata));
      }
    } catch {
      metadata = undefined;
    }

    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      employeeId: String(row.employee_id ?? ''),
      embedding,
      enrollmentDate: String(row.enrollment_date ?? ''),
      lastUpdated: String(row.last_updated ?? ''),
      photoCount: Number(row.photo_count ?? 1),
      metadata,
    };
  }

  /**
   * Map a raw DB row to an `AuthLog` domain object.
   */
  private static rowToAuthLog(row: Record<string, unknown>): AuthLog {
    return {
      id: String(row.id ?? ''),
      timestamp: String(row.timestamp ?? ''),
      userId: row.user_id != null ? String(row.user_id) : null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      matchConfidence: Number(row.match_confidence ?? 0),
      livenessChallenge: String(row.liveness_challenge ?? ''),
      livenessScore: Number(row.liveness_score ?? 0),
      antiSpoofScore: Number(row.antispoof_score ?? 0),
      result: String(row.result ?? 'failure') as AuthLog['result'],
      failureReason:
        row.failure_reason != null ? String(row.failure_reason) : null,
      deviceId: String(row.device_id ?? ''),
      appVersion: String(row.app_version ?? ''),
      synced: Number(row.synced ?? 0) === 1,
      createdAt: String(row.created_at ?? ''),
    };
  }
}
