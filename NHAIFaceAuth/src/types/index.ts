/**
 * NHAI FaceAuth — Shared Type Definitions
 *
 * Core types used across all modules. Each module also has its own
 * domain-specific types file.
 */

// ─── Face Detection Types ────────────────────────────────────────────────────

/** 2D point in image coordinates */
export interface Point2D {
  x: number;
  y: number;
}

/** 3D point with depth (used by face landmarks) */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** Bounding box in image coordinates */
export interface BoundingBox {
  x: number;      // top-left x
  y: number;      // top-left y
  width: number;
  height: number;
}

/** Face keypoints from BlazeFace */
export interface FaceKeypoints {
  rightEye: Point2D;
  leftEye: Point2D;
  noseTip: Point2D;
  mouthCenter: Point2D;
  rightEarTragion: Point2D;
  leftEarTragion: Point2D;
}

/** Face detection result from BlazeFace */
export interface FaceDetectionResult {
  detected: boolean;
  confidence: number;
  boundingBox: BoundingBox;
  keypoints: FaceKeypoints;
  frameWidth: number;
  frameHeight: number;
  timestamp: number;
}

/** Face validation status */
export interface FaceValidationResult {
  isValid: boolean;
  errors: FaceValidationError[];
  warnings: FaceValidationWarning[];
  guidanceMessage: string;
}

export type FaceValidationError =
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'FACE_TOO_SMALL'
  | 'FACE_TOO_LARGE'
  | 'FACE_OFF_CENTER'
  | 'FACE_INCOMPLETE'
  | 'IMAGE_BLURRY'
  | 'IMAGE_TOO_DARK'
  | 'IMAGE_TOO_BRIGHT';

export type FaceValidationWarning =
  | 'GLASSES_DETECTED'
  | 'MASK_DETECTED'
  | 'PARTIAL_OCCLUSION'
  | 'SUBOPTIMAL_LIGHTING';

// ─── Liveness Detection Types ────────────────────────────────────────────────

/** Types of active liveness challenges */
export type ChallengeType = 'BLINK' | 'SMILE' | 'HEAD_TURN_LEFT' | 'HEAD_TURN_RIGHT' | 'NOD';

/** State of a liveness challenge */
export type ChallengeState =
  | 'IDLE'
  | 'INSTRUCTING'
  | 'WAITING'
  | 'DETECTING'
  | 'COMPLETED'
  | 'TIMEOUT'
  | 'FAILED';

/** Single challenge result */
export interface ChallengeResult {
  type: ChallengeType;
  state: ChallengeState;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  confidence: number;
  passed: boolean;
}

/** Passive anti-spoofing result */
export interface AntiSpoofResult {
  isReal: boolean;
  realScore: number;
  spoofScore: number;
  confidence: number;
  attackType?: 'PRINT' | 'SCREEN' | 'MASK' | 'UNKNOWN';
}

/** Combined liveness result */
export interface LivenessResult {
  passed: boolean;
  activeResults: ChallengeResult[];
  passiveResult: AntiSpoofResult;
  overallConfidence: number;
  challengesAssigned: ChallengeType[];
  timestamp: number;
}

// ─── Face Recognition Types ──────────────────────────────────────────────────

/** Face embedding vector */
export type FaceEmbedding = Float32Array;

/** Match result from face comparison */
export interface MatchResult {
  matched: boolean;
  userId: string | null;
  userName: string | null;
  confidence: number;
  matchLevel: MatchLevel;
  processingTimeMs: number;
}

export type MatchLevel = 'HIGH_CONFIDENCE' | 'LOW_CONFIDENCE' | 'NO_MATCH';

/** Enrolled user record */
export interface EnrolledUser {
  id: string;
  name: string;
  employeeId: string;
  embedding: number[];       // Serialized embedding (JSON-safe)
  enrollmentDate: string;    // ISO 8601 UTC
  lastUpdated: string;       // ISO 8601 UTC
  photoCount: number;
  metadata?: UserMetadata;
}

export interface UserMetadata {
  department?: string;
  role?: string;
  zone?: string;
  enrolledBy?: string;       // Admin ID who enrolled this user
  deviceId?: string;         // Device used for enrollment
}

// ─── Authentication Types ────────────────────────────────────────────────────

/** Full authentication pipeline result */
export interface AuthenticationResult {
  success: boolean;
  userId: string | null;
  userName: string | null;
  matchConfidence: number;
  livenessConfidence: number;
  antiSpoofScore: number;
  challengesUsed: ChallengeType[];
  failureReason: FailureReason | null;
  processingTimeMs: number;
  timestamp: string;           // ISO 8601 UTC
}

export type FailureReason =
  | 'NO_FACE_DETECTED'
  | 'MULTIPLE_FACES'
  | 'LIVENESS_FAILED'
  | 'SPOOF_DETECTED'
  | 'NO_MATCH'
  | 'LOW_CONFIDENCE'
  | 'CHALLENGE_TIMEOUT'
  | 'DEVICE_LOCKED'
  | 'USER_NOT_ENROLLED'
  | 'FACE_QUALITY_POOR'
  | 'CAMERA_ERROR';

/** Authentication pipeline state machine */
export type PipelineState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'DETECTING_FACE'
  | 'VALIDATING_FACE'
  | 'LIVENESS_CHECK'
  | 'RECOGNIZING'
  | 'RESULT_SUCCESS'
  | 'RESULT_FAILURE'
  | 'LOCKED_OUT'
  | 'ERROR';

// ─── Data & Storage Types ────────────────────────────────────────────────────

/** Authentication log entry */
export interface AuthLog {
  id: string;                  // UUID
  timestamp: string;           // ISO 8601 UTC
  userId: string | null;
  latitude: number | null;
  longitude: number | null;
  matchConfidence: number;
  livenessChallenge: string;   // Comma-separated challenge types
  livenessScore: number;
  antiSpoofScore: number;
  result: 'success' | 'failure' | 'retry';
  failureReason: string | null;
  deviceId: string;
  appVersion: string;
  synced: boolean;
  createdAt: string;
}

/** Sync status for the sync manager */
export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  lastSyncResult: 'success' | 'failure' | null;
  failedBatches: number;
}

/** Sync batch metadata */
export interface SyncBatch {
  id: string;
  logIds: string[];
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  attempts: number;
  lastAttempt: string | null;
  checksum: string | null;
  s3Key: string | null;
}

// ─── UI Types ────────────────────────────────────────────────────────────────

/** Face guidance overlay state */
export interface FaceGuideState {
  faceAligned: boolean;
  guidanceColor: 'green' | 'yellow' | 'red';
  message: string;
  showOval: boolean;
}

/** Screen navigation params */
export type RootStackParamList = {
  Home: undefined;
  Camera: { mode: 'authenticate' | 'enroll'; userId?: string };
  Enrollment: undefined;
  AdminDashboard: undefined;
  Settings: undefined;
};

// ─── Utility Types ───────────────────────────────────────────────────────────

/** Result wrapper for operations that can fail */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/** Callback for progress updates */
export type ProgressCallback = (progress: number, message: string) => void;
