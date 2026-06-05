/**
 * NHAI FaceAuth — Challenge Manager
 *
 * Orchestrates the active-liveness flow:
 * 1. Randomly select 1–2 challenges per session.
 * 2. Drive each through a state machine:
 *    IDLE → INSTRUCTING (2 s) → WAITING → DETECTING → COMPLETED / TIMEOUT
 * 3. Aggregate results into a `ChallengeSession`.
 *
 * Ensures the same challenge combination is never repeated within a
 * configurable cooldown window (default 5 min).
 *
 * @module ChallengeManager
 */

import type { Point3D, ChallengeType, ChallengeState, ChallengeResult } from '../../types';
import {
  CHALLENGE_TIMEOUT_MS,
  MIN_CHALLENGES_PER_SESSION,
  MAX_CHALLENGES_PER_SESSION,
  CHALLENGE_COOLDOWN_MS,
} from '../../constants/config';
import type {
  ChallengeSession,
  AssignedChallenge,
  ChallengeHistoryEntry,
  ChallengeDetectionResult,
  LandmarkSet,
} from './types';
import { ActiveChallengeDetector } from './ActiveChallenge';

// ─── Constants ───────────────────────────────────────────────────────────────

/** All possible challenge types that can be assigned. */
const ALL_CHALLENGE_TYPES: ChallengeType[] = [
  'BLINK',
  'SMILE',
  'HEAD_TURN_LEFT',
  'HEAD_TURN_RIGHT',
  'NOD',
];

/** Duration of the instruction phase (ms). */
const INSTRUCTION_DURATION_MS = 2000;

/** Maximum number of history entries to retain. */
const MAX_HISTORY_SIZE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a UUID-v4 style identifier. */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Fisher–Yates shuffle (in-place).
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Create a canonical key from a combination so that order doesn't matter.
 */
function combinationKey(types: ChallengeType[]): string {
  return [...types].sort().join(',');
}

// ─── Class ───────────────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of a liveness-challenge session.
 *
 * Usage:
 * ```ts
 * const mgr = new ChallengeManager();
 * const session = mgr.startSession(false);
 * // per camera frame:
 * const result = mgr.processFrame(landmarks);
 * console.log(mgr.getInstructionText(), mgr.getProgress());
 * ```
 */
export class ChallengeManager {
  /** Internal challenge detector instance. */
  private detector: ActiveChallengeDetector;

  /** Currently active session (null when IDLE). */
  private session: ChallengeSession | null = null;

  /** Timestamp when the current challenge entered INSTRUCTING. */
  private instructionStartTime = 0;

  /** Timestamp when the current challenge entered DETECTING. */
  private detectingStartTime = 0;

  /** History of recently assigned challenge combinations. */
  private history: ChallengeHistoryEntry[] = [];

  /** Whether the current subject wears glasses (lowers EAR threshold). */
  private glassesMode = false;

  constructor() {
    this.detector = new ActiveChallengeDetector();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Start a new liveness-check session.
   *
   * Selects 1–2 random challenges that have not been used together within the
   * cooldown window and initialises the session state machine.
   *
   * @param glassesDetected Whether the subject is wearing glasses.
   * @returns A fresh `ChallengeSession`.
   */
  public startSession(glassesDetected: boolean): ChallengeSession {
    this.glassesMode = glassesDetected;
    this.detector.resetAll();

    const selectedTypes = this.selectChallenges();
    const challenges: AssignedChallenge[] = selectedTypes.map(type => ({
      type,
      state: 'IDLE' as ChallengeState,
      startedAt: 0,
      completedAt: null,
      confidence: 0,
      durationMs: null,
    }));

    this.session = {
      sessionId: uuid(),
      challenges,
      currentChallengeIndex: 0,
      glassesDetected,
      state: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      overallConfidence: 0,
    };

    // Record combination in history
    this.recordCombination(selectedTypes);

    // Immediately transition the first challenge to INSTRUCTING
    this.transitionCurrentChallenge('INSTRUCTING');

    return { ...this.session };
  }

  /**
   * Process one camera frame through the active challenge detector.
   *
   * Drives the session state machine and returns a `ChallengeResult` for
   * the challenge currently being evaluated.
   *
   * @param landmarks Full 468-point face-mesh landmark set.
   * @returns Current challenge result, or `null` if no session is active.
   */
  public processFrame(landmarks: Point3D[]): ChallengeResult | null {
    if (!this.session || this.session.state !== 'IN_PROGRESS') {
      return null;
    }

    const challenge = this.currentChallenge();
    if (!challenge) return null;

    const now = Date.now();

    switch (challenge.state) {
      case 'IDLE':
        // Should have been transitioned on startSession — defensive
        this.transitionCurrentChallenge('INSTRUCTING');
        return this.buildResult(challenge);

      case 'INSTRUCTING': {
        const elapsed = now - this.instructionStartTime;
        if (elapsed >= INSTRUCTION_DURATION_MS) {
          this.transitionCurrentChallenge('WAITING');
        }
        return this.buildResult(challenge);
      }

      case 'WAITING':
        // Transition to DETECTING on first frame with landmarks
        if (landmarks.length >= 468) {
          this.transitionCurrentChallenge('DETECTING');
        }
        return this.buildResult(challenge);

      case 'DETECTING': {
        // Timeout check
        if (now - this.detectingStartTime > CHALLENGE_TIMEOUT_MS) {
          this.transitionCurrentChallenge('TIMEOUT');
          return this.buildResult(challenge);
        }

        const detection = this.runDetector(challenge.type, landmarks as LandmarkSet);
        challenge.confidence = Math.max(challenge.confidence, detection.confidence);

        if (detection.detected) {
          challenge.completedAt = now;
          challenge.durationMs = now - challenge.startedAt;
          challenge.confidence = detection.confidence;
          this.transitionCurrentChallenge('COMPLETED');
          this.advanceOrFinish();
        }

        return this.buildResult(challenge);
      }

      case 'COMPLETED':
      case 'TIMEOUT':
      case 'FAILED':
        return this.buildResult(challenge);

      default:
        return null;
    }
  }

  /**
   * Returns human-readable instruction text for the current challenge.
   *
   * @returns Localised string describing what the user should do.
   */
  public getInstructionText(): string {
    const challenge = this.currentChallenge();
    if (!challenge) return '';

    if (challenge.state === 'COMPLETED') return 'Great job! ✓';
    if (challenge.state === 'TIMEOUT') return 'Time ran out — try again';
    if (challenge.state === 'FAILED') return 'Challenge failed — try again';

    const instructions: Record<ChallengeType, string> = {
      BLINK: 'Please blink your eyes',
      SMILE: 'Please smile naturally',
      HEAD_TURN_LEFT: 'Slowly turn your head to the left',
      HEAD_TURN_RIGHT: 'Slowly turn your head to the right',
      NOD: 'Slowly nod your head up and down',
    };

    if (challenge.state === 'INSTRUCTING') {
      return `Get ready: ${instructions[challenge.type]}`;
    }

    return instructions[challenge.type];
  }

  /**
   * Returns 0–1 progress of the entire session.
   *
   * @returns Normalised progress value.
   */
  public getProgress(): number {
    if (!this.session) return 0;
    const total = this.session.challenges.length;
    if (total === 0) return 0;

    let completedWeight = 0;
    for (let i = 0; i < total; i++) {
      const ch = this.session.challenges[i];
      if (ch.state === 'COMPLETED') {
        completedWeight += 1;
      } else if (i === this.session.currentChallengeIndex) {
        // Current in-progress challenge contributes partial progress
        const detection = this.getLastDetectionProgress(ch);
        completedWeight += detection;
      }
    }

    return Math.min(1, completedWeight / total);
  }

  /**
   * Get the current session object (snapshot).
   *
   * @returns A copy of the current session, or `null`.
   */
  public getSession(): ChallengeSession | null {
    return this.session ? { ...this.session } : null;
  }

  /**
   * Check whether the session has concluded (all challenges completed
   * or any has timed-out / failed).
   *
   * @returns `true` when the session is in a terminal state.
   */
  public isSessionComplete(): boolean {
    return (
      this.session !== null &&
      (this.session.state === 'PASSED' || this.session.state === 'FAILED')
    );
  }

  /**
   * Reset the manager to its idle state, discarding any active session.
   */
  public reset(): void {
    this.session = null;
    this.instructionStartTime = 0;
    this.detectingStartTime = 0;
    this.glassesMode = false;
    this.detector.resetAll();
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Select 1–2 challenges ensuring the combination was not used
   * within the cooldown window.
   */
  private selectChallenges(): ChallengeType[] {
    const count =
      MIN_CHALLENGES_PER_SESSION +
      Math.floor(Math.random() * (MAX_CHALLENGES_PER_SESSION - MIN_CHALLENGES_PER_SESSION + 1));

    const now = Date.now();

    // Prune stale history entries
    this.history = this.history.filter(
      h => now - h.timestamp < CHALLENGE_COOLDOWN_MS,
    );

    const recentKeys = new Set(this.history.map(h => h.combination));

    // Try random shuffles (bounded attempts to avoid infinite loops)
    for (let attempt = 0; attempt < 100; attempt++) {
      const shuffled = shuffle([...ALL_CHALLENGE_TYPES]);
      const selected = shuffled.slice(0, count);
      const key = combinationKey(selected);
      if (!recentKeys.has(key)) {
        return selected;
      }
    }

    // Fallback: if all combinations are exhausted (very unlikely with
    // 5 types and 1-2 selections), clear history and pick fresh.
    this.history = [];
    return shuffle([...ALL_CHALLENGE_TYPES]).slice(0, count);
  }

  /**
   * Record a challenge combination in the history ring-buffer.
   */
  private recordCombination(types: ChallengeType[]): void {
    this.history.push({
      combination: combinationKey(types),
      timestamp: Date.now(),
    });
    // Trim history
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history = this.history.slice(-MAX_HISTORY_SIZE);
    }
  }

  /**
   * Transition the current challenge to a new state.
   */
  private transitionCurrentChallenge(newState: ChallengeState): void {
    const challenge = this.currentChallenge();
    if (!challenge) return;

    challenge.state = newState;
    const now = Date.now();

    switch (newState) {
      case 'INSTRUCTING':
        this.instructionStartTime = now;
        challenge.startedAt = now;
        this.resetDetectorForType(challenge.type);
        break;
      case 'DETECTING':
        this.detectingStartTime = now;
        break;
      case 'TIMEOUT':
      case 'FAILED':
        challenge.completedAt = now;
        challenge.durationMs = now - challenge.startedAt;
        break;
    }
  }

  /**
   * After a challenge completes, advance to the next one or finalise.
   */
  private advanceOrFinish(): void {
    if (!this.session) return;

    const nextIndex = this.session.currentChallengeIndex + 1;
    if (nextIndex < this.session.challenges.length) {
      // Move to next challenge
      this.session.currentChallengeIndex = nextIndex;
      this.transitionCurrentChallenge('INSTRUCTING');
    } else {
      // All challenges done — compute overall result
      this.finaliseSession();
    }
  }

  /**
   * Compute overall session result from individual challenge outcomes.
   */
  private finaliseSession(): void {
    if (!this.session) return;

    const allCompleted = this.session.challenges.every(
      c => c.state === 'COMPLETED',
    );
    const anyTimedOut = this.session.challenges.some(
      c => c.state === 'TIMEOUT' || c.state === 'FAILED',
    );

    if (allCompleted) {
      this.session.state = 'PASSED';
      const total = this.session.challenges.reduce(
        (sum, c) => sum + c.confidence,
        0,
      );
      this.session.overallConfidence =
        total / this.session.challenges.length;
    } else if (anyTimedOut) {
      this.session.state = 'FAILED';
      this.session.overallConfidence = 0;
    }
  }

  /**
   * Get the challenge currently being evaluated.
   */
  private currentChallenge(): AssignedChallenge | null {
    if (!this.session) return null;
    return (
      this.session.challenges[this.session.currentChallengeIndex] ?? null
    );
  }

  /**
   * Run the appropriate detector for a challenge type.
   */
  private runDetector(
    type: ChallengeType,
    landmarks: LandmarkSet,
  ): ChallengeDetectionResult {
    switch (type) {
      case 'BLINK':
        return this.detector.detectBlink(landmarks, this.glassesMode);
      case 'SMILE':
        return this.detector.detectSmile(landmarks);
      case 'HEAD_TURN_LEFT':
        return this.detector.detectHeadTurn(landmarks, 'LEFT');
      case 'HEAD_TURN_RIGHT':
        return this.detector.detectHeadTurn(landmarks, 'RIGHT');
      case 'NOD':
        return this.detector.detectNod(landmarks);
    }
  }

  /**
   * Reset the internal detector state relevant to a specific challenge.
   */
  private resetDetectorForType(type: ChallengeType): void {
    switch (type) {
      case 'BLINK':
        this.detector.resetBlink();
        break;
      case 'SMILE':
        this.detector.resetSmile();
        break;
      case 'HEAD_TURN_LEFT':
      case 'HEAD_TURN_RIGHT':
        this.detector.resetHeadTurn();
        break;
      case 'NOD':
        this.detector.resetNod();
        break;
    }
  }

  /**
   * Build a `ChallengeResult` from the internal challenge state.
   */
  private buildResult(challenge: AssignedChallenge): ChallengeResult {
    return {
      type: challenge.type,
      state: challenge.state,
      startTime: challenge.startedAt,
      endTime: challenge.completedAt ?? undefined,
      durationMs: challenge.durationMs ?? undefined,
      confidence: challenge.confidence,
      passed: challenge.state === 'COMPLETED',
    };
  }

  /**
   * Helper: estimate partial progress of the current in-progress challenge.
   * Returns 0 if no detection metrics are available yet.
   */
  private getLastDetectionProgress(challenge: AssignedChallenge): number {
    // State-based heuristic
    switch (challenge.state) {
      case 'IDLE':
        return 0;
      case 'INSTRUCTING':
        return 0.05;
      case 'WAITING':
        return 0.1;
      case 'DETECTING': {
        // Use elapsed time as a rough proxy when we don't have the
        // per-frame detection result cached.
        const elapsed = Date.now() - this.detectingStartTime;
        return Math.min(0.9, 0.1 + (elapsed / CHALLENGE_TIMEOUT_MS) * 0.8);
      }
      case 'COMPLETED':
        return 1;
      case 'TIMEOUT':
      case 'FAILED':
        return 0;
      default:
        return 0;
    }
  }
}
