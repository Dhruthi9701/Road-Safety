/**
 * NHAI FaceAuth — CameraScreen
 *
 * Full-screen camera interface for real-time authentication.
 * Features:
 *   - Requests and manages camera permissions
 *   - Renders front-facing camera preview via `react-native-vision-camera`
 *   - Vision Camera frame processor running JSI models via `useAuthenticationPipeline`
 *   - Animated SVG layouts for Face Oval Guide, user Feedback instructions,
 *     Active Liveness countdown markers, and outcome Results
 *   - Seamless handle of app backgrounding / foregrounding states
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useAuthenticationPipeline } from '../hooks/useAuthenticationPipeline';
import {
  FaceOvalOverlay,
  FeedbackText,
  ChallengeProgress,
  ResultOverlay,
} from '../components';
import { COLORS } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Camera'>;
type CameraScreenRouteProp = RouteProp<RootStackParamList, 'Camera'>;

export const CameraScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CameraScreenRouteProp>();
  const { mode } = route.params;

  const [hasPermission, setHasPermission] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Get front camera device
  const device = useCameraDevice('front');

  // Initialize pipeline hook
  const pipeline = useAuthenticationPipeline();
  const { resize } = useResizePlugin();

  // App state listener for backgrounding
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        pipeline.reset();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [pipeline]);

  // Request Camera Permissions
  useEffect(() => {
    let active = true;

    const requestPermission = async () => {
      const status = await Camera.requestCameraPermission();
      if (active) {
        setHasPermission(status === 'granted');
        setInitializing(false);
      }
    };

    requestPermission();

    // Start pipeline models
    pipeline.initialize().catch(err => {
      console.error('[CameraScreen] Pipeline init failed:', err);
    });

    return () => {
      active = false;
      pipeline.dispose();
    };
  }, []);

  // Frame processor for real-time video stream analysis
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';

      // 1. Resize and convert YUV/RGBA frame to Float32Array RGB (128x128 short-range model target)
      // BlazeFace uses 128x128 RGB
      const resized = resize(frame, {
        scale: {
          width: 128,
          height: 128,
        },
        pixelFormat: 'rgb',
        dataType: 'float32',
      });

      // 2. Cast and pass buffer to pipeline processFrame hook
      // Frame processor runs asynchronously in a JS worklet thread
      runAsync(pipeline.processFrame, resized, frame.width, frame.height);
    },
    [pipeline.processFrame, resize]
  );

  const handleDismissResult = useCallback(() => {
    pipeline.reset();
    navigation.goBack();
  }, [pipeline, navigation]);

  const handleRetry = useCallback(() => {
    pipeline.reset();
  }, [pipeline]);

  if (initializing || !pipeline.isReady) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading AI Models...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Camera Permission Required</Text>
        <Text style={styles.errorSubText}>
          NHAI FaceAuth requires camera access to verify your identity.
        </Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.actionButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Front Camera Not Found</Text>
        <Text style={styles.errorSubText}>
          Your device must possess a front-facing camera to proceed.
        </Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.actionButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Vision Camera Preview */}
      <Camera
        style={StyleSheet.absoluteFillObject}
        device={device}
        isActive={pipeline.isReady && !pipeline.result}
        frameProcessor={frameProcessor}
        pixelFormat="yuv" // standard fast format on Android
      />

      {/* Dynamic SVG Guide Oval */}
      <FaceOvalOverlay guideState={pipeline.guideState} />

      {/* Top Header Row */}
      <SafeAreaView style={styles.overlayHeader}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === 'enroll' ? 'Supervisor Enrolling' : 'NHAI Authentication'}
        </Text>
        <View style={styles.spacer} />
      </SafeAreaView>

      {/* Bottom Panel (Feedback instruction & Liveness countdown progress) */}
      <View style={styles.bottomControlPanel}>
        <FeedbackText text={pipeline.instructionText} state={pipeline.state} />

        {pipeline.currentChallenge && (
          <ChallengeProgress
            progress={pipeline.challengeProgress}
            challengeType={pipeline.currentChallenge}
            timeoutMs={10000 * (1 - pipeline.challengeProgress)} // approximate timeout remaining
          />
        )}
      </View>

      {/* Full-Screen result alert card overlay */}
      {pipeline.result && (
        <ResultOverlay
          result={pipeline.result}
          onRetry={handleRetry}
          onDismiss={handleDismissResult}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 15,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorSubText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 30,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  overlayHeader: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10, 14, 26, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  spacer: {
    width: 44,
  },
  bottomControlPanel: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(20, 25, 39, 0.82)',
    borderColor: 'rgba(30, 41, 59, 0.8)',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
});

export default CameraScreen;
