/**
 * NHAI FaceAuth — Root Application Component
 *
 * Initializes the navigation stack, database, and sync service.
 * Entry point for the offline facial recognition app.
 */
import React, {useEffect, useState, useCallback} from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import EnrollmentScreen from './src/screens/EnrollmentScreen';
import AdminDashboard from './src/screens/AdminDashboard';
import {DatabaseManager} from './src/modules/dataManager/DatabaseManager';
import {SyncManager} from './src/modules/syncService/SyncManager';
import {APP_NAME} from './src/constants/config';
import type {RootStackParamList} from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Dark theme colors */
const COLORS = {
  background: '#0A0E1A',
  surface: '#141927',
  primary: '#4F8EF7',
  primaryDark: '#2563EB',
  accent: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  border: '#1E293B',
};

/**
 * Splash/loading screen shown during initialization
 */
const LoadingScreen: React.FC<{message: string}> = ({message}) => (
  <View style={styles.loadingContainer}>
    <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
    <View style={styles.loadingContent}>
      <View style={styles.logoContainer}>
        <Text style={styles.logoText}>🛣️</Text>
        <Text style={styles.appTitle}>{APP_NAME}</Text>
        <Text style={styles.appSubtitle}>
          Offline Facial Recognition System
        </Text>
      </View>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.loadingMessage}>{message}</Text>
    </View>
    <Text style={styles.footerText}>NHAI Hackathon 7.0</Text>
  </View>
);

/**
 * Root App component — handles initialization and navigation
 */
const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [initError, setInitError] = useState<string | null>(null);

  const initializeApp = useCallback(async () => {
    try {
      // Step 1: Initialize encrypted database
      setLoadingMessage('Setting up secure storage...');
      const db = DatabaseManager.getInstance();
      await db.initialize();

      // Step 2: Initialize sync service
      setLoadingMessage('Starting sync service...');
      const syncManager = SyncManager.getInstance();
      await syncManager.initialize();

      // Step 3: Verify database integrity
      setLoadingMessage('Verifying data integrity...');
      const isIntact = await db.verifyIntegrity();
      if (!isIntact) {
        console.warn('Database integrity check failed, attempting recovery...');
        Alert.alert(
          'Data Warning',
          'Database integrity issue detected. Some data may need to be re-synced.',
        );
      }

      setLoadingMessage('Ready!');
      setIsReady(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown initialization error';
      console.error('App initialization failed:', errorMessage);
      setInitError(errorMessage);
      Alert.alert(
        'Initialization Error',
        `Failed to start the app: ${errorMessage}\n\nPlease restart the app.`,
        [{text: 'OK'}],
      );
    }
  }, []);

  useEffect(() => {
    initializeApp();

    return () => {
      // Cleanup on unmount
      try {
        SyncManager.getInstance().stop();
        DatabaseManager.getInstance().close();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [initializeApp]);

  if (initError) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.background}
        />
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorTitle}>Initialization Failed</Text>
        <Text style={styles.errorMessage}>{initError}</Text>
        <Text style={styles.errorHint}>Please restart the application</Text>
      </View>
    );
  }

  if (!isReady) {
    return <LoadingScreen message={loadingMessage} />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: COLORS.primary,
            background: COLORS.background,
            card: COLORS.surface,
            text: COLORS.text,
            border: COLORS.border,
            notification: COLORS.accent,
          },
          fonts: {
            regular: {fontFamily: 'System', fontWeight: '400' as const},
            medium: {fontFamily: 'System', fontWeight: '500' as const},
            bold: {fontFamily: 'System', fontWeight: '700' as const},
            heavy: {fontFamily: 'System', fontWeight: '900' as const},
          },
        }}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.background}
          translucent={false}
        />
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: {
              backgroundColor: COLORS.surface,
            },
            headerTintColor: COLORS.text,
            headerTitleStyle: {
              fontWeight: '600',
              fontSize: 18,
            },
            headerShadowVisible: false,
            animation: 'slide_from_right',
            contentStyle: {
              backgroundColor: COLORS.background,
            },
          }}>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{
              title: APP_NAME,
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="Camera"
            component={CameraScreen}
            options={{
              title: 'Face Authentication',
              headerShown: false,
              animation: 'fade',
            }}
          />
          <Stack.Screen
            name="Enrollment"
            component={EnrollmentScreen}
            options={{
              title: 'Enroll New User',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="AdminDashboard"
            component={AdminDashboard}
            options={{
              title: 'Admin Dashboard',
              headerBackTitle: 'Back',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    gap: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 64,
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 1,
  },
  appSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  loadingMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  footerText: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: COLORS.textSecondary,
    opacity: 0.6,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.danger,
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  errorHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    opacity: 0.7,
  },
});

export default App;
export {COLORS};
