/**
 * NHAI FaceAuth — Face Validator
 *
 * Static validation utilities that evaluate a {@link FaceDetectionResult}
 * against quality, positioning, sizing, brightness, and completeness
 * criteria. Produces a {@link FaceValidationResult} with actionable
 * guidance messages for the end user.
 *
 * All threshold constants are imported from `@constants/config` so they
 * can be tuned centrally without modifying validation logic.
 *
 * @module faceDetection/FaceValidator
 */

import {
  MIN_FACE_SIZE_RATIO,
  MAX_FACE_SIZE_RATIO,
  BLUR_THRESHOLD,
  FACE_CENTER_TOLERANCE,
  MIN_VISIBLE_KEYPOINTS,
  MIN_BRIGHTNESS,
  MAX_BRIGHTNESS,
} from '@constants/config';
import type {
  FaceDetectionResult,
  FaceValidationResult,
  FaceValidationError,
  FaceValidationWarning,
  BoundingBox,
  FaceKeypoints,
  Point2D,
} from '../../types';
import type { SubValidationResult, BrightnessResult, BlurResult } from './types';

// ─── FaceValidator Class ─────────────────────────────────────────────────────

/**
 * Stateless face-validation utilities.
 *
 * All methods are `static` — there is no instance state.
 *
 * Usage:
 * ```ts
 * const result = FaceValidator.validate(detection, 640, 480);
 * if (!result.isValid) {
 *   showMessage(result.guidanceMessage);
 * }
 * ```
 */
export class FaceValidator {
  // ─── Primary Validation Entry Point ────────────────────────────────────

  /**
   * Run the full suite of face validations on a single detection result.
   *
   * Checks performed:
   * 1. Face detected
   * 2. Face size (20–80 % of frame width)
   * 3. Face centering (within tolerance of frame center)
   * 4. Face completeness (all keypoints inside frame)
   * 5. Brightness (not too dark / too bright)
   *
   * Image-quality (blur) checking is NOT included here because it
   * requires raw pixel data. Use {@link validateImageQuality} separately
   * when you have access to the pixel buffer.
   *
   * @param detection   - The face detection result to validate.
   * @param frameWidth  - Width of the source camera frame in pixels.
   * @param frameHeight - Height of the source camera frame in pixels.
   * @returns Aggregated validation result with errors, warnings, and guidance.
   */
  static validate(
    detection: FaceDetectionResult,
    frameWidth: number,
    frameHeight: number,
  ): FaceValidationResult {
    const errors: FaceValidationError[] = [];
    const warnings: FaceValidationWarning[] = [];

    // ── No face ──────────────────────────────────────────────────────────
    if (!detection.detected) {
      errors.push('NO_FACE');
      return {
        isValid: false,
        errors,
        warnings,
        guidanceMessage: FaceValidator.getGuidanceMessage(errors),
      };
    }

    // ── Face size ────────────────────────────────────────────────────────
    const sizeResult = FaceValidator.validateFaceSize(
      detection.boundingBox,
      frameWidth,
    );
    if (!sizeResult.valid) {
      if (sizeResult.issue === 'FACE_TOO_SMALL') {
        errors.push('FACE_TOO_SMALL');
      } else if (sizeResult.issue === 'FACE_TOO_LARGE') {
        errors.push('FACE_TOO_LARGE');
      }
    }

    // ── Face position ────────────────────────────────────────────────────
    const positionResult = FaceValidator.validateFacePosition(
      detection.boundingBox,
      frameWidth,
      frameHeight,
    );
    if (!positionResult.valid) {
      errors.push('FACE_OFF_CENTER');
    }

    // ── Face completeness ────────────────────────────────────────────────
    const complete = FaceValidator.validateFaceCompleteness(
      detection.keypoints,
      frameWidth,
      frameHeight,
    );
    if (!complete) {
      errors.push('FACE_INCOMPLETE');
    }

    // ── Sub-optimal lighting detection (via keypoint confidence proxy) ──
    // This is a lightweight heuristic; full brightness checking requires
    // pixel data (see validateBrightness).
    if (detection.confidence < 0.85 && detection.confidence >= 0.75) {
      warnings.push('SUBOPTIMAL_LIGHTING');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      guidanceMessage: FaceValidator.getGuidanceMessage(errors),
    };
  }

  // ─── Sub-Validators ────────────────────────────────────────────────────

  /**
   * Validate that exactly one face is present.
   *
   * @param detections - Array of all face detections in the frame.
   * @returns `true` if exactly one face is detected, `false` otherwise.
   */
  static validateSingleFace(detections: FaceDetectionResult[]): boolean {
    const validDetections = detections.filter((d) => d.detected);
    return validDetections.length === 1;
  }

  /**
   * Validate face size relative to frame width.
   *
   * The face bounding-box width should be between
   * {@link MIN_FACE_SIZE_RATIO} (20 %) and {@link MAX_FACE_SIZE_RATIO}
   * (80 %) of the frame width.
   *
   * @param bbox       - Face bounding box in pixel coordinates.
   * @param frameWidth - Frame width in pixels.
   * @returns Validation result with optional issue identifier.
   */
  static validateFaceSize(
    bbox: BoundingBox,
    frameWidth: number,
  ): SubValidationResult {
    if (frameWidth <= 0) {
      return { valid: false, issue: 'FACE_TOO_SMALL' };
    }

    const faceRatio = bbox.width / frameWidth;

    if (faceRatio < MIN_FACE_SIZE_RATIO) {
      return { valid: false, issue: 'FACE_TOO_SMALL' };
    }

    if (faceRatio > MAX_FACE_SIZE_RATIO) {
      return { valid: false, issue: 'FACE_TOO_LARGE' };
    }

    return { valid: true };
  }

  /**
   * Validate that the face is centered within the frame.
   *
   * The center of the face bounding box must be within
   * {@link FACE_CENTER_TOLERANCE} (±15 %) of the frame center along
   * both axes.
   *
   * @param bbox        - Face bounding box in pixel coordinates.
   * @param frameWidth  - Frame width in pixels.
   * @param frameHeight - Frame height in pixels.
   * @returns Validation result with optional issue description.
   */
  static validateFacePosition(
    bbox: BoundingBox,
    frameWidth: number,
    frameHeight: number,
  ): SubValidationResult {
    if (frameWidth <= 0 || frameHeight <= 0) {
      return { valid: false, issue: 'Invalid frame dimensions' };
    }

    const faceCenterX = bbox.x + bbox.width / 2;
    const faceCenterY = bbox.y + bbox.height / 2;

    const frameCenterX = frameWidth / 2;
    const frameCenterY = frameHeight / 2;

    // Compute displacement as a fraction of frame dimensions
    const dxNorm = Math.abs(faceCenterX - frameCenterX) / frameWidth;
    const dyNorm = Math.abs(faceCenterY - frameCenterY) / frameHeight;

    if (dxNorm > FACE_CENTER_TOLERANCE || dyNorm > FACE_CENTER_TOLERANCE) {
      // Build a directional hint
      const hints: string[] = [];
      if (faceCenterX < frameCenterX - frameWidth * FACE_CENTER_TOLERANCE) {
        hints.push('right');
      } else if (faceCenterX > frameCenterX + frameWidth * FACE_CENTER_TOLERANCE) {
        hints.push('left');
      }
      if (faceCenterY < frameCenterY - frameHeight * FACE_CENTER_TOLERANCE) {
        hints.push('down');
      } else if (faceCenterY > frameCenterY + frameHeight * FACE_CENTER_TOLERANCE) {
        hints.push('up');
      }

      const direction = hints.length > 0 ? hints.join(' and ') : 'center';
      return {
        valid: false,
        issue: `Move your face ${direction} to center it in the oval`,
      };
    }

    return { valid: true };
  }

  /**
   * Estimate image blur using a Laplacian-variance metric.
   *
   * Computes a discrete Laplacian convolution over the grayscale version
   * of the input and returns the variance. A higher variance indicates a
   * sharper image. Below {@link BLUR_THRESHOLD} the image is considered
   * too blurry.
   *
   * **Note:** the input `pixelData` is expected to be interleaved RGB
   * Float32 values in the range [0, 255] with length = width × height × 3.
   *
   * @param pixelData - Interleaved RGB pixel data.
   * @param width     - Image width in pixels.
   * @param height    - Image height in pixels.
   * @returns Blur analysis result.
   */
  static validateImageQuality(
    pixelData: Float32Array,
    width: number,
    height: number,
  ): BlurResult {
    if (
      width <= 2 ||
      height <= 2 ||
      pixelData.length < width * height * 3
    ) {
      return { valid: false, blurScore: 0 };
    }

    // Convert to grayscale using luminance weights
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = pixelData[i * 3];
      const g = pixelData[i * 3 + 1];
      const b = pixelData[i * 3 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Compute Laplacian (3×3 kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0])
    // over interior pixels (skip 1-pixel border)
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const laplacian =
          gray[idx - width] +       // top
          gray[idx + width] +       // bottom
          gray[idx - 1] +           // left
          gray[idx + 1] -           // right
          4 * gray[idx];            // center

        sum += laplacian;
        sumSq += laplacian * laplacian;
        count++;
      }
    }

    if (count === 0) {
      return { valid: false, blurScore: 0 };
    }

    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    const blurScore = Math.max(0, variance);

    return {
      valid: blurScore >= BLUR_THRESHOLD,
      blurScore,
    };
  }

  /**
   * Validate that all face keypoints fall within the frame boundaries.
   *
   * At least {@link MIN_VISIBLE_KEYPOINTS} of the 6 BlazeFace keypoints
   * must be within the frame for the face to be considered complete.
   *
   * @param keypoints   - The 6 face keypoints in pixel coordinates.
   * @param frameWidth  - Frame width in pixels.
   * @param frameHeight - Frame height in pixels.
   * @returns `true` if enough keypoints are inside the frame.
   */
  static validateFaceCompleteness(
    keypoints: FaceKeypoints,
    frameWidth: number,
    frameHeight: number,
  ): boolean {
    const points: Point2D[] = [
      keypoints.rightEye,
      keypoints.leftEye,
      keypoints.noseTip,
      keypoints.mouthCenter,
      keypoints.rightEarTragion,
      keypoints.leftEarTragion,
    ];

    const visibleCount = points.filter(
      (p) => p.x >= 0 && p.x <= frameWidth && p.y >= 0 && p.y <= frameHeight,
    ).length;

    return visibleCount >= MIN_VISIBLE_KEYPOINTS;
  }

  /**
   * Validate frame brightness from pixel data.
   *
   * Computes the mean brightness of the image (converted to grayscale).
   * The value must fall between {@link MIN_BRIGHTNESS} and
   * {@link MAX_BRIGHTNESS} (on a 0–255 scale).
   *
   * **Note:** the input `pixelData` is expected to be interleaved RGB
   * Float32 values in the range [0, 255] with length ≥ width × height × 3.
   *
   * @param pixelData - Interleaved RGB pixel data.
   * @returns Brightness analysis result.
   */
  static validateBrightness(pixelData: Float32Array): BrightnessResult {
    if (pixelData.length === 0) {
      return { valid: false, brightness: 0 };
    }

    const pixelCount = Math.floor(pixelData.length / 3);

    // Compute mean brightness using luminance formula
    // For very large frames, sample every Nth pixel to save CPU
    const SAMPLE_STRIDE = pixelCount > 100000 ? 4 : 1;
    let sum = 0;
    let count = 0;

    for (let i = 0; i < pixelCount; i += SAMPLE_STRIDE) {
      const r = pixelData[i * 3];
      const g = pixelData[i * 3 + 1];
      const b = pixelData[i * 3 + 2];
      sum += 0.299 * r + 0.587 * g + 0.114 * b;
      count++;
    }

    if (count === 0) {
      return { valid: false, brightness: 0 };
    }

    const brightness = sum / count;

    if (brightness < MIN_BRIGHTNESS) {
      return { valid: false, brightness };
    }

    if (brightness > MAX_BRIGHTNESS) {
      return { valid: false, brightness };
    }

    return { valid: true, brightness };
  }

  // ─── Guidance Messages ─────────────────────────────────────────────────

  /**
   * Convert an array of validation errors into a single, user-friendly
   * guidance message.
   *
   * If multiple errors are present the most critical one (based on a
   * fixed priority order) is returned. The priority order ensures that
   * the user addresses the most impactful issue first.
   *
   * @param errors - Array of validation errors.
   * @returns A single human-readable guidance string. Empty string if
   *          no errors are present.
   */
  static getGuidanceMessage(errors: FaceValidationError[]): string {
    if (errors.length === 0) {
      return '';
    }

    // Priority-ordered error → message map.
    // The first matching error in priority order becomes the guidance.
    const priorityMessages: ReadonlyArray<
      [FaceValidationError, string]
    > = [
      ['NO_FACE', 'Position your face inside the oval guide'],
      ['MULTIPLE_FACES', 'Only one person should be in the frame'],
      ['FACE_INCOMPLETE', 'Keep your entire face visible in the frame'],
      ['FACE_TOO_SMALL', 'Move closer to the camera'],
      ['FACE_TOO_LARGE', 'Move further from the camera'],
      ['FACE_OFF_CENTER', 'Center your face in the oval guide'],
      ['IMAGE_BLURRY', 'Hold the device steady'],
      ['IMAGE_TOO_DARK', 'Move to a brighter area'],
      ['IMAGE_TOO_BRIGHT', 'Avoid direct light on your face'],
    ];

    for (const [errorCode, message] of priorityMessages) {
      if (errors.includes(errorCode)) {
        return message;
      }
    }

    // Fallback (should never be reached)
    return 'Adjust your position for face capture';
  }

  // ─── Extended Validation (Combined with Pixel Data) ────────────────────

  /**
   * Run the full validation suite INCLUDING pixel-quality checks.
   *
   * This is a convenience method that combines {@link validate},
   * {@link validateImageQuality}, and {@link validateBrightness} into
   * a single call when you have both the detection result AND the
   * raw pixel buffer.
   *
   * @param detection   - Face detection result.
   * @param pixelData   - Interleaved RGB Float32 pixel data [0–255].
   * @param frameWidth  - Frame width in pixels.
   * @param frameHeight - Frame height in pixels.
   * @returns Fully aggregated validation result.
   */
  static validateWithPixelData(
    detection: FaceDetectionResult,
    pixelData: Float32Array,
    frameWidth: number,
    frameHeight: number,
  ): FaceValidationResult {
    // Start with the basic structural validation
    const baseResult = FaceValidator.validate(detection, frameWidth, frameHeight);

    // If no face was detected, skip pixel-level checks (they'd be meaningless)
    if (!detection.detected) {
      return baseResult;
    }

    const errors = [...baseResult.errors];
    const warnings = [...baseResult.warnings];

    // Blur check
    const blurResult = FaceValidator.validateImageQuality(
      pixelData,
      frameWidth,
      frameHeight,
    );
    if (!blurResult.valid) {
      errors.push('IMAGE_BLURRY');
    }

    // Brightness check
    const brightnessResult = FaceValidator.validateBrightness(pixelData);
    if (!brightnessResult.valid) {
      if (brightnessResult.brightness < MIN_BRIGHTNESS) {
        errors.push('IMAGE_TOO_DARK');
      } else if (brightnessResult.brightness > MAX_BRIGHTNESS) {
        errors.push('IMAGE_TOO_BRIGHT');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      guidanceMessage: FaceValidator.getGuidanceMessage(errors),
    };
  }
}
