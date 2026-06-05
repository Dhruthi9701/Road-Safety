/**
 * NHAI FaceAuth — Face Recognition Module
 *
 * Barrel export for all face-recognition components:
 * - FacePreprocessor: alignment, CLAHE, resize, normalization, cropping
 * - FaceRecognizer: MobileFaceNet TFLite embedding generation
 * - FaceMatcher: cosine similarity, database matching, centroid averaging
 * - EnrollmentManager: multi-photo enrollment session orchestration
 *
 * @module faceRecognition
 */

// ─── Classes ─────────────────────────────────────────────────────────────────

export { FacePreprocessor } from './FacePreprocessor';
export { FaceRecognizer } from './FaceRecognizer';
export { FaceMatcher } from './FaceMatcher';
export { EnrollmentManager } from './EnrollmentManager';

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  AlignmentTransform,
  AlignmentTarget,
  EnrollmentSession,
  EnrollmentState,
  EnrollmentPhoto,
  EnrollmentPhotoQuality,
  EmbeddingComparison,
  MatchCandidate,
  CropResult,
  CLAHEConfig,
} from './types';
