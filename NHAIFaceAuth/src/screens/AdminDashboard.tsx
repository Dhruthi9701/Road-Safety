/**
 * NHAI FaceAuth — AdminDashboard
 *
 * Supervisor dashboard containing system monitoring and data configuration.
 * Implements 4 primary views via custom header tabs:
 *   1. Overview: Quick cards containing metrics (Total Workers, Pending Syncs,
 *      Success Rate, Lockouts), manual Sync triggers, and a recent auth feed.
 *   2. Personnel: Searchable roster of enrolled workers with delete actions.
 *   3. Logs: Detailed lists of recent authentication logs (successes & failures)
 *      with GPS coordinates.
 *   4. System: Storage sizes, free space checks, and AWS configurations.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Dimensions,
  Share,
} from 'react-native';
import { DatabaseManager } from '../modules/dataManager/DatabaseManager';
import { SyncManager } from '../modules/syncService/SyncManager';
import { StorageMonitor } from '../modules/dataManager/StorageMonitor';
import { useSync } from '../hooks/useSync';
import type { EnrolledUser, AuthLog } from '../types';
import { COLORS } from '../../App';

type ActiveTab = 'OVERVIEW' | 'WORKERS' | 'LOGS' | 'SYSTEM';
const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'OVERVIEW', label: 'Stats' },
  { id: 'WORKERS', label: 'Workers' },
  { id: 'LOGS', label: 'Logs' },
  { id: 'SYSTEM', label: 'System' },
];

export const AdminDashboard: React.FC = () => {
  const syncHook = useSync();
  const [activeTab, setActiveTab] = useState<ActiveTab>('OVERVIEW');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // States
  const [totalWorkers, setTotalWorkers] = useState(0);
  const [logsStats, setLogsStats] = useState({ total: 0, synced: 0, pending: 0 });
  const [recentLogs, setRecentLogs] = useState<AuthLog[]>([]);
  const [enrolledWorkers, setEnrolledWorkers] = useState<EnrolledUser[]>([]);
  const [filteredWorkers, setFilteredWorkers] = useState<EnrolledUser[]>([]);
  const [authLogs, setAuthLogs] = useState<AuthLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuthLog[]>([]);
  const [storageReport, setStorageReport] = useState<any>(null);

  // Filters
  const [workerSearch, setWorkerSearch] = useState('');
  const [logFilter, setLogFilter] = useState<'ALL' | 'SUCCESS' | 'FAILURE'>('ALL');

  // Load Dashboard Data
  const loadData = useCallback(async () => {
    setLoading(true);
    const db = DatabaseManager.getInstance();

    try {
      // 1. Worker count & logs
      const wCount = await db.getUserCount();
      setTotalWorkers(wCount);

      const lStats = await db.getLogCount();
      setLogsStats(lStats);

      const rLogs = await db.getRecentLogs(10);
      setRecentLogs(rLogs);

      // 2. Fetch full worker roster
      const workers = await db.getAllUsers();
      setEnrolledWorkers(workers);
      setFilteredWorkers(
        workers.filter(w =>
          w.name.toLowerCase().includes(workerSearch.toLowerCase()) ||
          w.employeeId.toLowerCase().includes(workerSearch.toLowerCase())
        )
      );

      // 3. Fetch full logs
      const logs = await db.getRecentLogs(100);
      setAuthLogs(logs);
      applyLogFilters(logs, logFilter);

      // 4. Storage report
      const storage = await StorageMonitor.getStorageReport(db);
      setStorageReport(storage);
    } catch (err) {
      console.error('[AdminDashboard] Load data failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workerSearch, logFilter]);

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Filter Workers List
  useEffect(() => {
    setFilteredWorkers(
      enrolledWorkers.filter(w =>
        w.name.toLowerCase().includes(workerSearch.toLowerCase()) ||
        w.employeeId.toLowerCase().includes(workerSearch.toLowerCase())
      )
    );
  }, [workerSearch, enrolledWorkers]);

  const applyLogFilters = (logs: AuthLog[], filter: typeof logFilter) => {
    if (filter === 'ALL') {
      setFilteredLogs(logs);
    } else if (filter === 'SUCCESS') {
      setFilteredLogs(logs.filter(l => l.result === 'success'));
    } else {
      setFilteredLogs(logs.filter(l => l.result === 'failure'));
    }
  };

  const handleLogFilterChange = (filter: typeof logFilter) => {
    setLogFilter(filter);
    applyLogFilters(authLogs, filter);
  };

  // Actions
  const handleManualSync = async () => {
    Alert.alert('Initiating Upload', 'Connecting to S3 and uploading local log batches...');
    await SyncManager.getInstance().forceSync();
    await loadData();
    Alert.alert('Sync Processed', 'Upload cycle completed.');
  };

  const handleDeleteWorker = (workerId: string, name: string) => {
    Alert.alert(
      'Delete Biometrics?',
      `Are you sure you want to permanently delete enrolled profile for ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await DatabaseManager.getInstance().deleteUser(workerId);
            await loadData();
          },
        },
      ]
    );
  };

  const handleExportLogs = async () => {
    try {
      const logsString = JSON.stringify(authLogs, null, 2);
      await Share.share({
        message: logsString,
        title: 'Exported NHAI Auth Logs',
      });
    } catch (err) {
      Alert.alert('Export Failed', 'Unable to compile log payload.');
    }
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Tab Renderer Components
  const renderOverview = () => {
    const successCount = authLogs.filter(l => l.result === 'success').length;
    const successRate = authLogs.length > 0 ? (successCount / authLogs.length) * 100 : 100;

    return (
      <ScrollView
        contentContainerStyle={styles.tabContentScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Metric Cards Row */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Workers</Text>
            <Text style={styles.metricValue}>{totalWorkers}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Success Rate</Text>
            <Text style={[styles.metricValue, { color: COLORS.accent }]}>
              {successRate.toFixed(0)}%
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Pending Sync</Text>
            <Text style={[styles.metricValue, logsStats.pending > 0 ? { color: COLORS.warning } : {}]}>
              {logsStats.pending}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Sessions</Text>
            <Text style={styles.metricValue}>{logsStats.total}</Text>
          </View>
        </View>

        {/* Quick actions panel */}
        <View style={styles.actionsPanel}>
          <Text style={styles.panelTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]} onPress={handleManualSync}>
              <Text style={styles.actionBtnText}>☁ Manual Sync S3</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleExportLogs}>
              <Text style={[styles.actionBtnText, { color: COLORS.text }]}>📤 Export Logs</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent activity strip */}
        <View style={styles.activityPanel}>
          <Text style={styles.panelTitle}>Recent Biometric Sessions</Text>
          {recentLogs.length === 0 ? (
            <Text style={styles.emptyText}>No authentication activities recorded yet.</Text>
          ) : (
            recentLogs.map(log => {
              const isSuccess = log.result === 'success';
              return (
                <View key={log.id} style={styles.activityItem}>
                  <View style={styles.itemMeta}>
                    <Text style={styles.workerNameText}>
                      {isSuccess ? `User: ${log.userId?.substring(0, 8)}` : 'Unknown'}
                    </Text>
                    <Text style={styles.itemTimeText}>{formatTime(log.timestamp)}</Text>
                  </View>
                  <View style={styles.itemOutcome}>
                    <Text
                      style={[
                        styles.outcomeText,
                        isSuccess ? { color: COLORS.accent } : { color: COLORS.danger },
                      ]}
                    >
                      {isSuccess ? 'PASS' : 'FAIL'}
                    </Text>
                    <Text style={styles.confidenceText}>{(log.matchConfidence * 100).toFixed(0)}%</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  const renderWorkers = () => {
    return (
      <View style={styles.tabContentListContainer}>
        <TextInput
          style={styles.searchBar}
          value={workerSearch}
          onChangeText={setWorkerSearch}
          placeholder="Search by name or employee ID..."
          placeholderTextColor={COLORS.textSecondary}
        />

        <FlatList
          data={filteredWorkers}
          keyExtractor={item => item.id}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No enrolled workers found.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.workerListItem}>
              <View>
                <Text style={styles.workerListName}>{item.name}</Text>
                <Text style={styles.workerListId}>ID: {item.employeeId}</Text>
                <Text style={styles.workerListDate}>Enrolled: {new Date(item.enrollmentDate).toLocaleDateString()}</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDeleteWorker(item.id, item.name)}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    );
  };

  const renderLogs = () => {
    return (
      <View style={styles.tabContentListContainer}>
        {/* Filter Bar */}
        <View style={styles.filterBar}>
          {(['ALL', 'SUCCESS', 'FAILURE'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, logFilter === f && styles.filterChipActive]}
              onPress={() => handleLogFilterChange(f)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  logFilter === f && styles.filterChipTextActive,
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filteredLogs}
          keyExtractor={item => item.id}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No authentication logs matching filter.</Text>
          }
          renderItem={({ item }) => {
            const isSuccess = item.result === 'success';
            return (
              <View style={styles.logListItem}>
                <View style={styles.logMeta}>
                  <Text style={styles.workerListName}>
                    {isSuccess ? `Worker: ${item.userId?.substring(0, 8)}` : `Fail: ${item.failureReason}`}
                  </Text>
                  <Text style={styles.logListDate}>{formatTime(item.timestamp)}</Text>
                  {item.latitude ? (
                    <Text style={styles.logListGps}>
                      GPS: {item.latitude.toFixed(4)}, {item.longitude?.toFixed(4)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.logStatus}>
                  <Text
                    style={[
                      styles.logStatusVal,
                      isSuccess ? { color: COLORS.accent } : { color: COLORS.danger },
                    ]}
                  >
                    {isSuccess ? 'SUCCESS' : 'FAILURE'}
                  </Text>
                  <Text style={styles.logListConfidence}>
                    Match: {(item.matchConfidence * 100).toFixed(0)}%
                  </Text>
                </View>
              </View>
            );
          }}
        />
      </View>
    );
  };

  const renderSystem = () => {
    if (!storageReport) return null;

    const dbKb = (storageReport.dbSize / 1024).toFixed(1);
    const freeMb = (storageReport.freeSpace / (1024 * 1024)).toFixed(0);

    return (
      <ScrollView
        contentContainerStyle={styles.tabContentScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.panelTitle}>Storage Metrics</Text>
        <View style={styles.systemCard}>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>SQLite Database Size</Text>
            <Text style={styles.systemVal}>{dbKb} KB</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Available Device Storage</Text>
            <Text style={styles.systemVal}>{freeMb} MB</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Logs Synced / Total</Text>
            <Text style={styles.systemVal}>
              {logsStats.synced} / {logsStats.total}
            </Text>
          </View>
        </View>

        <Text style={styles.panelTitle}>Biometric AI Models (Offline)</Text>
        <View style={styles.systemCard}>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Face Detector (BlazeFace)</Text>
            <Text style={styles.systemVal}>~200 KB (INT8)</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Liveness Mesh (FaceMesh)</Text>
            <Text style={styles.systemVal}>~2.5 MB (INT8)</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Face Recognizer (MobileFaceNet)</Text>
            <Text style={styles.systemVal}>~1.0 MB (INT8)</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Anti-Spoof (MobileNetV2)</Text>
            <Text style={styles.systemVal}>~3.5 MB (INT8)</Text>
          </View>
        </View>

        <Text style={styles.panelTitle}>Sync Service configuration</Text>
        <View style={styles.systemCard}>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>AWS S3 Region</Text>
            <Text style={styles.systemVal}>ap-south-1 (Mumbai)</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Gzip Compression</Text>
            <Text style={[styles.systemVal, { color: COLORS.accent }]}>Enabled (pako)</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Background Scheduling</Text>
            <Text style={[styles.systemVal, { color: COLORS.accent }]}>On network Online</Text>
          </View>
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* custom Navigation Tabs */}
      <View style={styles.tabsHeader}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabItem, activeTab === tab.id && styles.tabItemActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text
              style={[
                styles.tabItemText,
                activeTab === tab.id && styles.tabItemTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Screen body loading state */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <View style={styles.tabContentContainer}>
          {activeTab === 'OVERVIEW' && renderOverview()}
          {activeTab === 'WORKERS' && renderWorkers()}
          {activeTab === 'LOGS' && renderLogs()}
          {activeTab === 'SYSTEM' && renderSystem()}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabsHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: COLORS.primary,
  },
  tabItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabItemTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContentContainer: {
    flex: 1,
  },
  tabContentScroll: {
    padding: 20,
    paddingBottom: 40,
  },
  tabContentListContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 15,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    width: (Dimensions.get('window').width - 52) / 2,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  actionsPanel: {
    marginBottom: 20,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 12,
    marginTop: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderColor: COLORS.border,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  activityPanel: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemMeta: {
    gap: 4,
  },
  workerNameText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  itemTimeText: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  itemOutcome: {
    alignItems: 'flex-end',
    gap: 2,
  },
  outcomeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  confidenceText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30,
  },
  searchBar: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.text,
    paddingHorizontal: 16,
    height: 46,
    marginBottom: 15,
  },
  workerListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  workerListName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  workerListId: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  workerListDate: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: COLORS.danger,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteBtnText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 15,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  logListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  logMeta: {
    flex: 1,
    gap: 4,
  },
  logListDate: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  logListGps: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  logStatus: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  logStatusVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  logListConfidence: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  systemCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  systemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  systemLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  systemVal: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
  },
});

export default AdminDashboard;
