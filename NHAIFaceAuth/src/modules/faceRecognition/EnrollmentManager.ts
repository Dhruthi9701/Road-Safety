/**
 * NHAI FaceAuth — Enrollment Manager
 *
 * Manages the user enrollment workflow: starting a session, capturing
 * 3-5 photos, validating face quality per capture, generating per-photo
 * embeddings, and computing the final centroid embedding for storage.
 *
 * @module faceRecognition/EnrollmentManager
 */

import type { FaceKeypoints, EnrolledUser, FaceEmbedding } from '../../types';
import {
  ENROLLMENT_PHOTO_COUNT,
  MIN_ENROLLMENT_PHOTOS,
  EMBEDDING_DIMENSION,
  MIN_FACE_SIZE_RATIO,
  MIN_BRIGHTNESS,
  MAX_BRIGHTNESS,
  BLUR_THRESHOLD,
} from '../../constants/config';
import { FacePreprocessor } from './FacePreprocessor';
import { FaceRecognizer } from './FaceRecognizer';
import { FaceMatcher } from './FaceMatcher';
import type {
  EnrollmentSession,
  EnrollmentState,
  EnrollmentPhoto,
  EnrollmentPhotoQuality,
} from './types';

/**
 * Generates a UUID v4 string.
 * Uses `crypto.getRandomValues` when available, falls back to Math.random.
 */
function generateUUID(): string {
  // RFC 4122 version 4 UUID
  const hex = '0123456789abcdef';
  const segments = [8, 4, 4, 4, 12];
  const parts: string[] = [];

  try {
    const bytes = new Uint8Array(16);
    // React Native / modern JS: crypto.getRandomValues
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    // Set version (4) and variant (10xx)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    let byteIdx = 0;
    for (const len of segments) {
      let part = '';
      for (let i = 0; i < len; i += 2) {
        const b = bytes[byteIdx++];
        part += hex[b >> 4] + hex[b & 0x0f];
      }
      parts.push(part);
    }
  } catch {
    // Fallback for environments without crypto
    for (const len of segments) {
      let part = '';
      for (let i = 0; i < len; i++) {
        part += hex[Math.floor(Math.random() * 16)];
      }
      parts.push(part);
    }
  }

  return parts.join('-');
}

/**
 * Orchestrates the multi-photo enrollment process.
 *
 * **Lifecycle:**
 * 1. `startEnrollment(name, employeeId, adminId)` → creates a session.
 * 2. `capturePhoto(frameData, width, height, keypoints)` ×3-5 → captures,
 *    validates, aligns, and generates per-photo embeddings.
 * 3. `completeEnrollment()` → averages embeddings, produces `EnrolledUser`.
 *
 * Alternatively, `cancelEnrollment()` aborts and clears the session.
 *
 * @example
 * ```ts
 * const mgr = new EnrollmentManager(recognizer);
 * mgr.startEnrollment('Alice', 'EMP-001', 'ADMIN-001');
 *
 * for (let i = 0; i < 5; i++) {
 *   const result = await mgr.capturePhoto(frame, w, h, kp);
 *   if (!result.success) console.warn(result.error);
 * }
 *
 * const user = await mgr.completeEnrollment();
 * // user.embedding is the averaged, L2-normalized centroid
 * ```
 */
export class EnrollmentManager {
  /** Current enrollment session (null when idle) */
  private session: EnrollmentSession | null = null;

  /** Face recognizer instance for embedding generation */
  private readonly recognizer: FaceRecognizer;

  /** Face matcher instance for centroid computation */
  private readonly matcher: FaceMatcher;

  /** Set of known employee IDs for duplicate detection */
  private readonly knownEmployeeIds: Set<string>;

  /**
   * Create an EnrollmentManager.
   *
   * @param recognizer       – Initialised FaceRecognizer instance.
   * @param knownEmployeeIds – Optional set of already-enrolled employee IDs
   *                           for duplicate detection.
   */
  constructor(
    recognizer: FaceRecognizer,
    knownEmployeeIds: Set<string> = new Set(),
  ) {
    this.recognizer = recognizer;
    this.matcher = new FaceMatcher();
    this.knownEmployeeIds = knownEmployeeIds;
  }

  // ─── Session Lifecycle ───────────────────────────────────────────────

  /**
   * Start a new enrollment session for a user.
   *
   * @param name       – Full display name of the person.
   * @param employeeId – Unique employee / staff identifier.
   * @param adminId    – ID of the admin initiating enrollment.
   * @returns The newly created EnrollmentSession.
   *
   * @throws {Error} If an enrollment session is already in progress.
   * @throws {Error} If the employee ID is already enrolled (duplicate).
   * @throws {Error} If the recognizer is not initialized.
   */
  startEnrollment(
    name: string,
    employeeId: string,
    adminId: string,
  ): EnrollmentSession {
    if (this.session && this.session.state === 'IN_PROGRESS') {
      throw new Error(
        '[EnrollmentManager] A session is already in progress. ' +
        'Cancel or complete it before starting a new one.',
      );
    }

    if (!this.recognizer.isReady()) {
      throw new Error(
        '[EnrollmentManager] FaceRecognizer is not initialized. ' +
        'Call recognizer.initialize() before starting enrollment.',
      );
    }

    // Check for duplicate employee ID
    if (this.knownEmployeeIds.has(employeeId)) {
      throw new Error(
        `[EnrollmentManager] Employee ID "${employeeId}" is already enrolled. ` +
        'Use re-enrollment to update an existing user.',
      );
    }

    // Validate inputs
    if (!name || name.trim().length === 0) {
      throw new Error('[EnrollmentManager] Name cannot be empty.');
    }
    if (!employeeId || employeeId.trim().length === 0) {
      throw new Error('[EnrollmentManager] Employee ID cannot be empty.');
    }
    if (!adminId || adminId.trim().length === 0) {
      throw new Error('[EnrollmentManager] Admin ID cannot be empty.');
    }

    const session: EnrollmentSession = {
      sessionId: generateUUID(),
      name: name.trim(),
      employeeId: employeeId.trim(),
      adminId: adminId.trim(),
      state: 'IN_PROGRESS',
      photos: [],
      embeddings: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      requiredPhotos: ENROLLMENT_PHOTO_COUNT,
      minimumPhotos: MIN_ENROLLMENT_PHOTOS,
    };

    this.session = session;
    return session;
  }

  /**
   * Capture and process a single enrollment photo.
   *
   * Validates face quality, aligns the face, generates an embedding,
   * and stores it in the current session.
   *
   * @param frameData – Raw RGB pixel data of the camera frame.
   * @param width     – Frame width in pixels.
   * @param height    – Frame height in pixels.
   * @param keypoints – Detected face keypoints.
   * @returns Capture result with photo index and any errors.
   *
   * @throws {Error} If no enrollment session is active.
   */
  async capturePhoto(
    frameData: Float32Array,
    width: number,
    height: number,
    keypoints: FaceKeypoints,
  ): Promise<{ success: boolean; photoIndex: number; error?: string }> {
    if (!this.session || this.session.state !== 'IN_PROGRESS') {
      throw new Error(
        '[EnrollmentManager] No active enrollment session. ' +
        'Call startEnrollment() first.',
      );
    }

    // Check if maximum photos already captured
    if (this.session.photos.length >= this.session.requiredPhotos) {
      return {
        success: false,
        photoIndex: this.session.photos.length,
        error: `Maximum of ${this.session.requiredPhotos} photos already captured.`,
      };
    }

    // 1. Validate face quality
    const qualityResult = this.validateFaceQuality(frameData, width, height, keypoints);
    if (qualityResult.quality === 'POOR') {
      return {
        success: false,
        photoIndex: this.session.photos.length,
        error: qualityResult.reason,
      };
    }

    try {
      // 2. Apply CLAHE for lighting normalization
      const equalized = FacePreprocessor.histogramEqualization(frameData, width, height);

      // 3. Align face to 112×112 canonical pose
      const aligned = FacePreprocessor.alignFace(equalized, width, height, keypoints);

      // 4. Normalize pixel values to [−1, +1]
      const normalized = FacePreprocessor.normalizePixels(aligned);

      // 5. Generate embedding
      const embedding = this.recognizer.generateEmbedding(normalized);

      // 6. Validate embedding quality: check it's not a zero vector
      if (!this.isValidEmbedding(embedding)) {
        return {
          success: false,
          photoIndex: this.session.photos.length,
          error: 'Generated embedding is invalid (zero or NaN). Try again.',
        };
      }

      // 7. Cross-check against already captured embeddings for diversity.
      //    If the new embedding is too similar to an existing one,
      //    we warn but still accept it (the user may not have moved enough).
      const diversityWarning = this.checkDiversity(embedding);

      // 8. Store in session
      const photoIndex = this.session.photos.length;
      const photo: EnrollmentPhoto = {
        index: photoIndex,
        alignedPixels: aligned,
        embedding,
        keypoints,
        capturedAt: new Date().toISOString(),
        quality: qualityResult.quality,
      };

      this.session.photos.push(photo);
      this.session.embeddings.push(embedding);

      // Update state if minimum photos reached
      if (this.session.photos.length >= this.session.minimumPhotos) {
        this.session.state = 'READY_TO_COMPLETE';
      }

      return {
        success: true,
        photoIndex,
        error: diversityWarning || undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        photoIndex: this.session.photos.length,
        error: `Photo capture failed: ${message}`,
      };
    }
  }

  /**
   * Complete the enrollment session and produce an `EnrolledUser` record.
   *
   * Averages all captured embeddings into a single centroid embedding,
   * L2-normalizes it, and assembles the user record.
   *
   * @returns The enrolled user record ready for database insertion.
   *
   * @throws {Error} If fewer than MIN_ENROLLMENT_PHOTOS have been captured.
   * @throws {Error} If no enrollment session is active.
   */
  async completeEnrollment(): Promise<EnrolledUser> {
    if (!this.session) {
      throw new Error(
        '[EnrollmentManager] No active enrollment session.',
      );
    }

    if (
      this.session.state !== 'IN_PROGRESS' &&
      this.session.state !== 'READY_TO_COMPLETE'
    ) {
      throw new Error(
        `[EnrollmentManager] Cannot complete session in state "${this.session.state}".`,
      );
    }

    if (this.session.photos.length < this.session.minimumPhotos) {
      throw new Error(
        `[EnrollmentManager] Insufficient photos: captured ${this.session.photos.length}, ` +
        `minimum required ${this.session.minimumPhotos}.`,
      );
    }

    // Convert Float32Array embeddings to number[][] for averaging
    const embeddingArrays = this.session.embeddings.map((e) => Array.from(e));

    // Compute averaged centroid embedding
    const centroid = this.matcher.averageEmbeddings(embeddingArrays);

    const now = new Date().toISOString();

    const enrolledUser: EnrolledUser = {
      id: generateUUID(),
      name: this.session.name,
      employeeId: this.session.employeeId,
      embedding: centroid,
      enrollmentDate: now,
      lastUpdated: now,
      photoCount: this.session.photos.length,
      metadata: {
        enrolledBy: this.session.adminId,
      },
    };

    // Mark session complete
    this.session.state = 'COMPLETED';
    this.session.completedAt = now;

    // Register the employee ID as known
    this.knownEmployeeIds.add(this.session.employeeId);

    return enrolledUser;
  }

  /**
   * Cancel the current enrollment session and discard all data.
   */
  cancelEnrollment(): void {
    if (this.session) {
      this.session.state = 'CANCELLED';
      this.session = null;
    }
  }

  /**
   * Get the current progress of the enrollment session.
   *
   * @returns Progress object with count, required, and quality labels.
   */
  getProgress(): { captured: number; required: number; quality: string[] } {
    if (!this.session) {
      return { captured: 0, required: ENROLLMENT_PHOTO_COUNT, quality: [] };
    }

    return {
      captured: this.session.photos.length,
      required: this.session.requiredPhotos,
      quality: this.session.photos.map((p) => p.quality),
    };
  }

  /**
   * Get the current session state.
   *
   * @returns Current enrollment state, or 'IDLE' if no session.
   */
  getState(): EnrollmentState {
    return this.session?.state ?? 'IDLE';
  }

  /**
   * Get the current session (read-only snapshot).
   *
   * @returns The current session, or null if idle.
   */
  getSession(): EnrollmentSession | null {
    return this.session;
  }

  /**
   * Update the set of known employee IDs (e.g. after loading from DB).
   *
   * @param ids – Employee IDs to register as already enrolled.
   */
  registerKnownEmployeeIds(ids: string[]): void {
    for (const id of ids) {
      this.knownEmployeeIds.add(id);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  /**
   * Validate face quality for enrollment purposes.
   *
   * Checks:
   * - Face is large enough in the frame.
   * - Image brightness is within acceptable range.
   * - Basic blur detection via Laplacian variance.
   * - Keypoint geometry is plausible (eyes, nose, mouth order).
   */
  private validateFaceQuality(
    pixels: Float32Array,
    width: number,
    height: number,
    keypoints: FaceKeypoints,
  ): { quality: EnrollmentPhotoQuality; reason: string } {
    // 1. Check face size (eye distance as proxy)
    const eyeDist = Math.sqrt(
      (keypoints.rightEye.x - keypoints.leftEye.x) ** 2 +
      (keypoints.rightEye.y - keypoints.leftEye.y) ** 2,
    );
    const faceWidthRatio = (eyeDist * 2.5) / width; // approx face width
    if (faceWidthRatio < MIN_FACE_SIZE_RATIO) {
      return { quality: 'POOR', reason: 'Face is too small. Please move closer.' };
    }

    // 2. Check brightness
    const brightness = this.computeMeanBrightness(pixels, width, height);
    if (brightness < MIN_BRIGHTNESS) {
      return { quality: 'POOR', reason: 'Image is too dark. Improve lighting.' };
    }
    if (brightness > MAX_BRIGHTNESS) {
      return { quality: 'POOR', reason: 'Image is too bright. Reduce glare.' };
    }

    // 3. Blur detection via Laplacian variance
    const sharpness = this.computeLaplacianVariance(pixels, width, height);
    if (sharpness < BLUR_THRESHOLD) {
      return { quality: 'POOR', reason: 'Image is blurry. Hold the device steady.' };
    }

    // 4. Keypoint geometry sanity: left eye should be left of right eye
    if (keypoints.leftEye.x >= keypoints.rightEye.x) {
      return { quality: 'POOR', reason: 'Face orientation unclear. Face the camera directly.' };
    }

    // 5. Nose should be between eyes vertically and below eyes
    if (keypoints.noseTip.y < keypoints.leftEye.y) {
      return { quality: 'POOR', reason: 'Face angle is too extreme. Face the camera directly.' };
    }

    // Quality classification based on aggregate score
    const qualityScore =
      (faceWidthRatio > 0.35 ? 1 : 0) +
      (brightness > 80 && brightness < 200 ? 1 : 0) +
      (sharpness > BLUR_THRESHOLD * 1.5 ? 1 : 0);

    if (qualityScore >= 3) {
      return { quality: 'GOOD', reason: '' };
    }
    return { quality: 'ACCEPTABLE', reason: '' };
  }

  /**
   * Compute mean brightness of the image (simple average of all RGB).
   */
  private computeMeanBrightness(
    pixels: Float32Array,
    width: number,
    height: number,
  ): number {
    const totalPixels = width * height;
    if (totalPixels === 0) return 0;

    let sum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const r = pixels[i * 3];
      const g = pixels[i * 3 + 1];
      const b = pixels[i * 3 + 2];
      sum += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    return sum / totalPixels;
  }

  /**
   * Compute Laplacian variance as a sharpness (blur) metric.
   *
   * Converts to grayscale, applies a 3×3 Laplacian kernel,
   * and returns the variance of the result. Higher = sharper.
   */
  private computeLaplacianVariance(
    pixels: Float32Array,
    width: number,
    height: number,
  ): number {
    if (width < 3 || height < 3) return 0;

    // Convert to grayscale
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      gray[i] = 0.299 * pixels[i * 3] + 0.587 * pixels[i * 3 + 1] + 0.114 * pixels[i * 3 + 2];
    }

    // Apply Laplacian kernel: [0 1 0; 1 -4 1; 0 1 0]
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const laplacian =
          gray[(y - 1) * width + x] +
          gray[(y + 1) * width + x] +
          gray[y * width + (x - 1)] +
          gray[y * width + (x + 1)] -
          4 * gray[y * width + x];

        sum += laplacian;
        sumSq += laplacian * laplacian;
        count++;
      }
    }

    if (count === 0) return 0;

    const mean = sum / count;
    return sumSq / count - mean * mean; // variance
  }

  /**
   * Validate that an embedding is not degenerate (zero vector or NaN).
   */
  private isValidEmbedding(embedding: FaceEmbedding): boolean {
    if (embedding.length !== EMBEDDING_DIMENSION) {
      return false;
    }

    let hasNonZero = false;
    for (let i = 0; i < embedding.length; i++) {
      if (isNaN(embedding[i]) || !isFinite(embedding[i])) {
        return false;
      }
      if (embedding[i] !== 0) {
        hasNonZero = true;
      }
    }

    return hasNonZero;
  }

  /**
   * Check embedding diversity against already-captured photos.
   *
   * If the new embedding is extremely similar (> 0.98) to an existing
   * capture, return a warning message suggesting the user change pose.
   */
  private checkDiversity(newEmbedding: FaceEmbedding): string | null {
    if (!this.session || this.session.embeddings.length === 0) {
      return null;
    }

    const DIVERSITY_THRESHOLD = 0.98;

    for (let i = 0; i < this.session.embeddings.length; i++) {
      const existing = this.session.embeddings[i];
      const similarity = this.matcher.matchAgainstUser(newEmbedding, Array.from(existing));

      if (similarity > DIVERSITY_THRESHOLD) {
        return (
          `Photo is very similar to capture #${i + 1}. ` +
          'Try a slightly different angle or expression for better enrollment quality.'
        );
      }
    }

    return null;
  }
}
