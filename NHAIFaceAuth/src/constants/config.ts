/**
 * NHAI FaceAuth — Application Constants
 *
 * Central configuration for all thresholds, timeouts, and settings.
 * These values are tuned for mid-range Android 8.0+ / iOS 12+ devices
 * with diverse Indian demographic conditions.
 */

// ─── Face Detection ──────────────────────────────────────────────────────────

/** Minimum face size as fraction of frame width (reject if face too far) */
export const MIN_FACE_SIZE_RATIO = 0.2;

/** Maximum face size as fraction of frame width (reject if face too close) */
export const MAX_FACE_SIZE_RATIO = 0.8;

/** Minimum confidence score for BlazeFace detection */
export const FACE_DETECTION_CONFIDENCE = 0.75;

/** Laplacian variance threshold for blur detection (lower = blurry) */
export const BLUR_THRESHOLD = 100;

/** Maximum number of faces allowed in frame (must be exactly 1) */
export const MAX_FACES_ALLOWED = 1;

/** Face must be within this fraction of center for alignment */
export const FACE_CENTER_TOLERANCE = 0.15;

/** Minimum number of keypoints that must be visible */
export const MIN_VISIBLE_KEYPOINTS = 5;

// ─── Liveness Detection ──────────────────────────────────────────────────────

/** Eye Aspect Ratio threshold for blink detection (normal) */
export const EAR_BLINK_THRESHOLD = 0.21;

/** Eye Aspect Ratio threshold for blink detection (glasses) */
export const EAR_BLINK_THRESHOLD_GLASSES = 0.18;

/** Mouth Aspect Ratio threshold for smile detection */
export const MAR_SMILE_THRESHOLD = 0.45;

/** Head turn displacement threshold (fraction of face width) */
export const HEAD_TURN_THRESHOLD = 0.15;

/** Nod detection vertical displacement threshold (fraction of face height) */
export const NOD_THRESHOLD = 0.08;

/** Maximum time allowed per liveness challenge (milliseconds) */
export const CHALLENGE_TIMEOUT_MS = 10000;

/** Minimum number of challenges per session */
export const MIN_CHALLENGES_PER_SESSION = 1;

/** Maximum number of challenges per session */
export const MAX_CHALLENGES_PER_SESSION = 2;

/** Passive anti-spoofing confidence threshold */
export const ANTISPOOF_THRESHOLD = 0.80;

/** Minimum brightness for valid frame (0-255 scale) */
export const MIN_BRIGHTNESS = 40;

/** Maximum brightness for valid frame (0-255 scale) */
export const MAX_BRIGHTNESS = 240;

/** Minimum time between same challenge sequences (ms) */
export const CHALLENGE_COOLDOWN_MS = 300000; // 5 minutes

// ─── Face Recognition ────────────────────────────────────────────────────────

/** Cosine similarity threshold for positive match */
export const MATCH_THRESHOLD = 0.85;

/** Low confidence match threshold (prompt retry) */
export const LOW_CONFIDENCE_THRESHOLD = 0.70;

/** Number of enrollment photos required */
export const ENROLLMENT_PHOTO_COUNT = 5;

/** Minimum enrollment photos to accept */
export const MIN_ENROLLMENT_PHOTOS = 3;

/** Face embedding dimension (MobileFaceNet output) */
export const EMBEDDING_DIMENSION = 128;

/** Re-enrollment period in days */
export const RE_ENROLLMENT_DAYS = 180;

/** Maximum enrolled users per device (zone-based) */
export const MAX_ENROLLED_USERS = 500;

// ─── Security & Lockout ──────────────────────────────────────────────────────

/** Number of failed attempts before first lockout */
export const LOCKOUT_THRESHOLD_1 = 3;

/** Lockout duration after first threshold (ms) */
export const LOCKOUT_DURATION_1_MS = 300000; // 5 minutes

/** Number of failed attempts before second lockout */
export const LOCKOUT_THRESHOLD_2 = 5;

/** Lockout duration after second threshold (ms) */
export const LOCKOUT_DURATION_2_MS = 900000; // 15 minutes

/** Number of failed attempts before maximum lockout */
export const LOCKOUT_THRESHOLD_3 = 10;

/** Lockout duration after third threshold (ms) */
export const LOCKOUT_DURATION_3_MS = 3600000; // 1 hour

// ─── Data & Storage ──────────────────────────────────────────────────────────

/** Database file name */
export const DB_NAME = 'nhai_faceauth.db';

/** Keychain service name for encryption key */
export const KEYCHAIN_SERVICE = 'com.nhai.faceauth.dbkey';

/** Storage warning threshold (bytes) */
export const STORAGE_WARNING_BYTES = 50 * 1024 * 1024; // 50 MB

/** Storage critical threshold (bytes) */
export const STORAGE_CRITICAL_BYTES = 20 * 1024 * 1024; // 20 MB

/** Maximum auth logs to retain locally after sync */
export const MAX_LOCAL_SYNCED_DAYS = 7;

// ─── Sync & Upload ───────────────────────────────────────────────────────────

/** Batch size for sync uploads */
export const SYNC_BATCH_SIZE = 100;

/** Maximum retry attempts per batch */
export const SYNC_MAX_RETRIES = 5;

/** Base retry delay (ms) — exponential backoff */
export const SYNC_RETRY_BASE_MS = 1000;

/** Maximum retry delay (ms) */
export const SYNC_RETRY_MAX_MS = 60000;

/** S3 bucket name (configurable via env) */
export const S3_BUCKET = 'nhai-faceauth-logs';

/** S3 region (configurable via env) */
export const S3_REGION = 'ap-south-1'; // Mumbai

/** S3 key prefix */
export const S3_KEY_PREFIX = 'nhai-face-auth';

/** Purge batch size (records per transaction) */
export const PURGE_BATCH_SIZE = 500;

// ─── Camera & UI ─────────────────────────────────────────────────────────────

/** Target FPS for frame processing (lower = save battery) */
export const TARGET_PROCESSING_FPS = 10;

/** Camera resolution preset */
export const CAMERA_RESOLUTION = 'medium' as const;

/** Face oval guide aspect ratio (width / height) */
export const FACE_OVAL_ASPECT_RATIO = 0.75;

/** Animation duration for UI transitions (ms) */
export const UI_ANIMATION_DURATION = 300;

// ─── TFLite Model Paths ──────────────────────────────────────────────────────

/** BlazeFace short-range model (face detection) */
export const MODEL_FACE_DETECTION = require('../../assets/models/face_detection_short_range.tflite');

/** MediaPipe Face Mesh model (468 landmarks) */
export const MODEL_FACE_LANDMARK = require('../../assets/models/face_landmark_192.tflite');

/** MobileNetV2 anti-spoofing model (passive liveness) */
export const MODEL_ANTISPOOF = require('../../assets/models/antispoof_mobilenetv2_int8.tflite');

/** MobileFaceNet model (face embedding) */
export const MODEL_FACE_RECOGNITION = require('../../assets/models/mobilefacenet_int8.tflite');

// ─── App Info ────────────────────────────────────────────────────────────────

export const APP_VERSION = '1.0.0';
export const APP_NAME = 'NHAI FaceAuth';
