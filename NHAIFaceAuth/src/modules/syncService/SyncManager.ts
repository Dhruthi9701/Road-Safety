/**
 * NHAI FaceAuth — SyncManager
 *
 * Orchestrates background synchronization of authentication logs to AWS S3:
 *   - Monitors internet connectivity via NetInfo.
 *   - Auto-triggers sync when device transitions from Offline to Online.
 *   - Batches unsynced logs in chunks of 100.
 *   - Compresses batch logs using pako (gzip) and uploads via S3Uploader.
 *   - Implements robust retry logic with exponential backoff on upload failure.
 *   - Marks logs as synced in DatabaseManager only after S3 confirms upload.
 *
 * @module syncService/SyncManager
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { DatabaseManager } from '../dataManager/DatabaseManager';
import { S3Uploader } from './S3Uploader';
import { PurgeManager } from './PurgeManager';
import {
  SYNC_BATCH_SIZE,
  MAX_SYNC_ATTEMPTS,
  SYNC_RETRY_DELAY_MS,
  APP_VERSION,
} from '../../constants/config';
import type { SyncStatus, SyncState, SyncPayload, SyncLogRecord } from './types';
import type { AuthLog } from '../../types';
import DeviceInfo from 'react-native-device-info';

// ─── MD5 Checksum Implementation (Pure JS) ───────────────────────────────────

function md5(string: string): string {
  function RotateLeft(lValue: number, iShiftBits: number) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }

  function AddUnsigned(lX: number, lY: number) {
    const lX4 = lX & 0x40000000;
    const lY4 = lY & 0x40000000;
    const lX8 = lX & 0x80000000;
    const lY8 = lY & 0x80000000;
    const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
    if (lX4 & lY4) {
      return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    }
    if (lX4 | lY4) {
      if (lResult & 0x40000000) {
        return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
      } else {
        return lResult ^ 0x40000000 ^ lX8 ^ lY8;
      }
    } else {
      return lResult ^ lX8 ^ lY8;
    }
  }

  function F(x: number, y: number, z: number) {
    return (x & y) | (~x & z);
  }
  function G(x: number, y: number, z: number) {
    return (x & z) | (y & ~z);
  }
  function H(x: number, y: number, z: number) {
    return x ^ y ^ z;
  }
  function I(x: number, y: number, z: number) {
    return y ^ (x | ~z);
  }

  function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }

  function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }

  function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }

  function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  }

  function ConvertToWordArray(string: string) {
    let lWordCount;
    const lMessageLength = string.length;
    const lNumberOfWords_temp1 = lMessageLength + 8;
    const lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
    const lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
    const lWordArray = new Array(lWordArrayLength);
    var lWordArrayLength = lNumberOfWords;
    for (let i = 0; i < lWordArrayLength; i++) {
      lWordArray[i] = 0;
    }
    let lBytePosition = 0;
    let lByteCount = 0;
    while (lByteCount < lMessageLength) {
      lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition);
      lByteCount++;
    }
    lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    return lWordArray;
  }

  function WordToHex(lValue: number) {
    let WordToHexValue = '',
      WordToHexValue_temp = '',
      lByte,
      lCount;
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255;
      WordToHexValue_temp = '0' + lByte.toString(16);
      WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
    }
    return WordToHexValue;
  }

  function Utf8Encode(string: string) {
    string = string.replace(/\r\n/g, '\n');
    let utftext = '';
    for (let n = 0; n < string.length; n++) {
      const c = string.charCodeAt(n);
      if (c < 128) {
        utftext += String.fromCharCode(c);
      } else if (c > 127 && c < 2048) {
        utftext += String.fromCharCode((c >> 6) | 192);
        utftext += String.fromCharCode((c & 63) | 128);
      } else {
        utftext += String.fromCharCode((c >> 12) | 224);
        utftext += String.fromCharCode(((c >> 6) & 63) | 128);
        utftext += String.fromCharCode((c & 63) | 128);
      }
    }
    return utftext;
  }

  let x = [];
  let k, AA, BB, CC, DD, a, b, c, d;
  const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  const S41 = 6, S42 = 10, S43 = 15, S44 = 21;

  string = Utf8Encode(string);
  x = ConvertToWordArray(string);
  a = 0x67452301;
  b = 0xefcdab89;
  c = 0x98badcfe;
  d = 0x10325476;

  for (k = 0; k < x.length; k += 16) {
    AA = a;
    BB = b;
    CC = c;
    DD = d;
    a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
    d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
    b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
    d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
    b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
    d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
    b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
    d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
    b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
    a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
    d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
    b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
    d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
    c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
    b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
    d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
    b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
    d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
    b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
    a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
    d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
    b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
    d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
    b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
    d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
    b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05;
    a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
    d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
    b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
    a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
    d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
    b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
    d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
    b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
    d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
    b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
    d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
    b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
    a = AddUnsigned(a, AA);
    b = AddUnsigned(b, BB);
    c = AddUnsigned(c, CC);
    d = AddUnsigned(d, DD);
  }

  const temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d);
  return temp.toLowerCase();
}

// ────────────────────────────────────────────────────────────────────────────

export class SyncManager {
  private static instance: SyncManager | null = null;

  private readonly db: DatabaseManager;
  private readonly uploader: S3Uploader;
  private readonly purger: PurgeManager;
  
  private state: SyncState = {
    isOnline: false,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    lastSyncResult: null,
    failedBatches: 0,
  };

  private unsubscribeNetInfo: (() => void) | null = null;
  private deviceId: string = 'unknown';

  private constructor() {
    this.db = DatabaseManager.getInstance();
    this.uploader = new S3Uploader();
    this.purger = new PurgeManager();
  }

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  /**
   * Initialize the SyncManager.
   * Resolves the device ID, hooks up NetInfo listener, and reads pending sync status.
   */
  async initialize(): Promise<void> {
    try {
      this.deviceId = await DeviceInfo.getUniqueId();
    } catch {
      this.deviceId = 'fallback_device_' + Math.floor(Math.random() * 100000);
    }

    // Load credentials from DB if stored (configurable dynamically)
    const accessKeyId = await this.db.getConfig('aws_access_key_id');
    const secretAccessKey = await this.db.getConfig('aws_secret_access_key');
    const bucket = await this.db.getConfig('aws_s3_bucket');
    const region = await this.db.getConfig('aws_s3_region');

    if (accessKeyId && secretAccessKey) {
      this.uploader.initialize({
        accessKeyId,
        secretAccessKey,
        bucket: bucket || undefined,
        region: region || undefined,
      });
    }

    // Set up NetInfo connectivity subscriber
    this.unsubscribeNetInfo = NetInfo.addEventListener((netState: NetInfoState) => {
      const wasOnline = this.state.isOnline;
      const isOnline = !!netState.isConnected && !!netState.isInternetReachable;
      
      this.state.isOnline = isOnline;
      
      // If we transition offline -> online, trigger synchronization automatically
      if (!wasOnline && isOnline) {
        console.log('[SyncManager] Network online, initiating auto-sync.');
        this.startSync().catch(err => {
          console.error('[SyncManager] Auto-sync execution failed:', err);
        });
      }
    });

    // Query pending logs count initially
    await this.updatePendingCount();
  }

  /**
   * Disposes of NetInfo listeners and resets states.
   */
  stop(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
  }

  /**
   * Triggers the full synchronization pipeline.
   * Reads pending logs, constructs batches, uploads to S3, updates local database flags,
   * and runs PurgeManager if necessary.
   */
  async startSync(): Promise<SyncStatus> {
    if (this.state.isSyncing) {
      return this.getSyncStatus();
    }

    if (!this.state.isOnline) {
      this.state.lastSyncResult = 'failure';
      return this.getSyncStatus();
    }

    this.state.isSyncing = true;
    console.log('[SyncManager] Sync cycle started.');

    try {
      let syncCompletedCount = 0;
      let hasFailures = false;

      while (true) {
        // Fetch a batch of unsynced logs
        const logs = await this.db.getUnsyncedLogs(SYNC_BATCH_SIZE);
        if (logs.length === 0) {
          break; // No more pending logs
        }

        const success = await this.syncBatch(logs);
        if (!success) {
          hasFailures = true;
          break; // Stop further batch processing on error
        }

        syncCompletedCount += logs.length;
      }

      this.state.lastSyncResult = hasFailures ? 'failure' : 'success';
      this.state.lastSyncTime = new Date().toISOString();
      
      // Auto-purge old logs after successful sync
      if (!hasFailures && syncCompletedCount > 0) {
        await this.purger.purge(this.db);
      }
    } catch (error) {
      console.error('[SyncManager] Sync cycle error:', error);
      this.state.lastSyncResult = 'failure';
    } finally {
      this.state.isSyncing = false;
      await this.updatePendingCount();
    }

    return this.getSyncStatus();
  }

  /**
   * Forces a sync execution regardless of automatic online detection.
   */
  async forceSync(): Promise<void> {
    await this.startSync();
  }

  /**
   * Returns a copy of the current SyncStatus.
   */
  getSyncStatus(): SyncStatus {
    return {
      isOnline: this.state.isOnline,
      isSyncing: this.state.isSyncing,
      pendingCount: this.state.pendingCount,
      lastSyncTime: this.state.lastSyncTime,
      lastSyncResult: this.state.lastSyncResult,
      failedBatches: this.state.failedBatches,
    };
  }

  /**
   * Synchronizes a single batch of logs.
   * Performs JSON construction, MD5 checksumming, uploads, and updates Database.
   * Retries with exponential backoff on transient failures.
   */
  private async syncBatch(logs: AuthLog[]): Promise<boolean> {
    const batchId = 'batch_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
    const logIds = logs.map(l => l.id);

    // Map AuthLog to SyncLogRecord
    const records: SyncLogRecord[] = logs.map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      userId: l.userId,
      latitude: l.latitude,
      longitude: l.longitude,
      matchConfidence: l.matchConfidence,
      livenessChallenge: l.livenessChallenge,
      livenessScore: l.livenessScore,
      antiSpoofScore: l.antiSpoofScore,
      result: l.result,
      failureReason: l.failureReason,
      deviceId: l.deviceId,
      appVersion: l.appVersion,
    }));

    const recordsJson = JSON.stringify(records);
    const checksum = md5(recordsJson);

    const payload: SyncPayload = {
      batchId,
      deviceId: this.deviceId,
      createdAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      recordCount: records.length,
      checksum,
      records,
    };

    const payloadString = JSON.stringify(payload);
    
    // Generate S3 Key: nhai-face-auth/{deviceId}/{YYYY-MM-DD}/{batchId}.json.gz
    const dateStr = new Date().toISOString().split('T')[0];
    const s3Key = `nhai-face-auth/${this.deviceId}/${dateStr}/${batchId}.json.gz`;

    let attempt = 0;
    let success = false;
    let delay = SYNC_RETRY_DELAY_MS;

    while (attempt < MAX_SYNC_ATTEMPTS) {
      try {
        console.log(`[SyncManager] S3 Uploading batch ${batchId}, attempt ${attempt + 1}/${MAX_SYNC_ATTEMPTS}...`);
        const result = await this.uploader.uploadBatch(payloadString, s3Key);

        if (result.success) {
          console.log(`[SyncManager] Batch ${batchId} uploaded successfully. ETag: ${result.etag}`);
          
          // Verify upload was successful by checking HEAD
          const verified = await this.uploader.verifyUpload(s3Key, checksum);
          if (verified) {
            success = true;
            break;
          } else {
            console.warn(`[SyncManager] S3 verification failed for batch ${batchId}`);
          }
        } else {
          console.warn(`[SyncManager] S3 upload failed: ${result.error}`);
        }
      } catch (err) {
        console.error(`[SyncManager] Exception during S3 upload of batch ${batchId}:`, err);
      }

      attempt++;
      if (attempt < MAX_SYNC_ATTEMPTS) {
        console.log(`[SyncManager] Retrying batch ${batchId} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }

    if (success) {
      // Mark these logs as synced in our encrypted SQLite
      await this.db.markLogsSynced(logIds);
      return true;
    } else {
      this.state.failedBatches++;
      return false;
    }
  }

  /**
   * Refreshes the local pending count cache from DatabaseManager.
   */
  private async updatePendingCount(): Promise<void> {
    try {
      const stats = await this.db.getLogCount();
      this.state.pendingCount = stats.pending;
    } catch {
      this.state.pendingCount = 0;
    }
  }
}
