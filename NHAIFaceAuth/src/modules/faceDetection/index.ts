/**
 * NHAI FaceAuth — Face Detection Module Barrel Export
 *
 * Re-exports all public APIs from the face-detection module:
 * - {@link FaceDetector} — BlazeFace-based face detector
 * - {@link FaceValidator} — Face validation utilities
 * - Module-specific types
 *
 * @module faceDetection
 */

export { FaceDetector } from './FaceDetector';
export { FaceValidator } from './FaceValidator';
export type {
  AnchorConfig,
  Anchor,
  RawDetection,
  NormalizedBox,
  NormalizedKeypoints,
  NMSCandidate,
  DetectorState,
  FaceDetectorConfig,
  SubValidationResult,
  BrightnessResult,
  BlurResult,
  FramePixelStats,
} from './types';
