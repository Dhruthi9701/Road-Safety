/**
 * NHAI FaceAuth — Sync Status Hook
 *
 * Provides sync status information and manual sync triggers for UI components.
 */
import {useState, useCallback, useEffect, useRef} from 'react';
import {SyncManager} from '../modules/syncService/SyncManager';
import {DatabaseManager} from '../modules/dataManager/DatabaseManager';
import type {SyncStatus} from '../types';
import {createLogger} from '../utils/helpers';

const log = createLogger('useSync');

interface SyncHookResult {
  /** Current sync status */
  status: SyncStatus;
  /** Manually trigger a sync */
  forceSync: () => Promise<void>;
  /** Whether a sync is in progress */
  isSyncing: boolean;
  /** Last sync error message */
  lastError: string | null;
  /** Refresh the status */
  refreshStatus: () => Promise<void>;
}

/**
 * Hook for managing sync status in UI components.
 *
 * Polls for status updates every 30 seconds and provides
 * manual sync trigger capability.
 */
export function useSync(): SyncHookResult {
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: false,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    lastSyncResult: null,
    failedBatches: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const pollInterval = useRef<ReturnType<typeof setInterval>>();

  const refreshStatus = useCallback(async () => {
    try {
      const syncManager = SyncManager.getInstance();
      const currentStatus = await syncManager.getSyncStatus();
      setStatus(currentStatus);
      setIsSyncing(currentStatus.isSyncing);
    } catch (error) {
      log.error('Failed to refresh sync status:', error);
    }
  }, []);

  const forceSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      setLastError(null);

      const syncManager = SyncManager.getInstance();
      await syncManager.forceSync();

      await refreshStatus();
      log.info('Manual sync completed');
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Sync failed';
      setLastError(errorMsg);
      log.error('Manual sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [refreshStatus]);

  // Poll for status updates
  useEffect(() => {
    refreshStatus();
    pollInterval.current = setInterval(refreshStatus, 30000);

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [refreshStatus]);

  return {
    status,
    forceSync,
    isSyncing,
    lastError,
    refreshStatus,
  };
}
