/**
 * NHAI FaceAuth — Face Detection Module Types
 *
 * Internal types for the BlazeFace-based face detection pipeline.
 * These types are NOT exported from the main application types file;
 * they are implementation details of the face-detection module.
 *
 * @module faceDetection/types
 */

import type { BoundingBox, FaceKeypoints, Point2D } from '../../types';

// ─── BlazeFace Anchor Configuration ──────────────────────────────────────────

/**
 * Configuration for generating SSD-style anchors used by BlazeFace.
 * Anchors tile the 128×128 input space and are used to decode
 * regressor outputs into absolute bounding-box coordinates.
 */
export interface AnchorConfig {
  /** Spatial strides for each feature-map layer (e.g. [8, 16]). */
  readonly strides: readonly number[];
  /** Input image width expected by the model (128 for BlazeFace short-range). */
  readonly inputWidth: number;
  /** Input image height expected by the model (128 for BlazeFace short-range). */
  readonly inputHeight: number;
  /** Number of anchors generated per spatial position per stride. */
  readonly anchorsPerStride: number;
}

/**
 * A single SSD-style anchor centered at (cx, cy).
 * Width and height are always 1.0 in the normalized coordinate space
 * used by BlazeFace short-range.
 */
export interface Anchor {
  /** Normalized center-x (0..1 in model input space). */
  cx: number;
  /** Normalized center-y (0..1 in model input space). */
  cy: number;
}

// ─── Raw Detection Structures ────────────────────────────────────────────────

/**
 * A single raw detection BEFORE Non-Maximum Suppression.
 * Produced by decoding BlazeFace output tensors against anchors.
 */
export interface RawDetection {
  /** Confidence score after sigmoid (0..1). */
  score: number;
  /** Decoded bounding box in normalized coordinates (0..1). */
  box: NormalizedBox;
  /** Six facial keypoints in normalized coordinates. */
  keypoints: NormalizedKeypoints;
  /** Index of the anchor that produced this detection. */
  anchorIndex: number;
}

/**
 * Bounding box in normalized [0..1] coordinates.
 * These are the raw decoded values before scaling to pixel coordinates.
 */
export interface NormalizedBox {
  /** Center X in normalized space. */
  cx: number;
  /** Center Y in normalized space. */
  cy: number;
  /** Width in normalized space. */
  w: number;
  /** Height in normalized space. */
  h: number;
}

/**
 * All six BlazeFace keypoints in normalized [0..1] coordinates.
 * Order follows the standard BlazeFace convention.
 */
export interface NormalizedKeypoints {
  rightEye: Point2D;
  leftEye: Point2D;
  noseTip: Point2D;
  mouthCenter: Point2D;
  rightEarTragion: Point2D;
  leftEarTragion: Point2D;
}

// ─── NMS Types ───────────────────────────────────────────────────────────────

/**
 * Candidate detection used during Non-Maximum Suppression.
 * Includes the original index for tracking which detections survive.
 */
export interface NMSCandidate {
  /** Index in the original detections array. */
  index: number;
  /** Confidence score. */
  score: number;
  /** Bounding box in pixel coordinates for IoU computation. */
  box: BoundingBox;
  /** Whether this candidate has been suppressed. */
  suppressed: boolean;
}

// ─── Face Detector State ─────────────────────────────────────────────────────

/**
 * Lifecycle state of the FaceDetector instance.
 */
export type DetectorState =
  | 'UNINITIALIZED'
  | 'LOADING'
  | 'READY'
  | 'ERROR'
  | 'DISPOSED';

/**
 * Configuration options for FaceDetector initialization.
 */
export interface FaceDetectorConfig {
  /** Minimum confidence score to keep a detection. Default: from config constants. */
  confidenceThreshold?: number;
  /** IoU threshold for NMS. Default: 0.3. */
  nmsIoUThreshold?: number;
  /** Maximum number of faces to return after NMS. Default: 10. */
  maxFaces?: number;
}

// ─── Face Validation Internal Types ──────────────────────────────────────────

/**
 * Result from an individual sub-validation check.
 */
export interface SubValidationResult {
  /** Whether this specific check passed. */
  valid: boolean;
  /** Optional human-readable issue description. */
  issue?: string;
}

/**
 * Brightness analysis result from pixel data inspection.
 */
export interface BrightnessResult {
  /** Whether brightness is within acceptable range. */
  valid: boolean;
  /** Average brightness on 0–255 scale. */
  brightness: number;
}

/**
 * Blur analysis result from Laplacian variance computation.
 */
export interface BlurResult {
  /** Whether image passes blur threshold. */
  valid: boolean;
  /** Laplacian variance score (higher = sharper). */
  blurScore: number;
}

/**
 * Pixel statistics extracted from a frame for quality assessment.
 */
export interface FramePixelStats {
  /** Mean brightness (0–255). */
  meanBrightness: number;
  /** Standard deviation of brightness. */
  brightnessStd: number;
  /** Laplacian variance (sharpness metric). */
  laplacianVariance: number;
}
