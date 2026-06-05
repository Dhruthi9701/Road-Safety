/**
 * NHAI FaceAuth — Authentication Pipeline Hook
 *
 * Orchestrates the complete authentication flow:
 * Camera Frame → Face Detection → Face Validation →
 * Liveness Check (Active + Passive) → Face Recognition → Log Result
 *
 * State machine: IDLE → DETECTING_FACE → VALIDATING_FACE →
 *   LIVENESS_CHECK → RECOGNIZING → RESULT_SUCCESS/RESULT_FAILURE
 */
import {useState, useCallback, useRef, useEffect} from 'react';
import type {
  PipelineState,
  AuthenticationResult,
  FaceDetectionResult,
  FaceValidationResult,
  LivenessResult,
  MatchResult,
  ChallengeType,
  FailureReason,
  FaceGuideState,
  EnrolledUser,
} from '../types';
import {FaceDetector} from '../modules/faceDetection/FaceDetector';
import {FaceValidator} from '../modules/faceDetection/FaceValidator';
import {ChallengeManager} from '../modules/livenessDetection/ChallengeManager';
import {PassiveAntiSpoofDetector} from '../modules/livenessDetection/PassiveAntiSpoof';
import {AdaptiveThreshold} from '../modules/livenessDetection/AdaptiveThreshold';
import {FaceRecognizer} from '../modules/faceRecognition/FaceRecognizer';
import {FacePreprocessor} from '../modules/faceRecognition/FacePreprocessor';
import {FaceMatcher} from '../modules/faceRecognition/FaceMatcher';
import {DatabaseManager} from '../modules/dataManager/DatabaseManager';
import {LockoutManager} from '../modules/dataManager/LockoutManager';
import {generateUUID, utcNow, createLogger} from '../utils/helpers';
import {APP_VERSION} from '../constants/config';
import DeviceInfo from 'react-native-device-info';
import Geolocation from 'react-native-geolocation-service';
import {Platform, PermissionsAndroid} from 'react-native';

const log = createLogger('Pipeline');

interface PipelineHookResult {
  /** Current pipeline state */
  state: PipelineState;
  /** Face guide overlay state */
  guideState: FaceGuideState;
  /** Current instruction text for the user */
  instructionText: string;
  /** Liveness challenge progress (0-1) */
  challengeProgress: number;
  /** Current challenge type being performed */
  currentChallenge: ChallengeType | null;
  /** Final authentication result */
  result: AuthenticationResult | null;
  /** Whether the device is locked out */
  isLockedOut: boolean;
  /** Remaining lockout time in ms */
  lockoutRemainingMs: number;
  /** Initialize all ML models */
  initialize: () => Promise<void>;
  /** Process a camera frame through the pipeline */
  processFrame: (
    frameData: Float32Array,
    width: number,
    height: number,
  ) => Promise<void>;
  /** Reset the pipeline to IDLE state */
  reset: () => void;
  /** Clean up ML model resources */
  dispose: () => void;
  /** Whether models are loaded */
  isReady: boolean;
}

/**
 * Hook that manages the complete face authentication pipeline.
 *
 * Usage:
 * ```tsx
 * const {state, guideState, processFrame, initialize, reset} = useAuthenticationPipeline();
 *
 * useEffect(() => { initialize(); }, []);
 *
 * // In frame processor:
 * processFrame(frameData, width, height);
 * ```
 */
export function useAuthenticationPipeline(): PipelineHookResult {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [state, setState] = useState<PipelineState>('IDLE');
  const [guideState, setGuideState] = useState<FaceGuideState>({
    faceAligned: false,
    guidanceColor: 'red',
    message: 'Position your face in the oval',
    showOval: true,
  });
  const [instructionText, setInstructionText] = useState('');
  const [challengeProgress, setChallengeProgress] = useState(0);
  const [currentChallenge, setCurrentChallenge] = useState<ChallengeType | null>(null);
  const [result, setResult] = useState<AuthenticationResult | null>(null);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutRemainingMs, setLockoutRemainingMs] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // ─── Refs for ML models (avoid re-renders) ─────────────────────────────────
  const faceDetector = useRef<FaceDetector | null>(null);
  const challengeManager = useRef<ChallengeManager | null>(null);
  const antiSpoofDetector = useRef<PassiveAntiSpoofDetector | null>(null);
  const faceRecognizer = useRef<FaceRecognizer | null>(null);
  const lockoutManager = useRef<LockoutManager | null>(null);

  const pipelineStartTime = useRef<number>(0);
  const deviceId = useRef<string>('');
  const stateRef = useRef<PipelineState>('IDLE');
  const faceStabilityCounter = useRef<number>(0);
  const lastDetection = useRef<FaceDetectionResult | null>(null);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ─── Initialize ─────────────────────────────────────────────────────────────

  const initialize = useCallback(async () => {
    try {
      log.info('Initializing authentication pipeline...');

      // Get device ID
      deviceId.current = await DeviceInfo.getUniqueId();

      // Initialize face detector
      faceDetector.current = new FaceDetector();
      await faceDetector.current.initialize();
      log.info('Face detector initialized');

      // Initialize anti-spoofing model
      antiSpoofDetector.current = new PassiveAntiSpoofDetector();
      await antiSpoofDetector.current.initialize();
      log.info('Anti-spoof detector initialized');

      // Initialize face recognizer
      faceRecognizer.current = new FaceRecognizer();
      await faceRecognizer.current.initialize();
      log.info('Face recognizer initialized');

      // Initialize challenge manager
      challengeManager.current = new ChallengeManager();

      // Initialize lockout manager
      lockoutManager.current = new LockoutManager();

      setIsReady(true);
      log.info('Pipeline fully initialized');
    } catch (error) {
      log.error('Pipeline initialization failed:', error);
      setState('ERROR');
      throw error;
    }
  }, []);

  // ─── Process Frame ──────────────────────────────────────────────────────────

  const processFrame = useCallback(
    async (
      frameData: Float32Array,
      width: number,
      height: number,
    ) => {
      if (!isReady || stateRef.current === 'RESULT_SUCCESS' || stateRef.current === 'RESULT_FAILURE') {
        return;
      }

      try {
        // Check lockout first
        if (lockoutManager.current) {
          const lockoutStatus = await lockoutManager.current.isLockedOut(
            deviceId.current,
          );
          if (lockoutStatus.locked) {
            setIsLockedOut(true);
            setLockoutRemainingMs(lockoutStatus.remainingMs);
            setState('LOCKED_OUT');
            setInstructionText(
              `Device locked. Try again in ${Math.ceil(lockoutStatus.remainingMs / 60000)} minutes`,
            );
            return;
          }
          setIsLockedOut(false);
        }

        // ── Stage 1: Face Detection ─────────────────────────────────────────
        if (
          stateRef.current === 'IDLE' ||
          stateRef.current === 'DETECTING_FACE' ||
          stateRef.current === 'VALIDATING_FACE'
        ) {
          setState('DETECTING_FACE');

          if (!faceDetector.current) return;

          const detection = faceDetector.current.detectFace(
            frameData,
            width,
            height,
          );

          if (!detection.detected) {
            setGuideState({
              faceAligned: false,
              guidanceColor: 'red',
              message: 'No face detected — look at the camera',
              showOval: true,
            });
            setInstructionText('Position your face in the oval');
            faceStabilityCounter.current = 0;
            return;
          }

          // ── Stage 2: Face Validation ────────────────────────────────────────
          setState('VALIDATING_FACE');

          const validation = FaceValidator.validate(detection, width, height);

          if (!validation.isValid) {
            const guidanceMsg = validation.guidanceMessage;
            setGuideState({
              faceAligned: false,
              guidanceColor: 'yellow',
              message: guidanceMsg,
              showOval: true,
            });
            setInstructionText(guidanceMsg);
            faceStabilityCounter.current = 0;
            return;
          }

          // Face is valid — check stability (3 consecutive valid frames)
          faceStabilityCounter.current++;
          lastDetection.current = detection;

          if (faceStabilityCounter.current < 3) {
            setGuideState({
              faceAligned: true,
              guidanceColor: 'green',
              message: 'Hold still...',
              showOval: true,
            });
            setInstructionText('Hold still...');
            return;
          }

          // Face stable — move to liveness check
          setGuideState({
            faceAligned: true,
            guidanceColor: 'green',
            message: 'Face detected — starting liveness check',
            showOval: true,
          });

          // Start liveness session if not already started
          if (stateRef.current !== 'LIVENESS_CHECK') {
            pipelineStartTime.current = Date.now();

            // Detect glasses for adaptive thresholds
            const landmarks = detection.keypoints;
            // Simple glasses detection from keypoint depth
            const glassesDetected = false; // Will be set from face mesh

            challengeManager.current?.startSession(glassesDetected);
            setState('LIVENESS_CHECK');
          }
        }

        // ── Stage 3: Liveness Check ───────────────────────────────────────────
        if (stateRef.current === 'LIVENESS_CHECK') {
          if (!challengeManager.current || !antiSpoofDetector.current) return;

          // Get current challenge instruction
          const instruction = challengeManager.current.getInstructionText();
          setInstructionText(instruction);
          setCurrentChallenge(
            challengeManager.current.getCurrentChallengeType(),
          );

          // Process active challenge with landmark data
          // Note: In production, we'd use face mesh landmarks here.
          // For the pipeline, we simulate with keypoint-based detection
          const challengeResult = challengeManager.current.processFrameWithKeypoints(
            lastDetection.current!.keypoints,
            frameData,
            width,
            height,
          );

          setChallengeProgress(challengeManager.current.getProgress());

          if (!challengeResult.allCompleted) {
            return; // Still working on challenges
          }

          // Run passive anti-spoofing
          const crop = FacePreprocessor.cropFace(
            frameData,
            width,
            height,
            lastDetection.current!.boundingBox,
            0.2,
          );

          const antiSpoofResult = antiSpoofDetector.current.detect(
            crop.pixels,
            crop.width,
            crop.height,
          );

          if (!antiSpoofResult.isReal) {
            // Spoof detected
            await handleFailure('SPOOF_DETECTED', challengeResult.challenges, antiSpoofResult.realScore);
            return;
          }

          if (!challengeResult.allPassed) {
            await handleFailure('LIVENESS_FAILED', challengeResult.challenges, antiSpoofResult.realScore);
            return;
          }

          // Liveness passed — move to recognition
          setState('RECOGNIZING');
          setInstructionText('Verifying identity...');
        }

        // ── Stage 4: Face Recognition ─────────────────────────────────────────
        if (stateRef.current === 'RECOGNIZING') {
          if (!faceRecognizer.current || !lastDetection.current) return;

          // Preprocess face for recognition
          const alignedFace = FacePreprocessor.alignFace(
            frameData,
            width,
            height,
            lastDetection.current.keypoints,
          );

          // Generate embedding
          const embedding = faceRecognizer.current.generateEmbedding(alignedFace);

          // Get enrolled users from database
          const db = DatabaseManager.getInstance();
          const enrolledUsers = await db.getAllUsers();

          if (enrolledUsers.length === 0) {
            await handleFailure('USER_NOT_ENROLLED', [], 0);
            return;
          }

          // Match against database
          const matchResult = FaceMatcher.matchAgainstDatabase(
            embedding,
            enrolledUsers,
          );

          const processingTime = Date.now() - pipelineStartTime.current;

          if (matchResult.matchLevel === 'HIGH_CONFIDENCE') {
            // Success!
            await handleSuccess(matchResult, processingTime);
          } else if (matchResult.matchLevel === 'LOW_CONFIDENCE') {
            await handleFailure('LOW_CONFIDENCE', [], matchResult.confidence);
          } else {
            await handleFailure('NO_MATCH', [], matchResult.confidence);
          }
        }
      } catch (error) {
        log.error('Frame processing error:', error);
        setState('ERROR');
        setInstructionText('An error occurred. Please try again.');
      }
    },
    [isReady],
  );

  // ─── Handle Success ─────────────────────────────────────────────────────────

  const handleSuccess = useCallback(
    async (matchResult: MatchResult, processingTimeMs: number) => {
      log.info(
        `Authentication SUCCESS: ${matchResult.userName} (${(matchResult.confidence * 100).toFixed(1)}%)`,
      );

      setState('RESULT_SUCCESS');
      setInstructionText(`Welcome, ${matchResult.userName}!`);
      setGuideState({
        faceAligned: true,
        guidanceColor: 'green',
        message: 'Authentication successful',
        showOval: false,
      });

      const authResult: AuthenticationResult = {
        success: true,
        userId: matchResult.userId,
        userName: matchResult.userName,
        matchConfidence: matchResult.confidence,
        livenessConfidence: 1.0,
        antiSpoofScore: 1.0,
        challengesUsed: challengeManager.current?.getCompletedChallenges() || [],
        failureReason: null,
        processingTimeMs,
        timestamp: utcNow(),
      };

      setResult(authResult);

      // Reset failed attempts on success
      if (lockoutManager.current) {
        await lockoutManager.current.resetAttempts(deviceId.current);
      }

      // Log to database
      await logAuthResult(authResult);
    },
    [],
  );

  // ─── Handle Failure ─────────────────────────────────────────────────────────

  const handleFailure = useCallback(
    async (
      reason: FailureReason,
      challenges: ChallengeType[],
      confidence: number,
    ) => {
      log.warn(`Authentication FAILED: ${reason}`);

      setState('RESULT_FAILURE');

      const failureMessages: Record<FailureReason, string> = {
        NO_FACE_DETECTED: 'No face detected. Please try again.',
        MULTIPLE_FACES: 'Multiple faces detected. Only one person allowed.',
        LIVENESS_FAILED: 'Liveness check failed. Please try again.',
        SPOOF_DETECTED: 'Spoofing detected. Access denied.',
        NO_MATCH: 'Face not recognized. You may not be enrolled.',
        LOW_CONFIDENCE: 'Low confidence match. Please try again.',
        CHALLENGE_TIMEOUT: 'Challenge timed out. Please try again.',
        DEVICE_LOCKED: 'Device is locked due to multiple failed attempts.',
        USER_NOT_ENROLLED: 'No users enrolled on this device.',
        FACE_QUALITY_POOR: 'Face quality too low. Adjust position/lighting.',
        CAMERA_ERROR: 'Camera error. Please restart.',
      };

      setInstructionText(failureMessages[reason] || 'Authentication failed.');

      const authResult: AuthenticationResult = {
        success: false,
        userId: null,
        userName: null,
        matchConfidence: confidence,
        livenessConfidence: 0,
        antiSpoofScore: 0,
        challengesUsed: challenges,
        failureReason: reason,
        processingTimeMs: Date.now() - pipelineStartTime.current,
        timestamp: utcNow(),
      };

      setResult(authResult);

      // Record failed attempt for lockout
      if (lockoutManager.current) {
        await lockoutManager.current.recordFailedAttempt(deviceId.current);
      }

      // Log to database
      await logAuthResult(authResult);
    },
    [],
  );

  // ─── Log Result ─────────────────────────────────────────────────────────────

  const logAuthResult = useCallback(
    async (authResult: AuthenticationResult) => {
      try {
        const db = DatabaseManager.getInstance();

        // Get GPS coordinates if available
        let latitude: number | null = null;
        let longitude: number | null = null;

        try {
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            );
            if (granted) {
              const position = await new Promise<{
                coords: {latitude: number; longitude: number};
              }>((resolve, reject) => {
                Geolocation.getCurrentPosition(resolve, reject, {
                  timeout: 2000,
                  enableHighAccuracy: false,
                });
              });
              latitude = position.coords.latitude;
              longitude = position.coords.longitude;
            }
          } else {
            const position = await new Promise<{
              coords: {latitude: number; longitude: number};
            }>((resolve, reject) => {
              Geolocation.getCurrentPosition(resolve, reject, {
                timeout: 2000,
                enableHighAccuracy: false,
              });
            });
            latitude = position.coords.latitude;
            longitude = position.coords.longitude;
          }
        } catch {
          // GPS not available — that's OK
        }

        await db.insertAuthLog({
          id: generateUUID(),
          timestamp: authResult.timestamp,
          userId: authResult.userId,
          latitude,
          longitude,
          matchConfidence: authResult.matchConfidence,
          livenessChallenge: authResult.challengesUsed.join(','),
          livenessScore: authResult.livenessConfidence,
          antiSpoofScore: authResult.antiSpoofScore,
          result: authResult.success ? 'success' : 'failure',
          failureReason: authResult.failureReason,
          deviceId: deviceId.current,
          appVersion: APP_VERSION,
          synced: false,
          createdAt: utcNow(),
        });

        log.info('Auth result logged to database');
      } catch (error) {
        log.error('Failed to log auth result:', error);
      }
    },
    [],
  );

  // ─── Reset ──────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setState('IDLE');
    setGuideState({
      faceAligned: false,
      guidanceColor: 'red',
      message: 'Position your face in the oval',
      showOval: true,
    });
    setInstructionText('');
    setChallengeProgress(0);
    setCurrentChallenge(null);
    setResult(null);
    faceStabilityCounter.current = 0;
    lastDetection.current = null;
    challengeManager.current?.reset();
    log.info('Pipeline reset');
  }, []);

  // ─── Dispose ────────────────────────────────────────────────────────────────

  const dispose = useCallback(() => {
    faceDetector.current?.dispose();
    antiSpoofDetector.current?.dispose();
    faceRecognizer.current?.dispose();
    faceDetector.current = null;
    antiSpoofDetector.current = null;
    faceRecognizer.current = null;
    challengeManager.current = null;
    setIsReady(false);
    log.info('Pipeline disposed');
  }, []);

  return {
    state,
    guideState,
    instructionText,
    challengeProgress,
    currentChallenge,
    result,
    isLockedOut,
    lockoutRemainingMs,
    initialize,
    processFrame,
    reset,
    dispose,
    isReady,
  };
}
