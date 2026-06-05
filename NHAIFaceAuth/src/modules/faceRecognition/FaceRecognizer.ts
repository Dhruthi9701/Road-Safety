/**
 * NHAI FaceAuth — Face Recognizer (MobileFaceNet TFLite Inference)
 *
 * Loads the MobileFaceNet INT8 quantized TFLite model via
 * `react-native-fast-tflite` and generates 128-dimensional
 * L2-normalized face embeddings from aligned 112×112 face images.
 *
 * @module faceRecognition/FaceRecognizer
 */

import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import { MODEL_FACE_RECOGNITION, EMBEDDING_DIMENSION } from '../../constants/config';
import type { FaceEmbedding } from '../../types';

/** Input image dimensions expected by MobileFaceNet */
const INPUT_WIDTH = 112;
const INPUT_HEIGHT = 112;
const INPUT_CHANNELS = 3;
const INPUT_SIZE = INPUT_WIDTH * INPUT_HEIGHT * INPUT_CHANNELS;

/**
 * Wraps the MobileFaceNet TFLite model for face embedding generation.
 *
 * **Usage:**
 * ```ts
 * const recognizer = new FaceRecognizer();
 * await recognizer.initialize();
 *
 * const embedding = recognizer.generateEmbedding(alignedFace);
 * // embedding is a 128-D Float32Array (L2 normalized)
 *
 * recognizer.dispose();
 * ```
 *
 * @remarks
 * - The model expects 112×112×3 input normalised to [−1, +1].
 * - Output is 128-D float array that gets L2-normalised before return.
 * - INT8 quantization is handled transparently by the TFLite runtime.
 * - Thread-safe: do not call `generateEmbedding` concurrently.
 */
export class FaceRecognizer {
  /** Underlying TFLite model handle */
  private model: TensorflowModel | null = null;

  /** Whether the model has been successfully loaded */
  private initialized = false;

  /**
   * Load the MobileFaceNet TFLite model into memory.
   *
   * Call this once before any calls to `generateEmbedding`.
   * If the model is already loaded, this is a no-op.
   *
   * @throws {Error} If the model file cannot be loaded.
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.model) {
      return;
    }

    try {
      this.model = await loadTensorflowModel(MODEL_FACE_RECOGNITION, 'android-gpu');
      this.initialized = true;
    } catch (gpuError) {
      // Fallback: try CPU delegate if GPU is not available
      try {
        this.model = await loadTensorflowModel(MODEL_FACE_RECOGNITION);
        this.initialized = true;
      } catch (cpuError) {
        this.initialized = false;
        this.model = null;
        throw new Error(
          `[FaceRecognizer] Failed to load MobileFaceNet model. ` +
          `GPU error: ${gpuError instanceof Error ? gpuError.message : String(gpuError)}. ` +
          `CPU error: ${cpuError instanceof Error ? cpuError.message : String(cpuError)}.`,
        );
      }
    }
  }

  /**
   * Generate a 128-D face embedding from a pre-aligned, pre-normalized
   * 112×112 face image.
   *
   * @param alignedFace – Float32Array of length 112×112×3 with pixel
   *                      values in [−1, +1] (use `FacePreprocessor.normalizePixels`).
   * @returns L2-normalized 128-D face embedding.
   *
   * @throws {Error} If the model is not initialized.
   * @throws {Error} If the input dimensions are incorrect.
   */
  generateEmbedding(alignedFace: Float32Array): FaceEmbedding {
    if (!this.initialized || !this.model) {
      throw new Error(
        '[FaceRecognizer] Model not initialized. Call initialize() first.',
      );
    }

    if (alignedFace.length !== INPUT_SIZE) {
      throw new Error(
        `[FaceRecognizer] Invalid input size: expected ${INPUT_SIZE} ` +
        `(${INPUT_WIDTH}×${INPUT_HEIGHT}×${INPUT_CHANNELS}), got ${alignedFace.length}.`,
      );
    }

    // Run inference — react-native-fast-tflite v3 uses synchronous runSync
    const outputs = this.model.runSync([alignedFace]);

    // The model outputs a single tensor of shape [1, 128]
    const rawEmbedding = outputs[0];

    if (!rawEmbedding || rawEmbedding.length < EMBEDDING_DIMENSION) {
      throw new Error(
        `[FaceRecognizer] Unexpected model output: expected at least ` +
        `${EMBEDDING_DIMENSION} values, got ${rawEmbedding?.length ?? 0}.`,
      );
    }

    // Extract the 128-D vector (may be inside a [1, 128] shaped tensor)
    const embedding = new Float32Array(EMBEDDING_DIMENSION);
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      embedding[i] = rawEmbedding[i];
    }

    // L2 normalize
    return this.l2Normalize(embedding);
  }

  /**
   * L2-normalize an embedding vector (unit length).
   *
   * Each element is divided by the L2 (Euclidean) norm of the vector.
   * If the norm is zero (degenerate), the original vector is returned.
   *
   * @param embedding – Raw embedding vector.
   * @returns New Float32Array with ||v|| = 1.
   */
  l2Normalize(embedding: Float32Array): Float32Array {
    let sumSq = 0;
    for (let i = 0; i < embedding.length; i++) {
      sumSq += embedding[i] * embedding[i];
    }

    const norm = Math.sqrt(sumSq);

    if (norm < 1e-10) {
      // Degenerate zero-vector — return as-is to avoid division by zero
      return new Float32Array(embedding);
    }

    const normalized = new Float32Array(embedding.length);
    const invNorm = 1.0 / norm;
    for (let i = 0; i < embedding.length; i++) {
      normalized[i] = embedding[i] * invNorm;
    }

    return normalized;
  }

  /**
   * Check whether the model has been loaded and is ready for inference.
   *
   * @returns `true` if `initialize()` completed successfully.
   */
  isReady(): boolean {
    return this.initialized && this.model !== null;
  }

  /**
   * Release the TFLite model and free associated memory.
   *
   * After calling `dispose()`, the recognizer must be re-initialized
   * before generating further embeddings.
   */
  dispose(): void {
    if (this.model) {
      // react-native-fast-tflite models don't have an explicit close,
      // but we null out the reference for GC
      this.model = null;
    }
    this.initialized = false;
  }
}
