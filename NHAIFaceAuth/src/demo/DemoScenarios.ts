/**
 * NHAI FaceAuth — Demo Scenarios
 *
 * Pre-configured demonstration scenarios with realistic timing and flow
 */

import type { DemoScenarioType, DemoStep } from './DemoModeManager';

interface DemoScenario {
  name: string;
  description: string;
  steps: DemoStep[];
  expectedOutcome: 'success' | 'failure';
}

/**
 * Demo scenario definitions with realistic pipeline timing
 */
export class DemoScenarios {
  /**
   * Get scenario by type
   */
  static getScenario(type: DemoScenarioType): DemoScenario {
    const scenarios: Record<DemoScenarioType, DemoScenario> = {
      success: this.getSuccessScenario(),
      liveness_failure: this.getLivenessFailureScenario(),
      spoof_detected: this.getSpoofDetectedScenario(),
      no_match: this.getNoMatchScenario(),
      multiple_faces: this.getMultipleFacesScenario(),
    };

    return scenarios[type];
  }

  /**
   * Success Flow Scenario
   * Total: ~800ms (face detected → liveness passed → match found)
   */
  private static getSuccessScenario(): DemoScenario {
    return {
      name: 'Successful Authentication',
      description: 'Complete authentication flow with face detection, liveness verification, and successful match',
      expectedOutcome: 'success',
      steps: [
        {
          stage: 'DETECTING_FACE',
          duration: 80, // 80ms - BlazeFace detection
          message: 'Detecting face...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'VALIDATING_FACE',
          duration: 40, // 40ms - Quality validation
          message: 'Validating face quality...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'FACE_VALID',
          duration: 50, // 50ms - Face stable
          message: 'Face detected — Hold still',
          visualFeedback: 'green',
        },
        {
          stage: 'LIVENESS_CHECK',
          duration: 200, // 200ms - Active challenge (blink)
          message: 'Please blink',
          visualFeedback: 'green',
        },
        {
          stage: 'LIVENESS_PASSIVE',
          duration: 150, // 150ms - Passive anti-spoof
          message: 'Checking liveness...',
          visualFeedback: 'green',
        },
        {
          stage: 'RECOGNIZING',
          duration: 180, // 180ms - Face recognition + matching
          message: 'Verifying identity...',
          visualFeedback: 'green',
        },
        {
          stage: 'RESULT_SUCCESS',
          duration: 100, // 100ms - Display result
          message: 'Authentication successful!',
          visualFeedback: 'green',
        },
      ],
    };
  }

  /**
   * Liveness Failure Scenario
   * Total: ~600ms (fails at liveness check)
   */
  private static getLivenessFailureScenario(): DemoScenario {
    return {
      name: 'Liveness Check Failed',
      description: 'Face detected but user fails to complete liveness challenge',
      expectedOutcome: 'failure',
      steps: [
        {
          stage: 'DETECTING_FACE',
          duration: 80,
          message: 'Detecting face...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'VALIDATING_FACE',
          duration: 40,
          message: 'Validating face quality...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'FACE_VALID',
          duration: 50,
          message: 'Face detected — Hold still',
          visualFeedback: 'green',
        },
        {
          stage: 'LIVENESS_CHECK',
          duration: 250,
          message: 'Please blink',
          visualFeedback: 'yellow',
        },
        {
          stage: 'LIVENESS_TIMEOUT',
          duration: 100,
          message: 'Liveness challenge timeout',
          visualFeedback: 'red',
        },
        {
          stage: 'RESULT_FAILURE',
          duration: 80,
          message: 'Liveness check failed. Please try again.',
          visualFeedback: 'red',
        },
      ],
    };
  }

  /**
   * Spoof Detected Scenario
   * Total: ~700ms (passes liveness, fails anti-spoof)
   */
  private static getSpoofDetectedScenario(): DemoScenario {
    return {
      name: 'Spoofing Attack Detected',
      description: 'Passive anti-spoofing model detects presentation attack (photo/video)',
      expectedOutcome: 'failure',
      steps: [
        {
          stage: 'DETECTING_FACE',
          duration: 80,
          message: 'Detecting face...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'VALIDATING_FACE',
          duration: 40,
          message: 'Validating face quality...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'FACE_VALID',
          duration: 50,
          message: 'Face detected — Hold still',
          visualFeedback: 'green',
        },
        {
          stage: 'LIVENESS_CHECK',
          duration: 200,
          message: 'Please turn your head left',
          visualFeedback: 'green',
        },
        {
          stage: 'LIVENESS_PASSIVE',
          duration: 180,
          message: 'Analyzing authenticity...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'SPOOF_DETECTED',
          duration: 100,
          message: 'Spoofing detected — presentation attack',
          visualFeedback: 'red',
        },
        {
          stage: 'RESULT_FAILURE',
          duration: 50,
          message: 'Access denied. Spoofing attempt detected.',
          visualFeedback: 'red',
        },
      ],
    };
  }

  /**
   * No Match Scenario
   * Total: ~750ms (completes full pipeline, no match in database)
   */
  private static getNoMatchScenario(): DemoScenario {
    return {
      name: 'Face Not Recognized',
      description: 'Liveness passed but face does not match any enrolled user',
      expectedOutcome: 'failure',
      steps: [
        {
          stage: 'DETECTING_FACE',
          duration: 80,
          message: 'Detecting face...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'VALIDATING_FACE',
          duration: 40,
          message: 'Validating face quality...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'FACE_VALID',
          duration: 50,
          message: 'Face detected — Hold still',
          visualFeedback: 'green',
        },
        {
          stage: 'LIVENESS_CHECK',
          duration: 200,
          message: 'Please smile',
          visualFeedback: 'green',
        },
        {
          stage: 'LIVENESS_PASSIVE',
          duration: 150,
          message: 'Checking liveness...',
          visualFeedback: 'green',
        },
        {
          stage: 'RECOGNIZING',
          duration: 180,
          message: 'Verifying identity...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'NO_MATCH',
          duration: 50,
          message: 'Face not recognized — No match in database',
          visualFeedback: 'red',
        },
      ],
    };
  }

  /**
   * Multiple Faces Scenario
   * Total: ~300ms (fails early at validation)
   */
  private static getMultipleFacesScenario(): DemoScenario {
    return {
      name: 'Multiple Faces Detected',
      description: 'More than one face detected in frame — security policy violation',
      expectedOutcome: 'failure',
      steps: [
        {
          stage: 'DETECTING_FACE',
          duration: 80,
          message: 'Detecting faces...',
          visualFeedback: 'yellow',
        },
        {
          stage: 'MULTIPLE_FACES',
          duration: 120,
          message: 'Multiple faces detected',
          visualFeedback: 'red',
        },
        {
          stage: 'RESULT_FAILURE',
          duration: 100,
          message: 'Only one person allowed. Please ensure single user.',
          visualFeedback: 'red',
        },
      ],
    };
  }

  /**
   * Get all available scenarios (for UI selection)
   */
  static getAllScenarios(): Array<{ type: DemoScenarioType; name: string; description: string }> {
    return [
      {
        type: 'success',
        name: 'Successful Authentication',
        description: 'Complete successful flow',
      },
      {
        type: 'liveness_failure',
        name: 'Liveness Check Failed',
        description: 'User fails liveness challenge',
      },
      {
        type: 'spoof_detected',
        name: 'Spoofing Attack Detected',
        description: 'Anti-spoofing detects fake face',
      },
      {
        type: 'no_match',
        name: 'Face Not Recognized',
        description: 'Face not in database',
      },
      {
        type: 'multiple_faces',
        name: 'Multiple Faces Detected',
        description: 'Security policy violation',
      },
    ];
  }

  /**
   * Get estimated duration for a scenario
   */
  static getScenarioDuration(type: DemoScenarioType): number {
    const scenario = this.getScenario(type);
    return scenario.steps.reduce((total, step) => total + step.duration, 0);
  }
}
