/**
 * NHAI FaceAuth — Liveness Detection Module Types
 *
 * Domain-specific types for active challenge detection, passive anti-spoofing,
 * adaptive thresholds, and the challenge session state machine.
 *
 * All landmarks reference the MediaPipe Face Mesh 468-point topology.
 */

import type {
  Point3D,
  ChallengeType,
  ChallengeState,
  ChallengeResult,
  AntiSpoofResult,
} from '../../types';

// ─── Landmark Types ──────────────────────────────────────────────────────────

/**
 * Full set of 468 3D face-mesh landmarks produced by the
 * `face_landmark_192` TFLite model.
 */
export type LandmarkSet = Point3D[];

/** Canonical landmark indices for the right eye (MediaPipe topology). */
export const RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144] as const;

/** Canonical landmark indices for the left eye (MediaPipe topology). */
export const LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380] as const;

/** Mouth corner and midline landmarks used for smile detection. */
export const MOUTH_INDICES = {
  leftCorner: 61,
  rightCorner: 291,
  upperLip: 13,
  lowerLip: 14,
} as const;

/** Nose tip landmark index. */
export const NOSE_TIP_INDEX = 1;

/** Left and right cheek landmarks used to derive face center. */
export const FACE_WIDTH_INDICES = {
  leftCheek: 234,
  rightCheek: 454,
} as const;

/** Eye-contour landmarks used for glasses detection heuristic. */
export const EYE_CONTOUR_INDICES = {
  rightUpper: [159, 160, 161],
  rightLower: [144, 145, 153],
  leftUpper: [386, 385, 384],
  leftLower: [380, 374, 373],
  rightBridge: 168,
  leftBridge: 6,
} as const;

/** Mouth-region landmarks used for mask detection heuristic. */
export const MOUTH_REGION_INDICES = {
  outerUpper: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  outerLower: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  innerUpper: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  innerLower: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
} as const;

/** Forehead / chin landmarks used to estimate face height. */
export const FACE_HEIGHT_INDICES = {
  forehead: 10,
  chin: 152,
} as const;

// ─── Eye State ───────────────────────────────────────────────────────────────

/** Blink state machine states. */
export type BlinkState = 'OPEN' | 'CLOSING' | 'CLOSED' | 'OPENING';

/** Snapshot of both eyes at a single frame. */
export interface EyeState {
  /** Eye Aspect Ratio for the left eye. */
  leftEAR: number;
  /** Eye Aspect Ratio for the right eye. */
  rightEAR: number;
  /** Average EAR across both eyes. */
  averageEAR: number;
  /** Current position in the blink state machine. */
  blinkState: BlinkState;
  /** Timestamp (ms) when the last blink was detected. */
  lastBlinkTimestamp: number;
}

// ─── Mouth State ─────────────────────────────────────────────────────────────

/** Snapshot of the mouth at a single frame. */
export interface MouthState {
  /** Ratio of mouth width to face width (smile metric). */
  mouthWidthRatio: number;
  /** Absolute mouth width in landmark units. */
  mouthWidth: number;
  /** Absolute mouth height in landmark units. */
  mouthHeight: number;
  /** Whether the mouth is currently classified as smiling. */
  isSmiling: boolean;
  /** Continuous timestamp (ms) since smiling started; 0 if not smiling. */
  smileDurationMs: number;
}

// ─── Head Pose ───────────────────────────────────────────────────────────────

/** Simplified head-pose estimate derived from landmark geometry. */
export interface HeadPose {
  /** Normalised horizontal displacement of nose from face center (−1…+1). */
  yaw: number;
  /** Normalised vertical displacement of nose from face center (−1…+1). */
  pitch: number;
  /** Current detected head direction. */
  direction: 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
}

// ─── Nod Detection ───────────────────────────────────────────────────────────

/** Phase within the nod gesture (up→center→down→center). */
export type NodPhase = 'IDLE' | 'UP' | 'CENTER_AFTER_UP' | 'DOWN' | 'CENTER_AFTER_DOWN';

/** Nod tracking state between frames. */
export interface NodState {
  phase: NodPhase;
  /** Timestamp when the current nod attempt started. */
  startTimestamp: number;
  /** Baseline nose-tip Y captured at the first CENTER position. */
  baselineY: number;
  /** Whether a full nod cycle has been detected. */
  completed: boolean;
}

// ─── Challenge Detector Results ──────────────────────────────────────────────

/**
 * Per-frame output from any individual challenge detector.
 *
 * - `detected`: true when the gesture has fully completed.
 * - `confidence`: 0–1 measure of how strongly the gesture is present.
 * - `progress`: 0–1 linear progress towards completion (for UI bar).
 */
export interface ChallengeDetectionResult {
  detected: boolean;
  confidence: number;
  progress: number;
}

// ─── Challenge Session ───────────────────────────────────────────────────────

/** A single challenge within a session. */
export interface AssignedChallenge {
  type: ChallengeType;
  state: ChallengeState;
  /** Timestamp (ms) when the challenge entered INSTRUCTING. */
  startedAt: number;
  /** Timestamp (ms) when the challenge was completed or timed-out. */
  completedAt: number | null;
  /** Final confidence once completed. */
  confidence: number;
  /** Duration in milliseconds from start to completion. */
  durationMs: number | null;
}

/**
 * A complete liveness-check session comprising one or more challenges.
 *
 * Created by `ChallengeManager.startSession()`.
 */
export interface ChallengeSession {
  /** Unique session identifier (UUID v4). */
  sessionId: string;
  /** Ordered list of challenges the user must perform. */
  challenges: AssignedChallenge[];
  /** Index of the challenge currently being evaluated. */
  currentChallengeIndex: number;
  /** Whether glasses were detected at session start. */
  glassesDetected: boolean;
  /** Overall session state. */
  state: 'IN_PROGRESS' | 'PASSED' | 'FAILED';
  /** ISO 8601 UTC timestamp of session creation. */
  createdAt: string;
  /** Final combined confidence (average of per-challenge confidences). */
  overallConfidence: number;
}

// ─── Challenge History ───────────────────────────────────────────────────────

/** Used to track recently issued challenge combinations for anti-replay. */
export interface ChallengeHistoryEntry {
  /** Sorted comma-joined challenge types (e.g. "BLINK,SMILE"). */
  combination: string;
  /** Epoch ms when this combination was last assigned. */
  timestamp: number;
}

// ─── Adaptive Threshold Types ────────────────────────────────────────────────

/** Lighting quality classification. */
export type LightingQuality = 'good' | 'low' | 'harsh';

/** Result of lighting quality assessment. */
export interface LightingAssessment {
  brightness: number;
  contrast: number;
  quality: LightingQuality;
}

// ─── Re-exports for convenience ──────────────────────────────────────────────

export type {
  Point3D,
  ChallengeType,
  ChallengeState,
  ChallengeResult,
  AntiSpoofResult,
};
