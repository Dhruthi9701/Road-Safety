/**
 * NHAI FaceAuth — Face Detector (BlazeFace Short-Range)
 *
 * Loads the BlazeFace TFLite model via react-native-fast-tflite and provides
 * synchronous face detection on pre-processed 128×128 RGB Float32Array frames.
 *
 * BlazeFace short-range outputs:
 *   - Regressors tensor: [1, 896, 17] — bounding-box deltas + 6 keypoints
 *   - Classificators tensor: [1, 896, 1] — per-anchor confidence logits
 *
 * Pipeline: raw frame → TFLite inference → decode anchors → NMS → result
 *
 * @module faceDetection/FaceDetector
 */

import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import {
  MODEL_FACE_DETECTION,
  FACE_DETECTION_CONFIDENCE,
} from '@constants/config';
import type {
  FaceDetectionResult,
  BoundingBox,
  FaceKeypoints,
  Point2D,
} from '../../types';
import type {
  Anchor,
  AnchorConfig,
  RawDetection,
  NormalizedBox,
  NormalizedKeypoints,
  NMSCandidate,
  DetectorState,
  FaceDetectorConfig,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** BlazeFace short-range model input dimensions. */
const MODEL_INPUT_WIDTH = 128;
const MODEL_INPUT_HEIGHT = 128;

/** Number of anchors produced by BlazeFace short-range. */
const NUM_ANCHORS = 896;

/** Number of values per anchor in the regressor tensor (4 box + 6×2 keypoints + 1 unused = 17). */
const NUM_REGRESSORS = 17;

/** Number of keypoints output by BlazeFace. */
const NUM_KEYPOINTS = 6;

/** Default IoU threshold for Non-Maximum Suppression. */
const DEFAULT_NMS_IOU_THRESHOLD = 0.3;

/** Default maximum faces after NMS. */
const DEFAULT_MAX_FACES = 10;

/** Anchor generation configuration for BlazeFace short-range. */
const ANCHOR_CONFIG: AnchorConfig = {
  strides: [8, 16] as const,
  inputWidth: MODEL_INPUT_WIDTH,
  inputHeight: MODEL_INPUT_HEIGHT,
  anchorsPerStride: 2,
};

// ─── FaceDetector Class ──────────────────────────────────────────────────────

/**
 * BlazeFace short-range face detector.
 *
 * Usage:
 * ```ts
 * const detector = new FaceDetector();
 * await detector.initialize();
 * const result = detector.detectFace(rgbFloat32, 128, 128);
 * detector.dispose();
 * ```
 */
export class FaceDetector {
  /** The loaded TFLite model instance. */
  private model: TensorflowModel | null = null;

  /** Pre-computed anchors for the BlazeFace SSD grid. */
  private anchors: Anchor[] = [];

  /** Current lifecycle state. */
  private state: DetectorState = 'UNINITIALIZED';

  /** Minimum confidence to keep a detection (after sigmoid). */
  private readonly confidenceThreshold: number;

  /** IoU threshold for Non-Maximum Suppression. */
  private readonly nmsIoUThreshold: number;

  /** Maximum number of faces to return. */
  private readonly maxFaces: number;

  /**
   * Create a new FaceDetector instance.
   *
   * @param config - Optional overrides for detection thresholds.
   */
  constructor(config?: FaceDetectorConfig) {
    this.confidenceThreshold =
      config?.confidenceThreshold ?? FACE_DETECTION_CONFIDENCE;
    this.nmsIoUThreshold = config?.nmsIoUThreshold ?? DEFAULT_NMS_IOU_THRESHOLD;
    this.maxFaces = config?.maxFaces ?? DEFAULT_MAX_FACES;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Load the BlazeFace TFLite model and pre-compute SSD anchors.
   *
   * Must be called once before {@link detectFace}. Repeated calls are safe
   * (will skip if already initialized).
   *
   * @throws Will NOT throw — errors are caught and the detector enters ERROR state.
   */
  async initialize(): Promise<void> {
    if (this.state === 'READY') {
      return;
    }

    this.state = 'LOADING';

    try {
      this.model = await loadTensorflowModel(MODEL_FACE_DETECTION, 'android-gpu');
      this.anchors = FaceDetector.generateAnchors(ANCHOR_CONFIG);

      if (this.anchors.length !== NUM_ANCHORS) {
        throw new Error(
          `Anchor count mismatch: expected ${NUM_ANCHORS}, got ${this.anchors.length}`,
        );
      }

      this.state = 'READY';
    } catch (error) {
      this.state = 'ERROR';

      // Attempt CPU fallback if GPU delegate failed
      try {
        this.model = await loadTensorflowModel(MODEL_FACE_DETECTION);
        this.anchors = FaceDetector.generateAnchors(ANCHOR_CONFIG);
        this.state = 'READY';
      } catch (fallbackError) {
        this.state = 'ERROR';
        console.error(
          '[FaceDetector] Failed to load model (GPU + CPU fallback):',
          fallbackError,
        );
      }
    }
  }

  /**
   * Run face detection on a pre-processed 128×128 RGB frame.
   *
   * The input `frameData` must be a Float32Array of length
   * `128 * 128 * 3` with pixel values normalized to [0, 1] or [-1, 1]
   * (BlazeFace uses [0, 1]).
   *
   * @param frameData - Pre-processed RGB pixel data as Float32Array.
   * @param width     - Original frame width in pixels (before resize).
   * @param height    - Original frame height in pixels (before resize).
   * @returns Detection result with confidence, bounding box, and keypoints.
   */
  detectFace(
    frameData: Float32Array,
    width: number,
    height: number,
  ): FaceDetectionResult {
    const emptyResult = FaceDetector.createEmptyResult(width, height);

    if (this.state !== 'READY' || !this.model) {
      console.warn('[FaceDetector] detectFace called but model is not ready.');
      return emptyResult;
    }

    try {
      // Run TFLite inference
      const outputs = this.model.runSync([frameData]);

      // BlazeFace short-range outputs two tensors:
      //   outputs[0] → regressors  [1, 896, 17] flattened to Float32Array(15232)
      //   outputs[1] → classificators [1, 896, 1] flattened to Float32Array(896)
      if (!outputs || outputs.length < 2) {
        console.warn('[FaceDetector] Unexpected output tensor count:', outputs?.length);
        return emptyResult;
      }

      const regressors = outputs[0] as Float32Array;
      const classificators = outputs[1] as Float32Array;

      // Validate tensor sizes
      const expectedRegressors = NUM_ANCHORS * NUM_REGRESSORS;
      const expectedClassificators = NUM_ANCHORS;

      if (regressors.length !== expectedRegressors) {
        console.warn(
          `[FaceDetector] Regressor size mismatch: expected ${expectedRegressors}, got ${regressors.length}`,
        );
        return emptyResult;
      }

      if (classificators.length !== expectedClassificators) {
        console.warn(
          `[FaceDetector] Classificator size mismatch: expected ${expectedClassificators}, got ${classificators.length}`,
        );
        return emptyResult;
      }

      // Decode raw detections from anchor-based format
      const rawDetections = this.decodeDetections(regressors, classificators);

      if (rawDetections.length === 0) {
        return emptyResult;
      }

      // Apply Non-Maximum Suppression
      const nmsDetections = this.nonMaxSuppression(rawDetections, width, height);

      if (nmsDetections.length === 0) {
        return emptyResult;
      }

      // Take the highest-confidence detection
      const best = nmsDetections[0];

      return this.toFaceDetectionResult(best, width, height);
    } catch (error) {
      console.error('[FaceDetector] Inference error:', error);
      return emptyResult;
    }
  }

  /**
   * Run detection and return ALL detected faces (after NMS).
   * Useful for multi-face rejection logic.
   *
   * @param frameData - Pre-processed RGB pixel data as Float32Array.
   * @param width     - Original frame width in pixels.
   * @param height    - Original frame height in pixels.
   * @returns Array of detection results (may be empty).
   */
  detectAllFaces(
    frameData: Float32Array,
    width: number,
    height: number,
  ): FaceDetectionResult[] {
    if (this.state !== 'READY' || !this.model) {
      return [];
    }

    try {
      const outputs = this.model.runSync([frameData]);
      if (!outputs || outputs.length < 2) {
        return [];
      }

      const regressors = outputs[0] as Float32Array;
      const classificators = outputs[1] as Float32Array;

      const rawDetections = this.decodeDetections(regressors, classificators);
      const nmsDetections = this.nonMaxSuppression(rawDetections, width, height);

      return nmsDetections.map((det) => this.toFaceDetectionResult(det, width, height));
    } catch (error) {
      console.error('[FaceDetector] detectAllFaces error:', error);
      return [];
    }
  }

  /**
   * Release model resources and mark the detector as disposed.
   *
   * After calling `dispose()`, the detector cannot be used again.
   * A new instance must be created.
   */
  dispose(): void {
    if (this.model) {
      // react-native-fast-tflite does not expose an explicit dispose, but
      // we drop the reference so the native side can reclaim memory when
      // the JS object is garbage-collected.
      this.model = null;
    }
    this.anchors = [];
    this.state = 'DISPOSED';
  }

  /**
   * Get the current lifecycle state of the detector.
   *
   * @returns Current detector state.
   */
  getState(): DetectorState {
    return this.state;
  }

  /**
   * Check whether the detector is ready for inference.
   *
   * @returns `true` if model is loaded and anchors are computed.
   */
  isReady(): boolean {
    return this.state === 'READY' && this.model !== null;
  }

  // ─── Anchor Generation ───────────────────────────────────────────────────

  /**
   * Generate SSD-style anchors for BlazeFace short-range.
   *
   * BlazeFace uses two feature-map strides (8 and 16) with 2 anchors per
   * position, yielding 128/8 × 128/8 × 2 + 128/16 × 128/16 × 2 = 896 anchors.
   *
   * @param config - Anchor generation parameters.
   * @returns Array of 896 anchors with normalized (cx, cy) coordinates.
   */
  static generateAnchors(config: AnchorConfig): Anchor[] {
    const anchors: Anchor[] = [];
    const { strides, inputWidth, inputHeight, anchorsPerStride } = config;

    for (const stride of strides) {
      const gridRows = Math.floor(inputHeight / stride);
      const gridCols = Math.floor(inputWidth / stride);

      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          // Anchor center in normalized [0..1] space
          const cx = (col + 0.5) / gridCols;
          const cy = (row + 0.5) / gridRows;

          // Add multiple anchors per position
          for (let k = 0; k < anchorsPerStride; k++) {
            anchors.push({ cx, cy });
          }
        }
      }
    }

    return anchors;
  }

  // ─── Detection Decoding ──────────────────────────────────────────────────

  /**
   * Decode raw output tensors into an array of detections above
   * the confidence threshold.
   *
   * For each of the 896 anchors:
   *   - Apply sigmoid to the classificator logit.
   *   - If confidence ≥ threshold, decode the 17 regressor values:
   *     [cx_offset, cy_offset, w, h, kp0_x, kp0_y, ..., kp5_x, kp5_y]
   *
   * @param regressors     - Flattened [896 × 17] regressor output.
   * @param classificators - Flattened [896 × 1] classificator output.
   * @returns Array of above-threshold raw detections.
   */
  private decodeDetections(
    regressors: Float32Array,
    classificators: Float32Array,
  ): RawDetection[] {
    const detections: RawDetection[] = [];

    for (let i = 0; i < NUM_ANCHORS; i++) {
      // Sigmoid activation on classificator logit
      const score = FaceDetector.sigmoid(classificators[i]);

      if (score < this.confidenceThreshold) {
        continue;
      }

      const anchor = this.anchors[i];
      const offset = i * NUM_REGRESSORS;

      // Decode bounding box (offsets are relative to the 128×128 input)
      const box = this.decodeBox(regressors, offset, anchor);

      // Decode 6 keypoints
      const keypoints = this.decodeKeypoints(regressors, offset, anchor);

      detections.push({ score, box, keypoints, anchorIndex: i });
    }

    // Sort by score descending for NMS
    detections.sort((a, b) => b.score - a.score);

    return detections;
  }

  /**
   * Decode a bounding box from regressor values using the anchor position.
   *
   * The first 4 regressor values encode:
   *   [cx_offset / inputWidth, cy_offset / inputHeight, w / inputWidth, h / inputHeight]
   * relative to the anchor center.
   *
   * @param regressors - Full regressor tensor.
   * @param offset     - Starting index for this anchor's 17 values.
   * @param anchor     - The corresponding anchor.
   * @returns Normalized bounding box.
   */
  private decodeBox(
    regressors: Float32Array,
    offset: number,
    anchor: Anchor,
  ): NormalizedBox {
    const cx = regressors[offset + 0] / MODEL_INPUT_WIDTH + anchor.cx;
    const cy = regressors[offset + 1] / MODEL_INPUT_HEIGHT + anchor.cy;
    const w = regressors[offset + 2] / MODEL_INPUT_WIDTH;
    const h = regressors[offset + 3] / MODEL_INPUT_HEIGHT;

    return { cx, cy, w: Math.abs(w), h: Math.abs(h) };
  }

  /**
   * Decode 6 facial keypoints from regressor values.
   *
   * Keypoints start at offset+4 and are stored as interleaved (x, y) pairs
   * in the same anchor-relative format as the bounding box center.
   *
   * @param regressors - Full regressor tensor.
   * @param offset     - Starting index for this anchor's 17 values.
   * @param anchor     - The corresponding anchor.
   * @returns Normalized keypoints.
   */
  private decodeKeypoints(
    regressors: Float32Array,
    offset: number,
    anchor: Anchor,
  ): NormalizedKeypoints {
    const kpOffset = offset + 4; // first 4 values are box
    const pts: Point2D[] = [];

    for (let k = 0; k < NUM_KEYPOINTS; k++) {
      const kx = regressors[kpOffset + k * 2] / MODEL_INPUT_WIDTH + anchor.cx;
      const ky = regressors[kpOffset + k * 2 + 1] / MODEL_INPUT_HEIGHT + anchor.cy;
      pts.push({ x: kx, y: ky });
    }

    // BlazeFace keypoint order:
    // 0: right eye, 1: left eye, 2: nose tip,
    // 3: mouth center, 4: right ear tragion, 5: left ear tragion
    return {
      rightEye: pts[0],
      leftEye: pts[1],
      noseTip: pts[2],
      mouthCenter: pts[3],
      rightEarTragion: pts[4],
      leftEarTragion: pts[5],
    };
  }

  // ─── Non-Maximum Suppression ─────────────────────────────────────────────

  /**
   * Apply greedy Non-Maximum Suppression to remove overlapping detections.
   *
   * Detections must be pre-sorted by score (descending).
   * Any detection whose IoU with a higher-scored kept detection exceeds
   * the threshold is suppressed.
   *
   * @param detections - Sorted raw detections.
   * @param frameWidth  - Original frame width for coordinate scaling.
   * @param frameHeight - Original frame height for coordinate scaling.
   * @returns Array of surviving detections (at most `maxFaces`).
   */
  private nonMaxSuppression(
    detections: RawDetection[],
    frameWidth: number,
    frameHeight: number,
  ): RawDetection[] {
    if (detections.length === 0) {
      return [];
    }

    // Convert normalized boxes to pixel BoundingBoxes for IoU
    const candidates: NMSCandidate[] = detections.map((det, index) => ({
      index,
      score: det.score,
      box: FaceDetector.normalizedBoxToPixelBox(det.box, frameWidth, frameHeight),
      suppressed: false,
    }));

    const kept: RawDetection[] = [];

    for (let i = 0; i < candidates.length && kept.length < this.maxFaces; i++) {
      if (candidates[i].suppressed) {
        continue;
      }

      const current = candidates[i];
      kept.push(detections[current.index]);

      // Suppress all lower-scored candidates with IoU above threshold
      for (let j = i + 1; j < candidates.length; j++) {
        if (candidates[j].suppressed) {
          continue;
        }

        const iou = FaceDetector.computeIoU(current.box, candidates[j].box);
        if (iou > this.nmsIoUThreshold) {
          candidates[j].suppressed = true;
        }
      }
    }

    return kept;
  }

  // ─── Coordinate Conversion ───────────────────────────────────────────────

  /**
   * Convert a normalized bounding box to pixel coordinates.
   *
   * @param box         - Normalized center-format bounding box.
   * @param frameWidth  - Target frame width in pixels.
   * @param frameHeight - Target frame height in pixels.
   * @returns BoundingBox in pixel coordinates (top-left origin).
   */
  static normalizedBoxToPixelBox(
    box: NormalizedBox,
    frameWidth: number,
    frameHeight: number,
  ): BoundingBox {
    const w = box.w * frameWidth;
    const h = box.h * frameHeight;
    const x = box.cx * frameWidth - w / 2;
    const y = box.cy * frameHeight - h / 2;

    return {
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: Math.min(w, frameWidth - Math.max(0, x)),
      height: Math.min(h, frameHeight - Math.max(0, y)),
    };
  }

  /**
   * Convert normalized keypoints to pixel coordinates.
   *
   * @param kp          - Normalized keypoints.
   * @param frameWidth  - Target frame width in pixels.
   * @param frameHeight - Target frame height in pixels.
   * @returns FaceKeypoints in pixel coordinates.
   */
  static normalizedKeypointsToPixel(
    kp: NormalizedKeypoints,
    frameWidth: number,
    frameHeight: number,
  ): FaceKeypoints {
    const scale = (p: Point2D): Point2D => ({
      x: p.x * frameWidth,
      y: p.y * frameHeight,
    });

    return {
      rightEye: scale(kp.rightEye),
      leftEye: scale(kp.leftEye),
      noseTip: scale(kp.noseTip),
      mouthCenter: scale(kp.mouthCenter),
      rightEarTragion: scale(kp.rightEarTragion),
      leftEarTragion: scale(kp.leftEarTragion),
    };
  }

  // ─── Result Builders ─────────────────────────────────────────────────────

  /**
   * Convert a raw detection into a {@link FaceDetectionResult}.
   *
   * @param detection   - Raw detection with normalized coordinates.
   * @param frameWidth  - Original frame width.
   * @param frameHeight - Original frame height.
   * @returns Fully populated FaceDetectionResult.
   */
  private toFaceDetectionResult(
    detection: RawDetection,
    frameWidth: number,
    frameHeight: number,
  ): FaceDetectionResult {
    return {
      detected: true,
      confidence: detection.score,
      boundingBox: FaceDetector.normalizedBoxToPixelBox(
        detection.box,
        frameWidth,
        frameHeight,
      ),
      keypoints: FaceDetector.normalizedKeypointsToPixel(
        detection.keypoints,
        frameWidth,
        frameHeight,
      ),
      frameWidth,
      frameHeight,
      timestamp: Date.now(),
    };
  }

  /**
   * Create an empty (no-detection) result.
   *
   * @param frameWidth  - Frame width for metadata.
   * @param frameHeight - Frame height for metadata.
   * @returns FaceDetectionResult with `detected: false`.
   */
  static createEmptyResult(
    frameWidth: number,
    frameHeight: number,
  ): FaceDetectionResult {
    return {
      detected: false,
      confidence: 0,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      keypoints: {
        rightEye: { x: 0, y: 0 },
        leftEye: { x: 0, y: 0 },
        noseTip: { x: 0, y: 0 },
        mouthCenter: { x: 0, y: 0 },
        rightEarTragion: { x: 0, y: 0 },
        leftEarTragion: { x: 0, y: 0 },
      },
      frameWidth,
      frameHeight,
      timestamp: Date.now(),
    };
  }

  // ─── Math Utilities ──────────────────────────────────────────────────────

  /**
   * Sigmoid activation function.
   *
   * @param x - Input value.
   * @returns Sigmoid output in (0, 1).
   */
  static sigmoid(x: number): number {
    // Clamp to avoid overflow in Math.exp for extreme values
    const clamped = Math.max(-88.72, Math.min(88.72, x));
    return 1.0 / (1.0 + Math.exp(-clamped));
  }

  /**
   * Compute Intersection over Union (IoU) between two bounding boxes.
   *
   * Both boxes are in pixel coordinates with (x, y) at the top-left corner.
   *
   * @param a - First bounding box.
   * @param b - Second bounding box.
   * @returns IoU value in [0, 1].
   */
  static computeIoU(a: BoundingBox, b: BoundingBox): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);

    const intersectionWidth = Math.max(0, x2 - x1);
    const intersectionHeight = Math.max(0, y2 - y1);
    const intersectionArea = intersectionWidth * intersectionHeight;

    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const unionArea = areaA + areaB - intersectionArea;

    if (unionArea <= 0) {
      return 0;
    }

    return intersectionArea / unionArea;
  }
}
