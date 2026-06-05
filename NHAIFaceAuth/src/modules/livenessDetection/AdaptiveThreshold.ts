/**
 * NHAI FaceAuth — Adaptive Threshold & Preprocessing Utilities
 *
 * Implements heuristics to dynamically adjust facial biometric thresholds:
 *   - Glasses detection: Analysis of eye-contour depth and inter-pupillary spacing
 *   - Mask detection: Landmark visibility and density in the nose-mouth region
 *   - Lighting assessment: Average brightness and contrast calculation
 *   - Lighting normalization: Contrast Limited Adaptive Histogram Equalization (CLAHE) / Histogram Equalization
 *
 * @module livenessDetection/AdaptiveThreshold
 */

import type { Point3D } from '../../types';
import {
  EAR_BLINK_THRESHOLD,
  EAR_BLINK_THRESHOLD_GLASSES,
} from '../../constants/config';
import {
  EYE_CONTOUR_INDICES,
  MOUTH_REGION_INDICES,
} from './types';

export class AdaptiveThreshold {
  /**
   * Simple heuristic to detect if the user is wearing eyeglasses.
   * Compares the depth variance of landmarks around the bridge of the nose
   * and the upper eye socket where frame shadows/reflections distort depth.
   */
  static detectGlasses(landmarks: Point3D[]): boolean {
    if (!landmarks || landmarks.length < 468) return false;

    // Bridge landmarks
    const rightBridge = landmarks[EYE_CONTOUR_INDICES.rightBridge];
    const leftBridge = landmarks[EYE_CONTOUR_INDICES.leftBridge];
    if (!rightBridge || !leftBridge) return false;

    // Calculate depth (Z-axis) difference between the bridge and average eye depth
    let rightEyeZSum = 0;
    EYE_CONTOUR_INDICES.rightUpper.forEach(idx => {
      rightEyeZSum += landmarks[idx]?.z || 0;
    });
    const avgRightEyeZ = rightEyeZSum / EYE_CONTOUR_INDICES.rightUpper.length;

    let leftEyeZSum = 0;
    EYE_CONTOUR_INDICES.leftUpper.forEach(idx => {
      leftEyeZSum += landmarks[idx]?.z || 0;
    });
    const avgLeftEyeZ = leftEyeZSum / EYE_CONTOUR_INDICES.leftUpper.length;

    // Eyeglasses frames distort the Z-readings at the bridge relative to the eyes
    const bridgeDiff = Math.abs((rightBridge.z + leftBridge.z) / 2 - (avgRightEyeZ + avgLeftEyeZ) / 2);

    // Heuristic threshold for depth distortion indicating glasses frames
    return bridgeDiff > 0.045;
  }

  /**
   * Heuristic to detect if the user is wearing a face mask.
   * Analyzes the flat/collapsed depth distribution of mouth/jaw landmarks.
   * A mask flattens the depth variation (z-values) across the nose-tip to chin region.
   */
  static detectMask(landmarks: Point3D[]): boolean {
    if (!landmarks || landmarks.length < 468) return false;

    // Track mouth outer landmarks
    const outerIndices = MOUTH_REGION_INDICES.outerUpper.concat(MOUTH_REGION_INDICES.outerLower);
    let minZ = Infinity;
    let maxZ = -Infinity;
    let sumZ = 0;

    outerIndices.forEach(idx => {
      const pt = landmarks[idx];
      if (pt) {
        if (pt.z < minZ) minZ = pt.z;
        if (pt.z > maxZ) maxZ = pt.z;
        sumZ += pt.z;
      }
    });

    const rangeZ = maxZ - minZ;
    
    // Nose tip and chin depth relationship
    const nose = landmarks[1]; // nose tip
    const chin = landmarks[152]; // chin bottom
    if (!nose || !chin) return false;

    const noseChinZDiff = Math.abs(nose.z - chin.z);

    // If the Z range around the mouth is extremely flat (less than typical lip contour)
    // or the nose-to-chin depth profile is flattened by a stretched fabric mask
    return rangeZ < 0.012 || noseChinZDiff < 0.035;
  }

  /**
   * Adjusts the Eye Aspect Ratio threshold for glasses.
   * Eyeglasses restrict the apparent closing of the eyes, requiring a lower
   * (more sensitive) threshold to avoid false negatives.
   */
  static adjustForGlasses(baseEAR: number): number {
    return baseEAR * 0.85; // Drop threshold to make it easier to register a blink
  }

  /**
   * Assesses the lighting quality of the captured face crop.
   */
  static assessLightingQuality(pixels: Float32Array): {
    brightness: number;
    contrast: number;
    quality: 'good' | 'low' | 'harsh';
  } {
    if (!pixels || pixels.length === 0) {
      return { brightness: 0, contrast: 0, quality: 'low' };
    }

    let sum = 0;
    for (let i = 0; i < pixels.length; i++) {
      sum += pixels[i];
    }
    const brightness = sum / pixels.length;

    // Calculate Root Mean Square (RMS) contrast
    let sumSqDiff = 0;
    for (let i = 0; i < pixels.length; i++) {
      const diff = pixels[i] - brightness;
      sumSqDiff += diff * diff;
    }
    const contrast = Math.sqrt(sumSqDiff / pixels.length);

    let quality: 'good' | 'low' | 'harsh' = 'good';
    if (brightness < 40) {
      quality = 'low'; // Too dark
    } else if (brightness > 220 || contrast > 90) {
      quality = 'harsh'; // Overexposed or extreme shadows
    } else if (contrast < 15) {
      quality = 'low'; // Too flat/underexposed
    }

    return { brightness, contrast, quality };
  }

  /**
   * Normalizes pixel values via global histogram equalization.
   * Ensures robust classification under low-light and high-contrast conditions.
   * Assumes pixel data is in [0, 255] range.
   */
  static normalizeForLighting(
    pixels: Float32Array,
    width: number,
    height: number
  ): Float32Array {
    const totalPixels = width * height;
    const channels = pixels.length / totalPixels;

    // 1. Calculate Grayscale values for histogram calculation
    const gray = new Uint8Array(totalPixels);
    if (channels === 3) {
      for (let i = 0; i < totalPixels; i++) {
        const r = pixels[i * 3];
        const g = pixels[i * 3 + 1];
        const b = pixels[i * 3 + 2];
        gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }
    } else {
      for (let i = 0; i < totalPixels; i++) {
        gray[i] = Math.round(pixels[i]);
      }
    }

    // 2. Compute histogram
    const histogram = new Int32Array(256);
    for (let i = 0; i < totalPixels; i++) {
      histogram[gray[i]]++;
    }

    // 3. Compute Cumulative Distribution Function (CDF)
    const cdf = new Int32Array(256);
    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + histogram[i];
    }

    // Get minimum non-zero CDF value
    let cdfMin = 0;
    for (let i = 0; i < 256; i++) {
      if (cdf[i] > 0) {
        cdfMin = cdf[i];
        break;
      }
    }

    // 4. Create equalization lookup table
    const lut = new Uint8Array(256);
    const denominator = totalPixels - cdfMin;
    if (denominator > 0) {
      for (let i = 0; i < 256; i++) {
        lut[i] = Math.round(((cdf[i] - cdfMin) / denominator) * 255);
      }
    } else {
      for (let i = 0; i < 256; i++) {
        lut[i] = i;
      }
    }

    // 5. Apply equalization to pixels
    const equalized = new Float32Array(pixels.length);
    if (channels === 3) {
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 3;
        // Apply scaling factor based on the difference between original and equalized grayscale
        const origGray = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        const eqGray = lut[Math.min(255, Math.max(0, Math.round(origGray)))];
        const ratio = origGray > 0 ? eqGray / origGray : 1.0;

        equalized[idx] = Math.min(255, Math.max(0, pixels[idx] * ratio));
        equalized[idx + 1] = Math.min(255, Math.max(0, pixels[idx + 1] * ratio));
        equalized[idx + 2] = Math.min(255, Math.max(0, pixels[idx + 2] * ratio));
      }
    } else {
      for (let i = 0; i < totalPixels; i++) {
        equalized[i] = lut[Math.min(255, Math.max(0, Math.round(pixels[i])))];
      }
    }

    return equalized;
  }
}
