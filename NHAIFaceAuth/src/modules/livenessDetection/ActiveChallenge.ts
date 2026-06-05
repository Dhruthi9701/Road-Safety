/**
 * NHAI FaceAuth — Active Challenge Detector
 *
 * Analyses 468 3D face-mesh landmarks produced by the `face_landmark_192`
 * TFLite model to recognise four gesture types: blink, smile, head-turn
 * (left / right), and nod.
 *
 * Every public detector method is **pure per-frame** — it maintains its own
 * lightweight state between calls so the caller only needs to feed landmarks
 * each frame.
 *
 * @module ActiveChallengeDetector
 */

import type { Point3D } from '../../types';
import {
  EAR_BLINK_THRESHOLD,
  EAR_BLINK_THRESHOLD_GLASSES,
  MAR_SMILE_THRESHOLD,
  HEAD_TURN_THRESHOLD,
  NOD_THRESHOLD,
} from '../../constants/config';
import type {
  ChallengeDetectionResult,
  BlinkState,
  EyeState,
  MouthState,
  HeadPose,
  NodPhase,
  NodState,
  LandmarkSet,
} from './types';
import {
  RIGHT_EYE_INDICES,
  LEFT_EYE_INDICES,
  MOUTH_INDICES,
  NOSE_TIP_INDEX,
  FACE_WIDTH_INDICES,
  FACE_HEIGHT_INDICES,
} from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Euclidean distance between two 3D points.
 * Uses only x/y for EAR-style metrics (z is noisy on cheap sensors).
 */
function dist2D(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Euclidean distance using all three axes.
 */
function dist3D(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Clamp a value to [0, 1].
 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─── Class ───────────────────────────────────────────────────────────────────

/**
 * Stateful detector for active liveness challenges.
 *
 * Usage:
 * ```ts
 * const detector = new ActiveChallengeDetector();
 * // per camera frame:
 * const result = detector.detectBlink(landmarks, false);
 * if (result.detected) { ... }
 * ```
 */
export class ActiveChallengeDetector {
  // ── Blink state ──
  private blinkState: BlinkState = 'OPEN';
  private blinkCloseTimestamp = 0;
  private lastBlinkTimestamp = 0;

  /** Maximum allowed duration (ms) for a closed→open transition. */
  private static readonly BLINK_MAX_DURATION_MS = 500;

  // ── Smile state ──
  private smileStartTimestamp = 0;
  private isCurrentlySmiling = false;

  /** Minimum sustained smile duration (ms). */
  private static readonly SMILE_SUSTAIN_MS = 300;

  // ── Head turn state ──
  private headTurnStartTimestamp = 0;
  private headTurnDirection: 'LEFT' | 'RIGHT' | null = null;

  /** Minimum sustained turn duration (ms). */
  private static readonly HEAD_TURN_SUSTAIN_MS = 500;

  // ── Nod state ──
  private nodState: NodState = {
    phase: 'IDLE',
    startTimestamp: 0,
    baselineY: 0,
    completed: false,
  };

  /** Maximum duration (ms) for a complete nod cycle. */
  private static readonly NOD_MAX_DURATION_MS = 2000;

  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calculate Eye Aspect Ratio (EAR) for a set of 6 eye landmarks.
   *
   * ```
   * EAR = (|p2−p6| + |p3−p5|) / (2 × |p1−p4|)
   * ```
   *
   * @param landmarks Full 468-point landmark set.
   * @param indices   Six landmark indices [p1,p2,p3,p4,p5,p6].
   * @returns EAR value (typically 0.15–0.40 when open).
   */
  public calculateEAR(landmarks: LandmarkSet, indices: readonly number[]): number {
    const [p1, p2, p3, p4, p5, p6] = indices.map(i => landmarks[i]);
    const vertical1 = dist2D(p2, p6);
    const vertical2 = dist2D(p3, p5);
    const horizontal = dist2D(p1, p4);
    if (horizontal === 0) return 0;
    return (vertical1 + vertical2) / (2 * horizontal);
  }

  /**
   * Get the current eye state from landmarks.
   *
   * @param landmarks Full 468-point landmark set.
   * @returns Current EyeState snapshot.
   */
  public getEyeState(landmarks: LandmarkSet): EyeState {
    const leftEAR = this.calculateEAR(landmarks, LEFT_EYE_INDICES);
    const rightEAR = this.calculateEAR(landmarks, RIGHT_EYE_INDICES);
    const averageEAR = (leftEAR + rightEAR) / 2;
    return {
      leftEAR,
      rightEAR,
      averageEAR,
      blinkState: this.blinkState,
      lastBlinkTimestamp: this.lastBlinkTimestamp,
    };
  }

  /**
   * Get the current mouth state from landmarks.
   *
   * @param landmarks Full 468-point landmark set.
   * @returns Current MouthState snapshot.
   */
  public getMouthState(landmarks: LandmarkSet): MouthState {
    const leftCorner = landmarks[MOUTH_INDICES.leftCorner];
    const rightCorner = landmarks[MOUTH_INDICES.rightCorner];
    const upperLip = landmarks[MOUTH_INDICES.upperLip];
    const lowerLip = landmarks[MOUTH_INDICES.lowerLip];

    const mouthWidth = dist2D(leftCorner, rightCorner);
    const mouthHeight = dist2D(upperLip, lowerLip);

    const leftCheek = landmarks[FACE_WIDTH_INDICES.leftCheek];
    const rightCheek = landmarks[FACE_WIDTH_INDICES.rightCheek];
    const faceWidth = dist2D(leftCheek, rightCheek);

    const mouthWidthRatio = faceWidth > 0 ? mouthWidth / faceWidth : 0;
    const now = Date.now();
    const isSmiling = mouthWidthRatio > MAR_SMILE_THRESHOLD;
    const smileDurationMs =
      isSmiling && this.isCurrentlySmiling
        ? now - this.smileStartTimestamp
        : 0;

    return {
      mouthWidthRatio,
      mouthWidth,
      mouthHeight,
      isSmiling,
      smileDurationMs,
    };
  }

  /**
   * Get the current head pose estimate from landmarks.
   *
   * @param landmarks Full 468-point landmark set.
   * @returns Current HeadPose snapshot.
   */
  public getHeadPose(landmarks: LandmarkSet): HeadPose {
    const noseTip = landmarks[NOSE_TIP_INDEX];
    const leftCheek = landmarks[FACE_WIDTH_INDICES.leftCheek];
    const rightCheek = landmarks[FACE_WIDTH_INDICES.rightCheek];
    const forehead = landmarks[FACE_HEIGHT_INDICES.forehead];
    const chin = landmarks[FACE_HEIGHT_INDICES.chin];

    const centerX = (leftCheek.x + rightCheek.x) / 2;
    const centerY = (forehead.y + chin.y) / 2;
    const faceWidth = dist2D(leftCheek, rightCheek);
    const faceHeight = dist2D(forehead, chin);

    const yaw = faceWidth > 0 ? (noseTip.x - centerX) / faceWidth : 0;
    const pitch = faceHeight > 0 ? (noseTip.y - centerY) / faceHeight : 0;

    let direction: HeadPose['direction'] = 'CENTER';
    if (yaw < -HEAD_TURN_THRESHOLD) direction = 'LEFT';
    else if (yaw > HEAD_TURN_THRESHOLD) direction = 'RIGHT';
    else if (pitch < -NOD_THRESHOLD) direction = 'UP';
    else if (pitch > NOD_THRESHOLD) direction = 'DOWN';

    return { yaw, pitch, direction };
  }

  // ─── Blink Detection ────────────────────────────────────────────────────

  /**
   * Detect a blink gesture across successive frames.
   *
   * Tracks a state machine: OPEN → CLOSING → CLOSED → OPENING → OPEN.
   * A blink is detected when the full closed→open transition completes
   * within 500 ms.
   *
   * @param landmarks       Full 468-point landmark set.
   * @param glassesDetected Whether glasses were detected on the subject.
   * @returns Detection result with confidence and progress.
   */
  public detectBlink(
    landmarks: LandmarkSet,
    glassesDetected: boolean,
  ): ChallengeDetectionResult {
    const threshold = glassesDetected
      ? EAR_BLINK_THRESHOLD_GLASSES
      : EAR_BLINK_THRESHOLD;

    const eyeState = this.getEyeState(landmarks);
    const ear = eyeState.averageEAR;
    const now = Date.now();
    const eyesClosed = ear < threshold;

    // Advance state machine
    switch (this.blinkState) {
      case 'OPEN':
        if (eyesClosed) {
          this.blinkState = 'CLOSING';
          this.blinkCloseTimestamp = now;
        }
        break;

      case 'CLOSING':
        if (eyesClosed) {
          this.blinkState = 'CLOSED';
        } else {
          // Opened again too quickly — reset
          this.blinkState = 'OPEN';
        }
        break;

      case 'CLOSED':
        if (!eyesClosed) {
          this.blinkState = 'OPENING';
        }
        // Timeout guard
        if (now - this.blinkCloseTimestamp > ActiveChallengeDetector.BLINK_MAX_DURATION_MS) {
          // Eyes stayed closed too long — not a blink, reset
          this.blinkState = 'OPEN';
        }
        break;

      case 'OPENING':
        if (!eyesClosed) {
          const elapsed = now - this.blinkCloseTimestamp;
          if (elapsed <= ActiveChallengeDetector.BLINK_MAX_DURATION_MS) {
            // Valid blink detected!
            this.lastBlinkTimestamp = now;
            this.blinkState = 'OPEN';
            return { detected: true, confidence: clamp01(1 - ear / threshold), progress: 1 };
          }
          this.blinkState = 'OPEN';
        } else {
          // Went back to closed — stay in CLOSED
          this.blinkState = 'CLOSED';
        }
        break;
    }

    // Progress heuristic
    const stateProgress: Record<BlinkState, number> = {
      OPEN: 0,
      CLOSING: 0.3,
      CLOSED: 0.6,
      OPENING: 0.9,
    };
    const progress = stateProgress[this.blinkState];
    const confidence = eyesClosed ? clamp01(1 - ear / threshold) : 0;

    return { detected: false, confidence, progress };
  }

  // ─── Smile Detection ────────────────────────────────────────────────────

  /**
   * Detect a sustained smile gesture.
   *
   * The smile must be maintained for at least 300 ms to count.
   *
   * @param landmarks Full 468-point landmark set.
   * @returns Detection result with confidence and progress.
   */
  public detectSmile(landmarks: LandmarkSet): ChallengeDetectionResult {
    const mouthState = this.getMouthState(landmarks);
    const now = Date.now();

    if (mouthState.mouthWidthRatio > MAR_SMILE_THRESHOLD) {
      if (!this.isCurrentlySmiling) {
        this.isCurrentlySmiling = true;
        this.smileStartTimestamp = now;
      }
      const elapsed = now - this.smileStartTimestamp;
      const progress = clamp01(elapsed / ActiveChallengeDetector.SMILE_SUSTAIN_MS);
      const confidence = clamp01(
        (mouthState.mouthWidthRatio - MAR_SMILE_THRESHOLD) /
          (1 - MAR_SMILE_THRESHOLD),
      );

      if (elapsed >= ActiveChallengeDetector.SMILE_SUSTAIN_MS) {
        return { detected: true, confidence, progress: 1 };
      }
      return { detected: false, confidence, progress };
    }

    // Smile interrupted
    this.isCurrentlySmiling = false;
    this.smileStartTimestamp = 0;
    return { detected: false, confidence: 0, progress: 0 };
  }

  // ─── Head Turn Detection ────────────────────────────────────────────────

  /**
   * Detect a sustained head turn to the left or right.
   *
   * The head must remain turned for at least 500 ms.
   *
   * @param landmarks Full 468-point landmark set.
   * @param direction Which direction to check ('LEFT' or 'RIGHT').
   * @returns Detection result with confidence and progress.
   */
  public detectHeadTurn(
    landmarks: LandmarkSet,
    direction: 'LEFT' | 'RIGHT',
  ): ChallengeDetectionResult {
    const noseTip = landmarks[NOSE_TIP_INDEX];
    const leftCheek = landmarks[FACE_WIDTH_INDICES.leftCheek];
    const rightCheek = landmarks[FACE_WIDTH_INDICES.rightCheek];

    const centerX = (leftCheek.x + rightCheek.x) / 2;
    const faceWidth = dist2D(leftCheek, rightCheek);
    if (faceWidth === 0) {
      return { detected: false, confidence: 0, progress: 0 };
    }

    const displacement = noseTip.x - centerX;
    const normDisplacement = displacement / faceWidth;
    const now = Date.now();

    const isTurned =
      direction === 'LEFT'
        ? normDisplacement < -HEAD_TURN_THRESHOLD
        : normDisplacement > HEAD_TURN_THRESHOLD;

    if (isTurned) {
      if (this.headTurnDirection !== direction) {
        // Just entered the correct turn zone
        this.headTurnDirection = direction;
        this.headTurnStartTimestamp = now;
      }

      const elapsed = now - this.headTurnStartTimestamp;
      const progress = clamp01(elapsed / ActiveChallengeDetector.HEAD_TURN_SUSTAIN_MS);
      const confidence = clamp01(Math.abs(normDisplacement) / (HEAD_TURN_THRESHOLD * 2));

      if (elapsed >= ActiveChallengeDetector.HEAD_TURN_SUSTAIN_MS) {
        return { detected: true, confidence, progress: 1 };
      }
      return { detected: false, confidence, progress };
    }

    // Not in the correct direction — reset
    if (this.headTurnDirection === direction) {
      this.headTurnDirection = null;
      this.headTurnStartTimestamp = 0;
    }
    return { detected: false, confidence: 0, progress: 0 };
  }

  // ─── Nod Detection ──────────────────────────────────────────────────────

  /**
   * Detect a nod gesture (up → center → down → center).
   *
   * Must complete the full four-phase cycle within 2 000 ms.
   *
   * @param landmarks Full 468-point landmark set.
   * @returns Detection result with confidence and progress.
   */
  public detectNod(landmarks: LandmarkSet): ChallengeDetectionResult {
    const noseTip = landmarks[NOSE_TIP_INDEX];
    const forehead = landmarks[FACE_HEIGHT_INDICES.forehead];
    const chin = landmarks[FACE_HEIGHT_INDICES.chin];
    const faceHeight = dist2D(forehead, chin);

    if (faceHeight === 0) {
      return { detected: false, confidence: 0, progress: 0 };
    }

    const displacementThreshold = faceHeight * NOD_THRESHOLD;
    const now = Date.now();
    const noseY = noseTip.y;

    // Timeout check
    if (
      this.nodState.phase !== 'IDLE' &&
      now - this.nodState.startTimestamp > ActiveChallengeDetector.NOD_MAX_DURATION_MS
    ) {
      this.resetNodState();
      return { detected: false, confidence: 0, progress: 0 };
    }

    const phaseProgress: Record<NodPhase, number> = {
      IDLE: 0,
      UP: 0.25,
      CENTER_AFTER_UP: 0.5,
      DOWN: 0.75,
      CENTER_AFTER_DOWN: 1,
    };

    switch (this.nodState.phase) {
      case 'IDLE': {
        // Establish baseline and wait for upward motion
        this.nodState.baselineY = noseY;
        this.nodState.startTimestamp = now;
        // Detect initial upward motion (nose Y decreases = up in screen coords)
        if (noseY < this.nodState.baselineY - displacementThreshold) {
          this.nodState.phase = 'UP';
          this.nodState.startTimestamp = now;
        }
        break;
      }

      case 'UP': {
        // Wait for return to center
        if (Math.abs(noseY - this.nodState.baselineY) < displacementThreshold * 0.5) {
          this.nodState.phase = 'CENTER_AFTER_UP';
        }
        break;
      }

      case 'CENTER_AFTER_UP': {
        // Wait for downward motion
        if (noseY > this.nodState.baselineY + displacementThreshold) {
          this.nodState.phase = 'DOWN';
        }
        break;
      }

      case 'DOWN': {
        // Wait for return to center
        if (Math.abs(noseY - this.nodState.baselineY) < displacementThreshold * 0.5) {
          this.nodState.phase = 'CENTER_AFTER_DOWN';
          this.nodState.completed = true;
        }
        break;
      }

      case 'CENTER_AFTER_DOWN': {
        // Completed — report detection and reset
        const elapsed = now - this.nodState.startTimestamp;
        const confidence = clamp01(1 - elapsed / ActiveChallengeDetector.NOD_MAX_DURATION_MS);
        this.resetNodState();
        return { detected: true, confidence, progress: 1 };
      }
    }

    const currentProgress = phaseProgress[this.nodState.phase];
    const displacement = Math.abs(noseY - this.nodState.baselineY);
    const confidence = clamp01(displacement / (displacementThreshold * 2));

    return { detected: false, confidence, progress: currentProgress };
  }

  // ─── Reset Methods ──────────────────────────────────────────────────────

  /** Reset the blink detector state. */
  public resetBlink(): void {
    this.blinkState = 'OPEN';
    this.blinkCloseTimestamp = 0;
    this.lastBlinkTimestamp = 0;
  }

  /** Reset the smile detector state. */
  public resetSmile(): void {
    this.isCurrentlySmiling = false;
    this.smileStartTimestamp = 0;
  }

  /** Reset the head-turn detector state. */
  public resetHeadTurn(): void {
    this.headTurnDirection = null;
    this.headTurnStartTimestamp = 0;
  }

  /** Reset the nod detector state. */
  public resetNod(): void {
    this.resetNodState();
  }

  /** Reset all detector states. */
  public resetAll(): void {
    this.resetBlink();
    this.resetSmile();
    this.resetHeadTurn();
    this.resetNod();
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private resetNodState(): void {
    this.nodState = {
      phase: 'IDLE',
      startTimestamp: 0,
      baselineY: 0,
      completed: false,
    };
  }
}
