/**
 * NHAI FaceAuth — KeyManager
 *
 * Manages the SQLCipher database encryption key lifecycle:
 *   - Generates a 256-bit hex key using crypto-secure random bytes
 *   - Stores / retrieves the key from the secure OS Keychain
 *   - Supports key rotation (re-encrypt DB with new key)
 *   - Supports key deletion for factory-reset scenarios
 *
 * @module dataManager/KeyManager
 */

import 'react-native-get-random-values'; // polyfill — must be imported before crypto usage
import * as Keychain from 'react-native-keychain';
import { KEYCHAIN_SERVICE } from '../../constants/config';

/** Byte-length for AES-256 key (32 bytes → 64 hex chars). */
const KEY_BYTE_LENGTH = 32;

/** Username stored alongside the key in the Keychain (required by API). */
const KEYCHAIN_USERNAME = 'nhai_faceauth_dbkey';

/**
 * Manages the SQLCipher encryption key used by `DatabaseManager`.
 *
 * All methods are static — there is no instance state to maintain.
 *
 * @example
 * ```ts
 * const key = await KeyManager.getOrCreateKey();
 * // use `key` when opening the op-sqlite database
 * ```
 */
export class KeyManager {
  // ────────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Retrieve the existing encryption key from the Keychain, or generate a new
   * one if none exists yet.
   *
   * @returns A 64-character lowercase hex string (256-bit key).
   * @throws  If Keychain access fails for reasons other than "not found".
   */
  static async getOrCreateKey(): Promise<string> {
    try {
      const existing = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
      });

      if (existing && existing.password) {
        return existing.password;
      }
    } catch (error: unknown) {
      // Keychain returns `false` when nothing is stored — that is not an error.
      // Any other failure *is* an error and should propagate.
      const message =
        error instanceof Error ? error.message : String(error);

      // Some Keychain implementations throw when no entry exists instead of
      // returning `false`. Treat that as "not found".
      if (!KeyManager.isNotFoundError(message)) {
        throw new Error(`[KeyManager] Failed to read Keychain: ${message}`);
      }
    }

    // No key found — generate, persist, and return.
    const newKey = KeyManager.generateHexKey();
    await KeyManager.storeKey(newKey);
    return newKey;
  }

  /**
   * Rotate the database encryption key.
   *
   * The caller (typically `DatabaseManager`) is responsible for executing the
   * SQLCipher `PRAGMA rekey` command with `newKey` **before** calling this
   * method so that the on-disk database is already re-encrypted.
   *
   * This method simply replaces the key stored in the Keychain.
   *
   * @param _oldKey  The current key (validated for extra safety).
   * @param newKey   The replacement 256-bit hex key.
   * @throws If the stored key does not match `_oldKey` or if Keychain write fails.
   */
  static async rotateKey(_oldKey: string, newKey: string): Promise<void> {
    if (!newKey || newKey.length !== KEY_BYTE_LENGTH * 2) {
      throw new Error(
        `[KeyManager] newKey must be a ${KEY_BYTE_LENGTH * 2}-char hex string.`,
      );
    }

    // Validate that _oldKey matches the currently stored key.
    const currentKey = await KeyManager.readKeyFromKeychain();
    if (currentKey === null) {
      throw new Error(
        '[KeyManager] Cannot rotate — no existing key found in Keychain.',
      );
    }
    if (currentKey !== _oldKey) {
      throw new Error(
        '[KeyManager] Cannot rotate — provided oldKey does not match stored key.',
      );
    }

    await KeyManager.storeKey(newKey);
  }

  /**
   * Delete the encryption key from the Keychain.
   *
   * Use during a factory-reset flow. The encrypted database will become
   * inaccessible after this call.
   *
   * @throws If the Keychain reset operation fails.
   */
  static async deleteKey(): Promise<void> {
    try {
      await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`[KeyManager] Failed to delete key: ${message}`);
    }
  }

  /**
   * Generate a fresh 256-bit hex key suitable for use with SQLCipher.
   *
   * @returns A 64-character lowercase hex string.
   */
  static generateHexKey(): string {
    const bytes = new Uint8Array(KEY_BYTE_LENGTH);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Read the raw key string from the Keychain, or return `null` if no entry
   * exists.
   */
  private static async readKeyFromKeychain(): Promise<string | null> {
    try {
      const result = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
      });
      if (result && result.password) {
        return result.password;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Persist `key` to the OS Keychain.
   *
   * @param key  64-char hex string.
   */
  private static async storeKey(key: string): Promise<void> {
    try {
      await Keychain.setGenericPassword(KEYCHAIN_USERNAME, key, {
        service: KEYCHAIN_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`[KeyManager] Failed to store key: ${message}`);
    }
  }

  /**
   * Heuristic to detect "not found" errors from different Keychain
   * implementations across Android / iOS.
   */
  private static isNotFoundError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('not found') ||
      lower.includes('no credentials') ||
      lower.includes('could not find') ||
      lower.includes('empty')
    );
  }
}
