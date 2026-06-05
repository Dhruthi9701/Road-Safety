/**
 * NHAI FaceAuth — Mock Data Factory for Testing
 *
 * Generates realistic test data matching production formats for unit and integration tests.
 * All mock data is deterministic when using seeded random generation.
 */

import type {
  FaceDetectionResult,
  BoundingBox,
  FaceKeypoints,
  Point2D,
  EnrolledUser,
  AuthLog,
} from '../../src/types';

export class MockDataFactory {
  private static seed = 12345; // Default seed for reproducible tests

  /**
   * Set the random seed for reproducible mock data generation
   */
  static setSeed(seed: number): void {
    MockDataFactory.seed = seed;
  }

  /**
   * Simple seeded random number generator (LCG)
   */
  private static random(): number {
    MockDataFactory.seed = (MockDataFactory.seed * 1664525 + 1013904223) % 2 ** 32;
    return MockDataFactory.seed / 2 ** 32;
  }

  /**
   * Generate random integer in range [min, max]
   */
  private static randomInt(min: number, max: number): number {
    return Math.floor(MockDataFactory.random() * (max - min + 1)) + min;
  }

  /**
   * Generate mock camera frame as Float32Array
   * @param width Frame width in pixels
   * @param height Frame height in pixels
   * @param pattern 'solid' | 'gradient' | 'noise' | 'face-like'
   * @returns Float32Array with RGB values [0, 1]
   */
  static generateMockFrame(
    width: number,
    height: number,
    pattern: 'solid' | 'gradient' | 'noise' | 'face-like' = 'solid',
  ): Float32Array {
    const pixels = new Float32Array(width * height * 3);

    switch (pattern) {
      case 'solid':
        // Solid gray color
        pixels.fill(0.5);
        break;

      case 'gradient':
        // Vertical gradient from dark to light
        for (let y = 0; y < height; y++) {
          const brightness = y / height;
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            pixels[idx] = brightness; // R
            pixels[idx + 1] = brightness; // G
            pixels[idx + 2] = brightness; // B
          }
        }
        break;

      case 'noise':
        // Random noise
        for (let i = 0; i < pixels.length; i++) {
          pixels[i] = MockDataFactory.random();
        }
        break;

      case 'face-like':
        // Simple ellipse in center (face-like shape)
        const centerX = width / 2;
        const centerY = height / 2;
        const radiusX = width / 4;
        const radiusY = height / 3;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const dx = (x - centerX) / radiusX;
            const dy = (y - centerY) / radiusY;
            const inEllipse = dx * dx + dy * dy < 1;
            const idx = (y * width + x) * 3;

            if (inEllipse) {
              // Skin tone inside ellipse
              pixels[idx] = 0.8; // R
              pixels[idx + 1] = 0.6; // G
              pixels[idx + 2] = 0.5; // B
            } else {
              // Background
              pixels[idx] = 0.3;
              pixels[idx + 1] = 0.3;
              pixels[idx + 2] = 0.3;
            }
          }
        }
        break;
    }

    return pixels;
  }

  /**
   * Generate mock face landmarks (keypoints)
   * @param width Frame width for coordinate scaling
   * @param height Frame height for coordinate scaling
   * @returns FaceKeypoints with realistic positions
   */
  static generateMockLandmarks(width: number, height: number): FaceKeypoints {
    const centerX = width / 2;
    const centerY = height / 2;

    return {
      rightEye: { x: centerX - width * 0.1, y: centerY - height * 0.05 },
      leftEye: { x: centerX + width * 0.1, y: centerY - height * 0.05 },
      noseTip: { x: centerX, y: centerY },
      mouthCenter: { x: centerX, y: centerY + height * 0.1 },
      rightEarTragion: { x: centerX - width * 0.2, y: centerY },
      leftEarTragion: { x: centerX + width * 0.2, y: centerY },
    };
  }

  /**
   * Generate mock face detection result
   * @param width Frame width
   * @param height Frame height
   * @param detected Whether face should be detected
   * @param confidence Detection confidence [0, 1]
   * @returns FaceDetectionResult
   */
  static generateMockFaceDetection(
    width: number = 640,
    height: number = 480,
    detected: boolean = true,
    confidence: number = 0.95,
  ): FaceDetectionResult {
    if (!detected) {
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
        frameWidth: width,
        frameHeight: height,
        timestamp: Date.now(),
      };
    }

    // Generate centered bounding box
    const faceWidth = width * 0.4;
    const faceHeight = height * 0.5;
    const x = (width - faceWidth) / 2;
    const y = (height - faceHeight) / 2;

    return {
      detected: true,
      confidence: Math.max(0, Math.min(1, confidence)),
      boundingBox: { x, y, width: faceWidth, height: faceHeight },
      keypoints: MockDataFactory.generateMockLandmarks(width, height),
      frameWidth: width,
      frameHeight: height,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate mock face embedding vector
   * @param dimension Embedding dimension (default 128)
   * @param normalized Whether to L2-normalize the vector
   * @returns Float32Array embedding
   */
  static generateMockEmbedding(
    dimension: number = 128,
    normalized: boolean = true,
  ): Float32Array {
    const embedding = new Float32Array(dimension);

    // Generate random values
    for (let i = 0; i < dimension; i++) {
      embedding[i] = MockDataFactory.random() * 2 - 1; // Range [-1, 1]
    }

    if (normalized) {
      // L2 normalization
      let norm = 0;
      for (let i = 0; i < dimension; i++) {
        norm += embedding[i] * embedding[i];
      }
      norm = Math.sqrt(norm);

      if (norm > 0) {
        for (let i = 0; i < dimension; i++) {
          embedding[i] /= norm;
        }
      }
    }

    return embedding;
  }

  /**
   * Generate mock enrolled user
   * @param id User ID (optional, will be generated if not provided)
   * @param name User name (optional, will be generated if not provided)
   * @returns EnrolledUser
   */
  static generateMockUser(id?: string, name?: string): EnrolledUser {
    const userId = id || `user_${MockDataFactory.randomInt(1000, 9999)}`;
    const userName =
      name ||
      [
        'Ramesh Kumar',
        'Priya Singh',
        'Amit Patel',
        'Sunita Sharma',
        'Vijay Verma',
      ][MockDataFactory.randomInt(0, 4)];

    return {
      id: userId,
      name: userName,
      role: ['Worker', 'Supervisor', 'Engineer'][MockDataFactory.randomInt(0, 2)],
      zone: `Zone-${MockDataFactory.randomInt(1, 5)}`,
      embedding: MockDataFactory.generateMockEmbedding(128, true),
      enrollmentDate: new Date(2024, 0, MockDataFactory.randomInt(1, 28))
        .toISOString()
        .split('T')[0],
      photoCount: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate mock authentication log
   * @param userId User ID (null for failed auth)
   * @param result 'success' | 'failure'
   * @returns AuthLog
   */
  static generateMockAuthLog(
    userId: string | null = 'user_1234',
    result: 'success' | 'failure' = 'success',
  ): AuthLog {
    return {
      id: `log_${Date.now()}_${MockDataFactory.randomInt(1000, 9999)}`,
      timestamp: new Date().toISOString(),
      userId,
      latitude: 28.5 + MockDataFactory.random() * 0.1, // Delhi region
      longitude: 77.0 + MockDataFactory.random() * 0.1,
      matchConfidence: result === 'success' ? 0.9 + MockDataFactory.random() * 0.1 : 0.4 + MockDataFactory.random() * 0.2,
      livenessChallenge: ['blink', 'smile', 'turn_left'][MockDataFactory.randomInt(0, 2)],
      livenessScore: result === 'success' ? 0.85 + MockDataFactory.random() * 0.15 : 0.4 + MockDataFactory.random() * 0.3,
      antiSpoofScore: result === 'success' ? 0.9 + MockDataFactory.random() * 0.1 : 0.3 + MockDataFactory.random() * 0.4,
      result,
      failureReason: result === 'failure' ? ['NO_MATCH', 'LIVENESS_FAILED', 'SPOOF_DETECTED'][MockDataFactory.randomInt(0, 2)] : null,
      deviceId: `device_${MockDataFactory.randomInt(100, 999)}`,
      appVersion: '1.0.0',
      synced: false,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Generate multiple mock users
   * @param count Number of users to generate
   * @returns Array of EnrolledUser
   */
  static generateMockUsers(count: number): EnrolledUser[] {
    const users: EnrolledUser[] = [];
    for (let i = 0; i < count; i++) {
      users.push(MockDataFactory.generateMockUser(`user_${1000 + i}`));
    }
    return users;
  }

  /**
   * Generate multiple mock auth logs
   * @param count Number of logs to generate
   * @param successRate Ratio of successful vs failed authentications [0, 1]
   * @returns Array of AuthLog
   */
  static generateMockAuthLogs(count: number, successRate: number = 0.8): AuthLog[] {
    const logs: AuthLog[] = [];
    for (let i = 0; i < count; i++) {
      const isSuccess = MockDataFactory.random() < successRate;
      logs.push(
        MockDataFactory.generateMockAuthLog(
          isSuccess ? `user_${MockDataFactory.randomInt(1000, 1010)}` : null,
          isSuccess ? 'success' : 'failure',
        ),
      );
    }
    return logs;
  }

  /**
   * Validate that generated frame has correct dimensions
   */
  static validateFrame(pixels: Float32Array, width: number, height: number): boolean {
    const expectedLength = width * height * 3;
    if (pixels.length !== expectedLength) {
      console.error(
        `Frame validation failed: expected length ${expectedLength}, got ${pixels.length}`,
      );
      return false;
    }

    // Check all values are in [0, 1] range
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] < 0 || pixels[i] > 1) {
        console.error(`Frame validation failed: pixel value ${pixels[i]} out of range [0, 1]`);
        return false;
      }
    }

    return true;
  }

  /**
   * Validate face detection result
   */
  static validateFaceDetection(detection: FaceDetectionResult): boolean {
    if (detection.confidence < 0 || detection.confidence > 1) {
      console.error(`Confidence ${detection.confidence} out of range [0, 1]`);
      return false;
    }

    if (detection.detected) {
      const { boundingBox, frameWidth, frameHeight } = detection;
      if (
        boundingBox.x < 0 ||
        boundingBox.y < 0 ||
        boundingBox.x + boundingBox.width > frameWidth ||
        boundingBox.y + boundingBox.height > frameHeight
      ) {
        console.error('Bounding box out of frame bounds');
        return false;
      }
    }

    return true;
  }

  /**
   * Validate embedding vector
   */
  static validateEmbedding(embedding: Float32Array, expectedDim: number = 128): boolean {
    if (embedding.length !== expectedDim) {
      console.error(`Embedding dimension mismatch: expected ${expectedDim}, got ${embedding.length}`);
      return false;
    }

    // Check if normalized (L2 norm ≈ 1)
    let norm = 0;
    for (let i = 0; i < embedding.length; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);

    if (Math.abs(norm - 1.0) > 0.01) {
      console.warn(`Embedding not normalized: L2 norm = ${norm}`);
    }

    return true;
  }

  /**
   * Validate GPS coordinates
   */
  static validateGPS(lat: number | null, lon: number | null): boolean {
    if (lat === null || lon === null) {
      return true; // GPS not available is valid
    }

    if (lat < -90 || lat > 90) {
      console.error(`Latitude ${lat} out of range [-90, 90]`);
      return false;
    }

    if (lon < -180 || lon > 180) {
      console.error(`Longitude ${lon} out of range [-180, 180]`);
      return false;
    }

    return true;
  }
}
