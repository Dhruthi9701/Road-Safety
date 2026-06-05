/**
 * Unit Tests for FaceDetector
 * 
 * Tests the BlazeFace face detection module with mocked TFLite runtime
 */

import { FaceDetector } from '../../../src/modules/faceDetection/FaceDetector';
import { MockDataFactory } from '../../utils/MockDataFactory';

// Mock react-native-fast-tflite
jest.mock('react-native-fast-tflite', () => ({
  loadTensorflowModel: jest.fn(),
}));

import { loadTensorflowModel } from 'react-native-fast-tflite';

describe('FaceDetector', () => {
  let detector: FaceDetector;
  const mockTFLiteModel = {
    runSync: jest.fn(),
  };

  beforeAll(() => {
    // Mock TFLite model loading
    (loadTensorflowModel as jest.Mock).mockResolvedValue(mockTFLiteModel);
  });

  beforeEach(() => {
    detector = new FaceDetector();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (detector) {
      detector.dispose();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid config', async () => {
      await detector.initialize();
      expect(detector.isReady()).toBe(true);
      expect(detector.getState()).toBe('READY');
    });

    it('should handle model loading failure gracefully', async () => {
      (loadTensorflowModel as jest.Mock).mockRejectedValueOnce(
        new Error('Model not found'),
      );
      
      const newDetector = new FaceDetector();
      await newDetector.initialize();
      
      // Should fallback to CPU or enter ERROR state
      expect(['READY', 'ERROR']).toContain(newDetector.getState());
    });

    it('should skip re-initialization if already ready', async () => {
      await detector.initialize();
      const firstCallCount = (loadTensorflowModel as jest.Mock).mock.calls.length;
      
      await detector.initialize();
      const secondCallCount = (loadTensorflowModel as jest.Mock).mock.calls.length;
      
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('Face Detection', () => {
    beforeEach(async () => {
      await detector.initialize();
      
      // Mock successful face detection output
      mockTFLiteModel.runSync.mockReturnValue([
        // Regressors: [896 x 17] = 15232 values
        new Float32Array(15232).fill(0.1),
        // Classificators: [896 x 1] = 896 values with high confidence
        new Float32Array(896).fill(2.0), // logit = 2.0, sigmoid ≈ 0.88
      ]);
    });

    it('should detect face in valid frame', () => {
      const frame = MockDataFactory.generateMockFrame(128, 128, 'face-like');
      const result = detector.detectFace(frame, 640, 480);

      expect(result.detected).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.boundingBox.width).toBeGreaterThan(0);
      expect(result.boundingBox.height).toBeGreaterThan(0);
      expect(result.keypoints.rightEye).toBeDefined();
      expect(result.keypoints.leftEye).toBeDefined();
      expect(result.keypoints.noseTip).toBeDefined();
    });

    it('should not detect face in empty frame', () => {
      // Mock no detection (low confidence)
      mockTFLiteModel.runSync.mockReturnValue([
        new Float32Array(15232).fill(0),
        new Float32Array(896).fill(-5.0), // logit = -5.0, sigmoid ≈ 0.007
      ]);

      const frame = MockDataFactory.generateMockFrame(128, 128, 'solid');
      const result = detector.detectFace(frame, 640, 480);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should handle invalid frame dimensions', () => {
      const frame = new Float32Array(100); // Wrong size
      const result = detector.detectFace(frame, 640, 480);

      // Should return empty result or handle gracefully
      expect(result).toBeDefined();
      expect(result.frameWidth).toBe(640);
      expect(result.frameHeight).toBe(480);
    });

    it('should complete detection in under 10ms', async () => {
      const frame = MockDataFactory.generateMockFrame(128, 128, 'face-like');
      
      const iterations = 10;
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        detector.detectFace(frame, 640, 480);
      }
      
      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;
      
      // Note: Mocked inference is fast, real TFLite will be slower
      expect(avgTime).toBeLessThan(10);
    });

    it('should validate bounding box coordinates are within frame', () => {
      const frame = MockDataFactory.generateMockFrame(128, 128, 'face-like');
      const result = detector.detectFace(frame, 640, 480);

      if (result.detected) {
        const { boundingBox } = result;
        expect(boundingBox.x).toBeGreaterThanOrEqual(0);
        expect(boundingBox.y).toBeGreaterThanOrEqual(0);
        expect(boundingBox.x + boundingBox.width).toBeLessThanOrEqual(640);
        expect(boundingBox.y + boundingBox.height).toBeLessThanOrEqual(480);
      }
    });
  });

  describe('Multi-Face Detection', () => {
    beforeEach(async () => {
      await detector.initialize();
    });

    it('should detect all faces when multiple present', () => {
      // Mock multiple high-confidence detections
      const regressors = new Float32Array(15232);
      const classificators = new Float32Array(896);
      
      // Set multiple anchors with high confidence
      for (let i = 0; i < 5; i++) {
        classificators[i * 100] = 3.0; // High confidence at scattered positions
      }
      
      mockTFLiteModel.runSync.mockReturnValue([regressors, classificators]);

      const frame = MockDataFactory.generateMockFrame(128, 128, 'face-like');
      const results = detector.detectAllFaces(frame, 640, 480);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(10); // Default max faces
    });
  });

  describe('Disposal', () => {
    it('should clean up resources on dispose', async () => {
      await detector.initialize();
      expect(detector.isReady()).toBe(true);

      detector.dispose();

      expect(detector.getState()).toBe('DISPOSED');
      expect(detector.isReady()).toBe(false);
    });

    it('should not detect face after disposal', async () => {
      await detector.initialize();
      detector.dispose();

      const frame = MockDataFactory.generateMockFrame(128, 128);
      const result = detector.detectFace(frame, 640, 480);

      expect(result.detected).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle TFLite inference errors gracefully', async () => {
      await detector.initialize();
      
      mockTFLiteModel.runSync.mockImplementation(() => {
        throw new Error('TFLite inference failed');
      });

      const frame = MockDataFactory.generateMockFrame(128, 128);
      const result = detector.detectFace(frame, 640, 480);

      expect(result.detected).toBe(false);
    });

    it('should handle malformed output tensors', async () => {
      await detector.initialize();
      
      // Return wrong tensor sizes
      mockTFLiteModel.runSync.mockReturnValue([
        new Float32Array(100), // Wrong size
        new Float32Array(100), // Wrong size
      ]);

      const frame = MockDataFactory.generateMockFrame(128, 128);
      const result = detector.detectFace(frame, 640, 480);

      expect(result.detected).toBe(false);
    });

    it('should handle null or undefined outputs', async () => {
      await detector.initialize();
      
      mockTFLiteModel.runSync.mockReturnValue(null);

      const frame = MockDataFactory.generateMockFrame(128, 128);
      const result = detector.detectFace(frame, 640, 480);

      expect(result.detected).toBe(false);
    });
  });

  describe('Confidence Thresholds', () => {
    it('should respect custom confidence threshold', async () => {
      const customDetector = new FaceDetector({ confidenceThreshold: 0.95 });
      await customDetector.initialize();

      // Mock medium confidence (0.88)
      mockTFLiteModel.runSync.mockReturnValue([
        new Float32Array(15232).fill(0.1),
        new Float32Array(896).fill(2.0), // sigmoid ≈ 0.88
      ]);

      const frame = MockDataFactory.generateMockFrame(128, 128, 'face-like');
      const result = customDetector.detectFace(frame, 640, 480);

      // Should not detect because 0.88 < 0.95 threshold
      expect(result.detected).toBe(false);
      
      customDetector.dispose();
    });
  });
});
