/**
 * NHAI FaceAuth — Passive Anti-Spoof Detector
 *
 * Runs a MobileNetV2-based TFLite model (224 × 224 RGB input) to distinguish
 * real faces from printed photos, screen replays, and 3D masks.
 *
 * The model outputs a [1, 2] tensor: [real_probability, spoof_probability].
 * A face is considered real when `real_probability > 0.80`.
 *
 * Lifecycle:
 * ```
 *   const detector = new PassiveAntiSpoofDetector();
 *   await detector.initialize();
 *   const result = detector.detect(pixels, w, h);
 *   detector.dispose();
 * ```
 *
 * @module PassiveAntiSpoofDetector
 */

import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import { MODEL_ANTISPOOF, ANTISPOOF_THRESHOLD } from '../../constants/config';
import type { AntiSpoofResult } from '../../types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Model expects 224 × 224 RGB. */
const MODEL_INPUT_SIZE = 224;

/** Number of colour channels (RGB). */
const CHANNELS = 3;

/** Total float count for the input tensor. */
const INPUT_LENGTH = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * CHANNELS;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Bilinear-interpolation resize of a planar Float32Array image.
 *
 * @param src    Source pixel data in row-major RGB order, normalised [0, 1].
 * @param srcW   Source width.
 * @param srcH   Source height.
 * @param dstW   Target width.
 * @param dstH   Target height.
 * @returns Resized Float32Array of length dstW × dstH × 3.
 */
function bilinearResize(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const dst = new Float32Array(dstW * dstH * CHANNELS);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const srcY = dy * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fy = srcY - y0;

    for (let dx = 0; dx < dstW; dx++) {
      const srcX = dx * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const fx = srcX - x0;

      const dstIdx = (dy * dstW + dx) * CHANNELS;

      for (let c = 0; c < CHANNELS; c++) {
        const tl = src[(y0 * srcW + x0) * CHANNELS + c];
        const tr = src[(y0 * srcW + x1) * CHANNELS + c];
        const bl = src[(y1 * srcW + x0) * CHANNELS + c];
        const br = src[(y1 * srcW + x1) * CHANNELS + c];

        dst[dstIdx + c] =
          tl * (1 - fx) * (1 - fy) +
          tr * fx * (1 - fy) +
          bl * (1 - fx) * fy +
          br * fx * fy;
      }
    }
  }

  return dst;
}

/**
 * Classify the spoof attack type from the model scores.
 *
 * The single anti-spoof model only gives real vs. spoof, so the attack type
 * is inferred heuristically from the score distribution:
 *
 * - Very high spoof confidence (> 0.95) → likely PRINT attack (flat texture)
 * - High spoof confidence (> 0.85) → likely SCREEN replay
 * - Moderate spoof confidence → could be MASK
 * - Otherwise → UNKNOWN
 */
function classifyAttackType(
  realScore: number,
  spoofScore: number,
): AntiSpoofResult['attackType'] {
  if (realScore >= ANTISPOOF_THRESHOLD) return undefined;
  if (spoofScore > 0.95) return 'PRINT';
  if (spoofScore > 0.85) return 'SCREEN';
  if (spoofScore > 0.70) return 'MASK';
  return 'UNKNOWN';
}

// ─── Class ───────────────────────────────────────────────────────────────────

/**
 * Passive anti-spoofing detector powered by a MobileNetV2 TFLite model.
 *
 * Call {@link initialize} once before using {@link detect}, and call
 * {@link dispose} when the detector is no longer needed.
 */
export class PassiveAntiSpoofDetector {
  /** Loaded TFLite model handle. */
  private model: TensorflowModel | null = null;

  /** Whether `initialize()` has been called successfully. */
  private initialized = false;

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Load the MobileNetV2 anti-spoofing TFLite model into memory.
   *
   * This is an async operation that must complete before calling `detect()`.
   *
   * @throws If the model file cannot be located or loaded.
   */
  public async initialize(): Promise<void> {
    if (this.initialized && this.model) return;

    try {
      this.model = await loadTensorflowModel(MODEL_ANTISPOOF, 'android-gpu');
      this.initialized = true;
    } catch (gpuError) {
      // Fallback to CPU delegate when GPU is unavailable
      try {
        this.model = await loadTensorflowModel(MODEL_ANTISPOOF, 'default');
        this.initialized = true;
      } catch (cpuError) {
        this.initialized = false;
        throw new Error(
          `[PassiveAntiSpoofDetector] Failed to load model: ${
            cpuError instanceof Error ? cpuError.message : String(cpuError)
          }`,
        );
      }
    }
  }

  /**
   * Run anti-spoof inference on a cropped face region.
   *
   * The input pixels are expected in row-major RGB order with values in
   * the range [0, 255]. The method handles normalisation to [0, 1] and
   * bilinear resizing to 224 × 224 internally.
   *
   * @param facePixels Row-major RGB pixel data (may be any resolution).
   * @param width      Width of the source pixel buffer.
   * @param height     Height of the source pixel buffer.
   * @returns Anti-spoof result with scores and attack-type classification.
   * @throws If the detector has not been initialised.
   */
  public detect(
    facePixels: Float32Array,
    width: number,
    height: number,
  ): AntiSpoofResult {
    if (!this.initialized || !this.model) {
      throw new Error(
        '[PassiveAntiSpoofDetector] Not initialised — call initialize() first.',
      );
    }

    // ── Step 1: Normalise to [0, 1] ──
    const normalised = new Float32Array(facePixels.length);
    for (let i = 0; i < facePixels.length; i++) {
      normalised[i] = facePixels[i] / 255.0;
    }

    // ── Step 2: Resize to 224 × 224 ──
    let input: Float32Array;
    if (width === MODEL_INPUT_SIZE && height === MODEL_INPUT_SIZE) {
      input = normalised;
    } else {
      input = bilinearResize(
        normalised,
        width,
        height,
        MODEL_INPUT_SIZE,
        MODEL_INPUT_SIZE,
      );
    }

    // Validate tensor length
    if (input.length !== INPUT_LENGTH) {
      throw new Error(
        `[PassiveAntiSpoofDetector] Input tensor size mismatch: ` +
          `expected ${INPUT_LENGTH}, got ${input.length}`,
      );
    }

    // ── Step 3: Run inference ──
    const outputTensors = this.model.runSync([input]);
    const output = outputTensors[0] as Float32Array;

    if (!output || output.length < 2) {
      throw new Error(
        '[PassiveAntiSpoofDetector] Model produced unexpected output shape.',
      );
    }

    const realScore = output[0];
    const spoofScore = output[1];

    // ── Step 4: Interpret result ──
    const isReal = realScore > ANTISPOOF_THRESHOLD;
    const confidence = isReal ? realScore : spoofScore;
    const attackType = classifyAttackType(realScore, spoofScore);

    return {
      isReal,
      realScore,
      spoofScore,
      confidence,
      attackType,
    };
  }

  /**
   * Release the TFLite model and free associated memory.
   *
   * Safe to call multiple times.
   */
  public dispose(): void {
    if (this.model) {
      // react-native-fast-tflite models are garbage-collected, but we
      // release our reference to allow early GC.
      this.model = null;
    }
    this.initialized = false;
  }

  /**
   * Check whether the detector is ready for inference.
   *
   * @returns `true` if `initialize()` completed successfully.
   */
  public isReady(): boolean {
    return this.initialized && this.model !== null;
  }
}
