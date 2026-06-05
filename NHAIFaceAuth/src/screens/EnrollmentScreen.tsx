/**
 * NHAI FaceAuth — EnrollmentScreen
 *
 * Admin-driven employee onboarding interface.
 * Implements a 3-step workflow:
 *   1. Detail Entry: Forms capturing Name, Employee ID, Department, Zone with validation
 *   2. Photo Capture: Front camera guides capturing 3 to 5 images with automatic quality feedback
 *   3. Review & Save: Review of captured images and user summary with local DB commit
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { DatabaseManager } from '../modules/dataManager/DatabaseManager';
import { EnrollmentManager } from '../modules/faceRecognition/EnrollmentManager';
import { FaceRecognizer } from '../modules/faceRecognition/FaceRecognizer';
import { FaceDetector } from '../modules/faceDetection/FaceDetector';
import { FaceOvalOverlay } from '../components/FaceOvalOverlay';
import { COLORS } from '../../App';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Enrollment'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STEPS = ['DETAILS', 'CAPTURE', 'REVIEW'] as const;

export const EnrollmentScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  // Workflow State
  const [currentStep, setCurrentStep] = useState<typeof STEPS[number]>('DETAILS');

  // Form Fields
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [zone, setZone] = useState('');

  // Camera & ML Manager states
  const [cameraActive, setCameraActive] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [captureFeedback, setCaptureFeedback] = useState('Position your face in the oval');
  const [capturedThumbnails, setCapturedThumbnails] = useState<string[]>([]);
  const [capturedPhotosCount, setCapturedPhotosCount] = useState(0);

  // References
  const faceDetectorRef = useRef<FaceDetector | null>(null);
  const faceRecognizerRef = useRef<FaceRecognizer | null>(null);
  const enrollmentManagerRef = useRef<EnrollmentManager | null>(null);

  const latestDetectionRef = useRef<any>(null);
  const latestFrameDataRef = useRef<Float32Array | null>(null);
  const latestFrameWRef = useRef<number>(0);
  const latestFrameHRef = useRef<number>(0);

  // Device & Plugin
  const device = useCameraDevice('front');
  const { resize } = useResizePlugin();

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const status = await Camera.requestCameraPermission();
        if (!active) return;
        setHasPermission(status === 'granted');

        // Load models
        const detector = new FaceDetector();
        await detector.initialize();
        faceDetectorRef.current = detector;

        const recognizer = new FaceRecognizer();
        await recognizer.initialize();
        faceRecognizerRef.current = recognizer;

        // Fetch existing employee IDs for duplicate prevention
        const db = DatabaseManager.getInstance();
        const users = await db.getAllUsers();
        const userIds = users.map(u => u.employeeId);

        enrollmentManagerRef.current = new EnrollmentManager(recognizer, new Set(userIds));

        if (active) setInitializing(false);
      } catch (err) {
        console.error('Enrollment initialization failed:', err);
        Alert.alert('Initialization Error', 'Could not start the enrollment modules.');
        if (active) navigation.goBack();
      }
    };

    init();

    return () => {
      active = false;
      faceDetectorRef.current?.dispose();
      faceRecognizerRef.current?.dispose();
    };
  }, []);

  // Frame processor logic to track landmarks and bounding boxes
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';

      if (!faceDetectorRef.current) return;

      // Resize frame to BlazeFace format
      const resized = resize(frame, {
        scale: { width: 128, height: 128 },
        pixelFormat: 'rgb',
        dataType: 'float32',
      });

      // Run face detection
      const detection = faceDetectorRef.current.detectFace(resized, frame.width, frame.height);

      if (detection.detected) {
        latestDetectionRef.current = detection;
        latestFrameDataRef.current = resized;
        latestFrameWRef.current = frame.width;
        latestFrameHRef.current = frame.height;
      } else {
        latestDetectionRef.current = null;
      }
    },
    [resize]
  );

  // Handle Form Submission / Step Transitions
  const handleValidateForm = async () => {
    if (!name.trim()) {
      Alert.alert('Invalid Detail', 'Please enter employee name.');
      return;
    }
    if (!employeeId.trim()) {
      Alert.alert('Invalid Detail', 'Please enter employee ID.');
      return;
    }
    if (!department.trim()) {
      Alert.alert('Invalid Detail', 'Please enter department.');
      return;
    }

    try {
      // Start enrollment session
      enrollmentManagerRef.current?.startEnrollment(
        name,
        employeeId,
        'ADMIN-SUPERVISOR', // Default current administrative user
      );

      // Transition to Capture Step
      setCurrentStep('CAPTURE');
      setCameraActive(true);
      setCapturedPhotosCount(0);
      setCapturedThumbnails([]);
      setCaptureFeedback('Position your face in the oval');
    } catch (err: any) {
      Alert.alert('Form Error', err.message || 'Duplicate employee ID detected.');
    }
  };

  // Capture Button Action
  const handleTriggerCapture = async () => {
    if (!enrollmentManagerRef.current) return;

    if (!latestDetectionRef.current || !latestFrameDataRef.current) {
      setCaptureFeedback('No face detected. Look directly into the camera.');
      return;
    }

    setCaptureFeedback('Processing image quality...');

    const result = await enrollmentManagerRef.current.capturePhoto(
      latestFrameDataRef.current,
      latestFrameWRef.current,
      latestFrameHRef.current,
      latestDetectionRef.current.keypoints,
    );

    if (result.success) {
      const currentPhotos = enrollmentManagerRef.current.getProgress().captured;
      setCapturedPhotosCount(currentPhotos);
      setCapturedThumbnails(prev => [...prev, `Photo #${currentPhotos}`]);

      if (result.error) {
        // Warning (e.g. pose similarity)
        setCaptureFeedback(result.error);
        Alert.alert('Pose Warning', result.error);
      } else {
        setCaptureFeedback(`Photo #${currentPhotos} captured successfully.`);
      }

      // Check if session completed 5 photos
      if (currentPhotos >= 5) {
        setCameraActive(false);
        setCurrentStep('REVIEW');
      }
    } else {
      setCaptureFeedback(result.error || 'Capture failed.');
      Alert.alert('Quality Rejected', result.error || 'Face quality suboptimal.');
    }
  };

  // Save Enrollment Record to database
  const handleConfirmSave = async () => {
    if (!enrollmentManagerRef.current) return;

    setInitializing(true);
    try {
      const enrolledUser = await enrollmentManagerRef.current.completeEnrollment();
      
      // Inject supplementary metadata
      enrolledUser.metadata = {
        ...enrolledUser.metadata,
        department: department.trim(),
        zone: zone.trim() || undefined,
      };

      const db = DatabaseManager.getInstance();
      await db.insertUser(enrolledUser);

      Alert.alert('Enrollment Complete', `${name} successfully added to database.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Database Error', err.message || 'Could not save enrollment.');
      setInitializing(false);
    }
  };

  const handleCancelEnrollment = () => {
    enrollmentManagerRef.current?.cancelEnrollment();
    navigation.goBack();
  };

  if (initializing) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Initializing modules...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Step Progress Tracker */}
      <View style={styles.stepsHeader}>
        {STEPS.map((step, idx) => {
          const isActive = step === currentStep;
          const isDone = STEPS.indexOf(currentStep) > idx;
          return (
            <View key={step} style={styles.stepIndicatorWrapper}>
              <View style={[
                styles.stepBadge,
                isActive && styles.stepBadgeActive,
                isDone && styles.stepBadgeDone
              ]}>
                <Text style={styles.stepBadgeText}>{idx + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                {step}
              </Text>
            </View>
          );
        })}
      </View>

      {/* STEP 1: Details Entry */}
      {currentStep === 'DETAILS' && (
        <ScrollView contentContainerStyle={styles.formScroll}>
          <Text style={styles.formHeader}>Worker Details</Text>
          <Text style={styles.formSubHeader}>Input demographics before biometric capturing.</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ramesh Kumar"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Employee ID (Unique)</Text>
            <TextInput
              style={styles.textInput}
              value={employeeId}
              onChangeText={setEmployeeId}
              placeholder="e.g. NHAI-2026-894"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Department</Text>
            <TextInput
              style={styles.textInput}
              value={department}
              onChangeText={setDepartment}
              placeholder="e.g. Site Maintenance"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Zone / Location Office (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={zone}
              onChangeText={setZone}
              placeholder="e.g. Toll Plaza NH-44"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.submitBtn} onPress={handleValidateForm}>
              <Text style={styles.submitBtnText}>Proceed to Capture</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelEnrollment}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* STEP 2: Photo Capture */}
      {currentStep === 'CAPTURE' && cameraActive && device && (
        <View style={styles.cameraContainer}>
          <Camera
            style={StyleSheet.absoluteFillObject}
            device={device}
            isActive={cameraActive}
            frameProcessor={frameProcessor}
            pixelFormat="yuv"
          />

          <FaceOvalOverlay
            guideState={{
              faceAligned: !!latestDetectionRef.current,
              guidanceColor: latestDetectionRef.current ? 'green' : 'red',
              message: latestDetectionRef.current ? 'Face Aligned' : 'Align Face',
              showOval: true,
            }}
          />

          {/* Feedback Strip */}
          <View style={styles.captureFeedbackStrip}>
            <Text style={styles.feedbackStripText}>{captureFeedback}</Text>
          </View>

          {/* Bottom capturing bar */}
          <View style={styles.captureControlPanel}>
            <View style={styles.thumbnailsRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.thumbnailSlot,
                    i < capturedPhotosCount && styles.thumbnailSlotFilled,
                  ]}
                >
                  <Text style={styles.slotText}>{i < capturedPhotosCount ? '✓' : i + 1}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.captureBtn} onPress={handleTriggerCapture}>
              <Text style={styles.captureBtnText}>CAPTURE PHOTO</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.abortBtn}
              onPress={() => {
                setCameraActive(false);
                setCurrentStep('DETAILS');
              }}
            >
              <Text style={styles.abortBtnText}>← Back to Forms</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* STEP 3: Review & Complete */}
      {currentStep === 'REVIEW' && (
        <View style={styles.reviewContainer}>
          <ScrollView contentContainerStyle={styles.reviewContent}>
            <Text style={styles.formHeader}>Enrollment Review</Text>
            <Text style={styles.formSubHeader}>Confirm biographical details before database registration.</Text>

            <View style={styles.reviewCard}>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Worker Name</Text>
                <Text style={styles.reviewVal}>{name}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Employee ID</Text>
                <Text style={styles.reviewVal}>{employeeId}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Department</Text>
                <Text style={styles.reviewVal}>{department}</Text>
              </View>
              {zone ? (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>Zone Office</Text>
                  <Text style={styles.reviewVal}>{zone}</Text>
                </View>
              ) : null}
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Biometrics Status</Text>
                <Text style={[styles.reviewVal, { color: COLORS.accent }]}>
                  ✓ 5 Photos Synced
                </Text>
              </View>
            </View>

            <Text style={styles.disclaimerText}>
              NHAI FaceAuth complies with data protection guidelines. Biometric files are processed fully on-device and stored inside the secure encrypted database module.
            </Text>
          </ScrollView>

          <View style={styles.reviewActions}>
            <TouchableOpacity style={styles.submitBtn} onPress={handleConfirmSave}>
              <Text style={styles.submitBtnText}>Complete & Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setCurrentStep('CAPTURE');
                setCameraActive(true);
              }}
            >
              <Text style={styles.cancelBtnText}>Recapture Photos</Text>
            </TouchableOpacity>
          </View>
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
  centeredContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    marginTop: 12,
  },
  stepsHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    justifyContent: 'space-around',
  },
  stepIndicatorWrapper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeActive: {
    backgroundColor: COLORS.primary,
  },
  stepBadgeDone: {
    backgroundColor: COLORS.accent,
  },
  stepBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: COLORS.text,
    fontWeight: '800',
  },
  formScroll: {
    padding: 24,
  },
  formHeader: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  formSubHeader: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 25,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    color: COLORS.text,
    fontSize: 15,
    paddingHorizontal: 16,
    height: 52,
  },
  formActions: {
    marginTop: 30,
    gap: 12,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    borderColor: COLORS.border,
    borderWidth: 1,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  captureFeedbackStrip: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(10, 14, 26, 0.75)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  feedbackStripText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  captureControlPanel: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(20, 25, 39, 0.85)',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  thumbnailsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  thumbnailSlot: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailSlotFilled: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  slotText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  captureBtn: {
    backgroundColor: COLORS.primary,
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  captureBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  abortBtn: {
    paddingVertical: 6,
  },
  abortBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  reviewContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  reviewContent: {
    flexGrow: 1,
  },
  reviewCard: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    marginBottom: 24,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30, 41, 59, 0.4)',
    paddingBottom: 12,
  },
  reviewLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  reviewVal: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '700',
  },
  disclaimerText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },
  reviewActions: {
    gap: 12,
  },
});

export default EnrollmentScreen;
