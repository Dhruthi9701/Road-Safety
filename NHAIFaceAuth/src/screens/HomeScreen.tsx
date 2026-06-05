/**
 * NHAI FaceAuth — HomeScreen
 *
 * Premium portal entry point for biometric activities.
 * Features:
 *   - NHAI Hackathon 7.0 Branding and Title Header
 *   - Pulse-animated holographic Face Scan icon
 *   - Interactive card navigation items for:
 *       1. Personnel Verification (Authenticate)
 *       2. Supervisor Enrollment (Enroll Worker)
 *       3. Admin Configuration Dashboard (Logs, Sync, DB stats)
 *   - Bottom diagnostic status strip displaying:
 *       - database counts (enrolled workers)
 *       - S3 sync queue status and connectivity indicator
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { DatabaseManager } from '../modules/dataManager/DatabaseManager';
import { useSync } from '../hooks/useSync';
import { COLORS } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const isFocused = useIsFocused();
  const sync = useSync();

  const [userCount, setUserCount] = useState(0);

  // Animation Refs
  const iconPulse = useRef(new Animated.Value(1)).current;
  const cardsFade = useRef(new Animated.Value(0)).current;
  const cardsSlide = useRef(new Animated.Value(40)).current;

  // Query database statistics whenever the screen comes into focus
  useEffect(() => {
    if (isFocused) {
      DatabaseManager.getInstance()
        .getUserCount()
        .then(setUserCount)
        .catch(err => console.error('Failed to load user count:', err));

      // Trigger entrance animations
      Animated.parallel([
        Animated.timing(cardsFade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(cardsSlide, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset animations
      cardsFade.setValue(0);
      cardsSlide.setValue(40);
    }
  }, [isFocused]);

  // Infinite pulsing scan icon loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, {
          toValue: 1.08,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(iconPulse, {
          toValue: 1.0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const formatLastSync = (time: string | null) => {
    if (!time) return 'Never';
    const date = new Date(time);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Brand Header */}
      <View style={styles.header}>
        <Text style={styles.brandSubtitle}>NATIONAL HIGHWAYS AUTHORITY OF INDIA</Text>
        <Text style={styles.brandTitle}>NHAI FaceAuth</Text>
        <View style={styles.brandLine} />
      </View>

      {/* Hero Icon Section */}
      <View style={styles.heroSection}>
        <Animated.View
          style={[
            styles.hologramRing,
            { transform: [{ scale: iconPulse }] },
          ]}
        >
          <Text style={styles.scanIcon}>🛡️</Text>
        </Animated.View>
        <Text style={styles.heroSubText}>Fully Offline Facial Authentication System</Text>
      </View>

      {/* Menu Options (Animated Card Stack) */}
      <Animated.View
        style={[
          styles.menuContainer,
          {
            opacity: cardsFade,
            transform: [{ translateY: cardsSlide }],
          },
        ]}
      >
        {/* Card 1: Authenticate */}
        <TouchableOpacity
          style={[styles.menuCard, styles.primaryCard]}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Camera', { mode: 'authenticate' })}
        >
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Verify Identity</Text>
            <Text style={styles.cardDesc}>Perform facial & liveness verification</Text>
          </View>
          <Text style={styles.cardChevron}>➔</Text>
        </TouchableOpacity>

        {/* Card 2: Enroll */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Enrollment')}
        >
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Supervisor Enrollment</Text>
            <Text style={styles.cardDesc}>Enroll new toll / site field personnel</Text>
          </View>
          <Text style={styles.cardChevron}>➔</Text>
        </TouchableOpacity>

        {/* Card 3: Admin Dashboard */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('AdminDashboard')}
        >
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Supervisor Console</Text>
            <Text style={styles.cardDesc}>Manage users, logs, and sync options</Text>
          </View>
          <Text style={styles.cardChevron}>➔</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Bottom Status strip */}
      <View style={styles.statusBar}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Enrolled Personnel:</Text>
          <Text style={styles.statusValue}>{userCount}</Text>
        </View>
        
        <View style={styles.statusDivider} />

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Queue Status:</Text>
          <Text style={[
            styles.statusValue, 
            sync.pendingCount > 0 ? { color: COLORS.warning } : { color: COLORS.accent }
          ]}>
            {sync.pendingCount} pending
          </Text>
        </View>

        <View style={styles.statusDivider} />

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Connection:</Text>
          <Text style={[
            styles.statusValue, 
            sync.isOnline ? { color: COLORS.accent } : { color: COLORS.textSecondary }
          ]}>
            {sync.isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 30,
    alignItems: 'center',
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  brandLine: {
    width: 60,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginTop: 10,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  hologramRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(79, 142, 247, 0.3)',
    backgroundColor: 'rgba(79, 142, 247, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  scanIcon: {
    fontSize: 64,
  },
  heroSubText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  menuContainer: {
    paddingHorizontal: 24,
    gap: 16,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryCard: {
    borderColor: 'rgba(79, 142, 247, 0.4)',
    backgroundColor: 'rgba(79, 142, 247, 0.05)',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  cardChevron: {
    fontSize: 20,
    color: COLORS.textSecondary,
    marginLeft: 15,
  },
  statusBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginRight: 4,
  },
  statusValue: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '800',
  },
  statusDivider: {
    width: 1,
    height: 14,
    backgroundColor: COLORS.border,
  },
});

export default HomeScreen;
