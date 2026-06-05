/**
 * NHAI FaceAuth — Face Recognition Module Types
 *
 * Domain-specific types for the face recognition pipeline:
 * alignment transforms, enrollment sessions, and embedding
 * comparison result details.
 *
 * @module faceRecognition/types
 */

import type { FaceEmbedding, FaceKeypoints, MatchLevel } from '../../types';

// ─── Alignment Types ─────────────────────────────────────────────────────────

/**
 * 2×3 affine transformation matrix parameters used for face alignment.
 *
 * The affine warp is applied as:
 *   x' = a * x + b * y + tx
 *   y' = c * x + d * y + ty
 *
 * These six parameters fully describe rotation, scaling, shearing,
 * and translation in 2D.
 */
export interface AlignmentTransform {
  /** Scale + rotation component (row 0, col 0) */
  a: number;
  /** Shear + rotation component (row 0, col 1) */
  b: number;
  /** Horizontal translation */
  tx: number;
  /** Shear + rotation component (row 1, col 0) */
  c: number;
  /** Scale + rotation component (row 1, col 1) */
  d: number;
  /** Vertical translation */
  ty: number;
}

/**
 * Standard 5-point alignment target coordinates for a 112×112 output image.
 * These are empirically derived from the MobileFaceNet training pipeline.
 */
export interface AlignmentTarget {
  /** Left eye target position [x, y] */
  leftEye: [number, number];
  /** Right eye target position [x, y] */
  rightEye: [number, number];
  /** Nose tip target position [x, y] */
  nose: [number, number];
  /** Left mouth corner target position [x, y] */
  leftMouth: [number, number];
  /** Right mouth corner target position [x, y] */
  rightMouth: [number, number];
}

// ─── Enrollment Types ────────────────────────────────────────────────────────

/** Lifecycle state of an enrollment session */
export type EnrollmentState =
  | 'IDLE'
  | 'IN_PROGRESS'
  | 'READY_TO_COMPLETE'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * A single captured photo within an enrollment session.
 * Contains the raw aligned face pixels and the derived embedding.
 */
export interface EnrollmentPhoto {
  /** Zero-based index of this capture in the session */
  index: number;
  /** 112×112×3 aligned face pixel data */
  alignedPixels: Float32Array;
  /** 128-D L2-normalized face embedding */
  embedding: FaceEmbedding;
  /** Keypoints used for alignment (for audit trail) */
  keypoints: FaceKeypoints;
  /** UTC ISO 8601 timestamp of capture */
  capturedAt: string;
  /** Quality assessment label */
  quality: EnrollmentPhotoQuality;
}

/** Quality assessment for a single enrollment photo */
export type EnrollmentPhotoQuality = 'GOOD' | 'ACCEPTABLE' | 'POOR';

/**
 * Tracks the complete enrollment session state.
 *
 * The session accumulates 3-5 photos, generates per-photo embeddings,
 * and produces an averaged (centroid) embedding on completion.
 */
export interface EnrollmentSession {
  /** Unique session identifier (UUID v4) */
  sessionId: string;
  /** Display name of the person being enrolled */
  name: string;
  /** Unique employee / staff identifier */
  employeeId: string;
  /** Admin user ID who initiated the enrollment */
  adminId: string;
  /** Current session lifecycle state */
  state: EnrollmentState;
  /** Photos captured so far */
  photos: EnrollmentPhoto[];
  /** Per-photo embedding vectors (parallel with `photos`) */
  embeddings: FaceEmbedding[];
  /** UTC ISO 8601 time the session was started */
  startedAt: string;
  /** UTC ISO 8601 time the session completed (if applicable) */
  completedAt: string | null;
  /** Total required photos (configurable, default 5) */
  requiredPhotos: number;
  /** Minimum photos to allow completion (configurable, default 3) */
  minimumPhotos: number;
}

// ─── Embedding Comparison Types ──────────────────────────────────────────────

/**
 * Detailed result of comparing two face embeddings.
 * Provides the raw similarity score plus interpretation metadata.
 */
export interface EmbeddingComparison {
  /** Cosine similarity in [−1, 1] (higher = more similar) */
  similarity: number;
  /** Thresholded match decision */
  matched: boolean;
  /** Confidence classification tier */
  matchLevel: MatchLevel;
  /** Euclidean (L2) distance between the two embeddings */
  distance: number;
  /** Time taken for comparison in milliseconds */
  comparisonTimeMs: number;
}

/**
 * Candidate result when matching against a database of enrolled users.
 * Used internally by FaceMatcher to rank and return the top match.
 */
export interface MatchCandidate {
  /** Enrolled user identifier */
  userId: string;
  /** Enrolled user display name */
  userName: string;
  /** Cosine similarity score */
  similarity: number;
  /** Thresholded match level */
  matchLevel: MatchLevel;
}

// ─── Preprocessing Types ─────────────────────────────────────────────────────

/**
 * Result of a face-crop operation.
 * Contains the cropped pixel buffer and its dimensions.
 */
export interface CropResult {
  /** Cropped RGB pixel data (row-major, channels interleaved) */
  pixels: Float32Array;
  /** Width of the cropped image in pixels */
  width: number;
  /** Height of the cropped image in pixels */
  height: number;
}

/**
 * Configuration for the CLAHE histogram equalization.
 */
export interface CLAHEConfig {
  /** Number of tiles in the horizontal direction */
  tilesX: number;
  /** Number of tiles in the vertical direction */
  tilesY: number;
  /** Clip limit for contrast limiting (higher = less limiting) */
  clipLimit: number;
}
