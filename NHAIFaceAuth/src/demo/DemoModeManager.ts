/**
 * NHAI FaceAuth — Demo Mode Manager
 *
 * Enables realistic authentication demonstrations without requiring camera hardware
 * or TFLite models. Critical for hackathon presentations and judging.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AuthenticationResult,
  ChallengeType,
  FailureReason,
} from '../types';
import { DemoUserDatabase } from './DemoUserDatabase';
import { DemoScenarios } from './DemoScenarios';

const DEMO_MODE_KEY = '@nhai_faceauth:demo_mode';
const DEMO_CONFIG_KEY = '@nhai_faceauth:demo_config';

export interface DemoConfig {
  enabled: boolean;
  scenario: DemoScenarioType;
  simulatedLatency: number; // milliseconds
  autoProgress: boolean;
  showDebugInfo: boolean;
  mockGPS: { latitude: number; longitude: number };
  persistLogs: boolean;
}

export type DemoScenarioType =
  | 'success'
  | 'liveness_failure'
  | 'spoof_detected'
  | 'no_match'
  | 'multiple_faces';

export interface DemoStep {
  stage: string;
  duration: number; // milliseconds
  message: string;
  visualFeedback: 'green' | 'yellow' | 'red';
}

/**
 * Manages demo mode configuration and simulated authentication flows
 */
export class DemoModeManager {
  private static instance: DemoModeManager;
  private config: DemoConfig;
  private demoUsers = DemoUserDatabase.getUsers();

  private constructor() {
    this.config = this.getDefaultConfig();
  }

  static getInstance(): DemoModeManager {
    if (!DemoModeManager.instance) {
      DemoModeManager.instance = new DemoModeManager();
    }
    return DemoModeManager.instance;
  }

  /**
   * Get default demo configuration
   */
  private getDefaultConfig(): DemoConfig {
    return {
      enabled: false,
      scenario: 'success',
      simulatedLatency: 800, // 800ms total (feels realistic)
      autoProgress: true,
      showDebugInfo: false,
      mockGPS: {
        latitude: 28.6139, // Delhi coordinates
        longitude: 77.209,
      },
      persistLogs: true,
    };
  }

  /**
   * Initialize demo mode from persistent storage
   */
  async initialize(): Promise<void> {
    try {
      const storedEnabled = await AsyncStorage.getItem(DEMO_MODE_KEY);
      const storedConfig = await AsyncStorage.getItem(DEMO_CONFIG_KEY);

      if (storedEnabled) {
        this.config.enabled = storedEnabled === 'true';
      }

      if (storedConfig) {
        const parsed = JSON.parse(storedConfig);
        this.config = { ...this.config, ...parsed };
      }
    } catch (error) {
      console.warn('[DemoMode] Failed to load config from storage:', error);
      // Fall back to default config
    }
  }

  /**
   * Enable or disable demo mode
   */
  async setDemoMode(enabled: boolean): Promise<void> {
    this.config.enabled = enabled;
    try {
      await AsyncStorage.setItem(DEMO_MODE_KEY, enabled ? 'true' : 'false');
    } catch (error) {
      console.error('[DemoMode] Failed to persist demo mode state:', error);
    }
  }

  /**
   * Check if demo mode is currently enabled
   */
  isDemoMode(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current demo configuration
   */
  getConfig(): DemoConfig {
    return { ...this.config };
  }

  /**
   * Update demo configuration
   */
  async updateConfig(updates: Partial<DemoConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    
    try {
      await AsyncStorage.setItem(DEMO_CONFIG_KEY, JSON.stringify(this.config));
    } catch (error) {
      console.error('[DemoMode] Failed to persist config:', error);
    }
  }

  /**
   * Load a specific demo scenario
   */
  async loadScenario(scenario: DemoScenarioType): Promise<void> {
    await this.updateConfig({ scenario });
  }

  /**
   * Get available demo users
   */
  getDemoUsers() {
    return this.demoUsers;
  }

  /**
   * Simulate a complete authentication flow with realistic timing
   */
  async simulateAuthentication(): Promise<AuthenticationResult> {
    if (!this.config.enabled) {
      throw new Error('Demo mode is not enabled');
    }

    const scenario = DemoScenarios.getScenario(this.config.scenario);
    const steps = scenario.steps;

    // Distribute latency across steps
    const totalStepDuration = steps.reduce((sum, step) => sum + step.duration, 0);
    const latencyScale = this.config.simulatedLatency / totalStepDuration;

    // Progress through steps
    for (const step of steps) {
      const scaledDuration = step.duration * latencyScale;
      await this.delay(scaledDuration);
      
      if (this.config.showDebugInfo) {
        console.log(`[Demo] ${step.stage}: ${step.message} (${scaledDuration}ms)`);
      }
    }

    // Generate final result based on scenario
    return this.generateResult(scenario.expectedOutcome);
  }

  /**
   * Simulate a specific failure scenario
   */
  async simulateFailure(reason: FailureReason): Promise<AuthenticationResult> {
    await this.delay(this.config.simulatedLatency * 0.7);

    return {
      success: false,
      userId: null,
      userName: null,
      matchConfidence: 0.4 + Math.random() * 0.2,
      livenessConfidence: reason === 'LIVENESS_FAILED' ? 0.3 : 0.8,
      antiSpoofScore: reason === 'SPOOF_DETECTED' ? 0.2 : 0.9,
      challengesUsed: this.getRandomChallenges(),
      failureReason: reason,
      processingTimeMs: this.config.simulatedLatency * 0.7,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get demo scenario steps for UI display
   */
  getScenarioSteps(scenario: DemoScenarioType): DemoStep[] {
    return DemoScenarios.getScenario(scenario).steps;
  }

  /**
   * Generate authentication result based on scenario outcome
   */
  private generateResult(outcome: 'success' | 'failure'): AuthenticationResult {
    if (outcome === 'success') {
      // Pick a random demo user
      const user = this.demoUsers[Math.floor(Math.random() * this.demoUsers.length)];

      return {
        success: true,
        userId: user.id,
        userName: user.name,
        matchConfidence: 0.92 + Math.random() * 0.08,
        livenessConfidence: 0.95 + Math.random() * 0.05,
        antiSpoofScore: 0.96 + Math.random() * 0.04,
        challengesUsed: this.getRandomChallenges(),
        failureReason: null,
        processingTimeMs: this.config.simulatedLatency,
        timestamp: new Date().toISOString(),
      };
    } else {
      // Failure based on current scenario
      const failureReasons: Record<DemoScenarioType, FailureReason> = {
        success: 'NO_MATCH', // Shouldn't happen
        liveness_failure: 'LIVENESS_FAILED',
        spoof_detected: 'SPOOF_DETECTED',
        no_match: 'NO_MATCH',
        multiple_faces: 'MULTIPLE_FACES',
      };

      return {
        success: false,
        userId: null,
        userName: null,
        matchConfidence: 0.4 + Math.random() * 0.3,
        livenessConfidence: 0.4 + Math.random() * 0.3,
        antiSpoofScore: this.config.scenario === 'spoof_detected' ? 0.15 + Math.random() * 0.1 : 0.8,
        challengesUsed: this.getRandomChallenges(),
        failureReason: failureReasons[this.config.scenario],
        processingTimeMs: this.config.simulatedLatency * 0.8,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get random challenges for demo
   */
  private getRandomChallenges(): ChallengeType[] {
    const allChallenges: ChallengeType[] = ['blink', 'smile', 'turn_left', 'turn_right', 'nod'];
    const count = 1 + Math.floor(Math.random() * 2); // 1-2 challenges
    
    const shuffled = [...allChallenges].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Get mock GPS coordinates with slight randomization
   */
  getMockGPS(): { latitude: number; longitude: number } {
    return {
      latitude: this.config.mockGPS.latitude + (Math.random() - 0.5) * 0.01,
      longitude: this.config.mockGPS.longitude + (Math.random() - 0.5) * 0.01,
    };
  }

  /**
   * Generate demo device ID
   */
  getDemoDeviceId(): string {
    return `demo_device_${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * Delay helper for simulated timing
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset demo mode to defaults
   */
  async reset(): Promise<void> {
    this.config = this.getDefaultConfig();
    try {
      await AsyncStorage.removeItem(DEMO_MODE_KEY);
      await AsyncStorage.removeItem(DEMO_CONFIG_KEY);
    } catch (error) {
      console.error('[DemoMode] Failed to clear storage:', error);
    }
  }

  /**
   * Get demo mode statistics (for UI display)
   */
  getStatistics() {
    return {
      totalDemoUsers: this.demoUsers.length,
      currentScenario: this.config.scenario,
      simulatedLatency: this.config.simulatedLatency,
      demoModeEnabled: this.config.enabled,
    };
  }
}
