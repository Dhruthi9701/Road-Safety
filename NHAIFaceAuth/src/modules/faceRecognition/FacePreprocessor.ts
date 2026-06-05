/**
 * NHAI FaceAuth — Face Preprocessor
 *
 * Handles all pixel-level transformations required before face embedding
 * inference: alignment, resizing, CLAHE histogram equalization, and
 * normalization. All methods are pure-functional (static) and operate on
 * flat Float32Array pixel buffers in row-major RGB interleaved format.
 *
 * @module faceRecognition/FacePreprocessor
 */

import type { BoundingBox, FaceKeypoints } from '../../types';
import type { AlignmentTransform, CLAHEConfig, CropResult } from './types';

/** Standard 112×112 alignment target landmarks (MobileFaceNet convention) */
const ALIGNMENT_TARGETS: [number, number][] = [
  [38.29, 51.69],   // left eye
  [73.53, 51.69],   // right eye
  [56.02, 71.73],   // nose
  [41.54, 92.36],   // left mouth
  [70.73, 92.36],   // right mouth
];

/** Output dimensions after alignment */
const ALIGNED_SIZE = 112;

/** Default CLAHE configuration */
const DEFAULT_CLAHE_CONFIG: CLAHEConfig = {
  tilesX: 8,
  tilesY: 8,
  clipLimit: 2.0,
};

/**
 * Static utility class for face image preprocessing.
 *
 * All methods accept and return flat `Float32Array` pixel buffers
 * in **row-major, RGB-interleaved** format (i.e. [R,G,B, R,G,B, …]).
 *
 * @example
 * ```ts
 * const aligned = FacePreprocessor.alignFace(pixels, w, h, keypoints);
 * const normed  = FacePreprocessor.normalizePixels(aligned);
 * ```
 */
export class FacePreprocessor {
  // ─── Private constructor (all static) ────────────────────────────────

  private constructor() {
    // Prevent instantiation
  }

  // ─── Alignment ───────────────────────────────────────────────────────

  /**
   * Align a detected face to a canonical 112×112 pose using 5-point
   * affine alignment.
   *
   * The method computes a best-fit affine transform from the detected
   * keypoints to the canonical target positions, then warps the source
   * image accordingly via bilinear sampling.
   *
   * @param pixels   – Source RGB pixel buffer.
   * @param width    – Source image width.
   * @param height   – Source image height.
   * @param keypoints – Detected face keypoints (left eye, right eye,
   *                    nose, left mouth, right mouth via BlazeFace).
   * @returns 112×112×3 aligned face pixel buffer.
   */
  static alignFace(
    pixels: Float32Array,
    width: number,
    height: number,
    keypoints: FaceKeypoints,
  ): Float32Array {
    // 1. Build source point array from keypoints
    //    BlazeFace provides: leftEye, rightEye, noseTip, mouthCenter,
    //    rightEarTragion, leftEarTragion.  We derive left/right mouth
    //    corners from mouthCenter and ear tragions for the 5-point model.
    const srcPoints = FacePreprocessor.extractFivePoints(keypoints, width, height);

    // 2. Compute affine transform (least-squares best fit)
    const transform = FacePreprocessor.computeAffineTransform(srcPoints, ALIGNMENT_TARGETS);

    // 3. Warp source image with the inverse transform
    return FacePreprocessor.applyAffineWarp(pixels, width, height, transform, ALIGNED_SIZE, ALIGNED_SIZE);
  }

  /**
   * Extract 5 alignment points from BlazeFace keypoints.
   *
   * BlazeFace gives us 6 keypoints: leftEye, rightEye, noseTip,
   * mouthCenter, rightEarTragion, leftEarTragion.
   * We synthesize left/right mouth corners from mouthCenter + ear-to-nose
   * geometry for compatibility with the standard 5-point alignment model.
   *
   * @param kp     – Raw BlazeFace keypoints.
   * @param width  – Source image width (for de-normalisation if needed).
   * @param height – Source image height.
   * @returns Five [x, y] pairs.
   */
  private static extractFivePoints(
    kp: FaceKeypoints,
    _width: number,
    _height: number,
  ): [number, number][] {
    // Left eye
    const leftEye: [number, number] = [kp.leftEye.x, kp.leftEye.y];
    // Right eye
    const rightEye: [number, number] = [kp.rightEye.x, kp.rightEye.y];
    // Nose tip
    const nose: [number, number] = [kp.noseTip.x, kp.noseTip.y];

    // Synthesize left/right mouth corners from mouthCenter.
    // Use the interocular distance to estimate mouth width.
    const eyeDist = Math.sqrt(
      (kp.rightEye.x - kp.leftEye.x) ** 2 +
      (kp.rightEye.y - kp.leftEye.y) ** 2,
    );
    const mouthHalfWidth = eyeDist * 0.42; // empirical ratio

    const leftMouth: [number, number] = [
      kp.mouthCenter.x - mouthHalfWidth,
      kp.mouthCenter.y,
    ];
    const rightMouth: [number, number] = [
      kp.mouthCenter.x + mouthHalfWidth,
      kp.mouthCenter.y,
    ];

    return [leftEye, rightEye, nose, leftMouth, rightMouth];
  }

  /**
   * Compute the 2×3 affine transform that best maps `srcPoints` →
   * `dstPoints` using least-squares (Normal Equations).
   *
   * We solve for [a, b, tx; c, d, ty] such that:
   *   dst_x = a * src_x + b * src_y + tx
   *   dst_y = c * src_x + d * src_y + ty
   *
   * @param src – Source points (N × 2).
   * @param dst – Destination points (N × 2).
   * @returns The 2×3 affine parameters.
   */
  private static computeAffineTransform(
    src: [number, number][],
    dst: [number, number][],
  ): AlignmentTransform {
    const n = src.length;

    // Build the normal-equation matrices for:
    //   [ sum(xi^2 + yi^2),  0,                sum(xi), sum(yi), 0,       0      ]   [ a  ]   [ sum(xi*Xd + yi*Yd) ]
    //   [ 0,                 sum(xi^2 + yi^2), -sum(yi), sum(xi), 0,       0      ] × [ b  ] = [ sum(xi*Yd - yi*Xd) ]
    //   ... (more terms)
    //
    // We use a simpler direct solve: build A (2N×4) for shared rotation+scale
    // model, or general 2N×6 for full affine. We use full affine.

    // Full affine: solve two independent 3-parameter systems
    // For x: dst_x = a*src_x + b*src_y + tx
    // For y: dst_y = c*src_x + d*src_y + ty

    // Build A (N×3) and b_x (N), b_y (N)
    // A = [src_x, src_y, 1]
    // b_x = dst_x
    // b_y = dst_y

    // Solve via normal equations: (A^T A) x = A^T b

    // Accumulate A^T A (3×3) and A^T b (3×1) for both x and y
    let ata00 = 0, ata01 = 0, ata02 = 0;
    let ata11 = 0, ata12 = 0;
    let ata22 = 0;
    let atbx0 = 0, atbx1 = 0, atbx2 = 0;
    let atby0 = 0, atby1 = 0, atby2 = 0;

    for (let i = 0; i < n; i++) {
      const sx = src[i][0];
      const sy = src[i][1];
      const dx = dst[i][0];
      const dy = dst[i][1];

      ata00 += sx * sx;
      ata01 += sx * sy;
      ata02 += sx;
      ata11 += sy * sy;
      ata12 += sy;
      ata22 += 1; // n

      atbx0 += sx * dx;
      atbx1 += sy * dx;
      atbx2 += dx;

      atby0 += sx * dy;
      atby1 += sy * dy;
      atby2 += dy;
    }

    // Solve 3×3 symmetric system using Cramer's rule
    const solveX = FacePreprocessor.solve3x3(
      ata00, ata01, ata02,
      ata01, ata11, ata12,
      ata02, ata12, ata22,
      atbx0, atbx1, atbx2,
    );
    const solveY = FacePreprocessor.solve3x3(
      ata00, ata01, ata02,
      ata01, ata11, ata12,
      ata02, ata12, ata22,
      atby0, atby1, atby2,
    );

    return {
      a: solveX[0],
      b: solveX[1],
      tx: solveX[2],
      c: solveY[0],
      d: solveY[1],
      ty: solveY[2],
    };
  }

  /**
   * Solve a 3×3 linear system Ax = b using Cramer's rule.
   *
   * @returns [x0, x1, x2]
   */
  private static solve3x3(
    a00: number, a01: number, a02: number,
    a10: number, a11: number, a12: number,
    a20: number, a21: number, a22: number,
    b0: number, b1: number, b2: number,
  ): [number, number, number] {
    const det =
      a00 * (a11 * a22 - a12 * a21) -
      a01 * (a10 * a22 - a12 * a20) +
      a02 * (a10 * a21 - a11 * a20);

    if (Math.abs(det) < 1e-10) {
      // Degenerate — return identity-like fallback
      return [1, 0, 0];
    }

    const invDet = 1.0 / det;

    const x0 =
      (b0 * (a11 * a22 - a12 * a21) -
       a01 * (b1 * a22 - a12 * b2) +
       a02 * (b1 * a21 - a11 * b2)) * invDet;

    const x1 =
      (a00 * (b1 * a22 - a12 * b2) -
       b0 * (a10 * a22 - a12 * a20) +
       a02 * (a10 * b2 - b1 * a20)) * invDet;

    const x2 =
      (a00 * (a11 * b2 - b1 * a21) -
       a01 * (a10 * b2 - b1 * a20) +
       b0 * (a10 * a21 - a11 * a20)) * invDet;

    return [x0, x1, x2];
  }

  /**
   * Apply an affine warp to an image, producing an output of size
   * `dstW × dstH`. Uses bilinear interpolation for sub-pixel accuracy.
   *
   * For each output pixel (ox, oy) we compute the *inverse* mapping
   * to find the source pixel, then bilinearly sample.
   *
   * @param src       – Source RGB buffer.
   * @param srcW      – Source width.
   * @param srcH      – Source height.
   * @param transform – Forward affine (src → dst). We invert internally.
   * @param dstW      – Output width.
   * @param dstH      – Output height.
   * @returns Warped RGB buffer.
   */
  private static applyAffineWarp(
    src: Float32Array,
    srcW: number,
    srcH: number,
    transform: AlignmentTransform,
    dstW: number,
    dstH: number,
  ): Float32Array {
    // Invert the 2×3 affine (forward: src→dst → inverse: dst→src)
    const inv = FacePreprocessor.invertAffine(transform);
    const dst = new Float32Array(dstW * dstH * 3);

    for (let oy = 0; oy < dstH; oy++) {
      for (let ox = 0; ox < dstW; ox++) {
        // Map output coord → source coord
        const sx = inv.a * ox + inv.b * oy + inv.tx;
        const sy = inv.c * ox + inv.d * oy + inv.ty;

        // Bilinear sample
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const x1 = x0 + 1;
        const y1 = y0 + 1;
        const fx = sx - x0;
        const fy = sy - y0;

        const outIdx = (oy * dstW + ox) * 3;

        for (let ch = 0; ch < 3; ch++) {
          const v00 = FacePreprocessor.samplePixel(src, srcW, srcH, x0, y0, ch);
          const v01 = FacePreprocessor.samplePixel(src, srcW, srcH, x1, y0, ch);
          const v10 = FacePreprocessor.samplePixel(src, srcW, srcH, x0, y1, ch);
          const v11 = FacePreprocessor.samplePixel(src, srcW, srcH, x1, y1, ch);

          dst[outIdx + ch] =
            v00 * (1 - fx) * (1 - fy) +
            v01 * fx * (1 - fy) +
            v10 * (1 - fx) * fy +
            v11 * fx * fy;
        }
      }
    }

    return dst;
  }

  /**
   * Sample a single channel from a pixel buffer with boundary clamping.
   */
  private static samplePixel(
    buf: Float32Array,
    w: number,
    h: number,
    x: number,
    y: number,
    ch: number,
  ): number {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    return buf[(cy * w + cx) * 3 + ch];
  }

  /**
   * Invert a 2×3 affine transform.
   *
   * Given forward [a b tx; c d ty], the inverse is
   * [a' b' tx'; c' d' ty'] where [a' b'; c' d'] = inv([a b; c d])
   * and [tx', ty'] = -inv([a b; c d]) * [tx; ty].
   */
  private static invertAffine(t: AlignmentTransform): AlignmentTransform {
    const det = t.a * t.d - t.b * t.c;
    if (Math.abs(det) < 1e-10) {
      // Degenerate — return identity
      return { a: 1, b: 0, tx: 0, c: 0, d: 1, ty: 0 };
    }
    const invDet = 1.0 / det;
    const ia = t.d * invDet;
    const ib = -t.b * invDet;
    const ic = -t.c * invDet;
    const id = t.a * invDet;

    return {
      a: ia,
      b: ib,
      tx: -(ia * t.tx + ib * t.ty),
      c: ic,
      d: id,
      ty: -(ic * t.tx + id * t.ty),
    };
  }

  // ─── Normalization ───────────────────────────────────────────────────

  /**
   * Normalize pixel values from [0, 255] to [−1, +1].
   *
   * Formula: `(pixel − 127.5) / 128.0`
   *
   * This is the standard normalization for MobileFaceNet inputs.
   *
   * @param pixels – RGB pixel buffer with values in [0, 255].
   * @returns New buffer with values in [−1, +1].
   */
  static normalizePixels(pixels: Float32Array): Float32Array {
    const out = new Float32Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
      out[i] = (pixels[i] - 127.5) / 128.0;
    }
    return out;
  }

  // ─── Resize ──────────────────────────────────────────────────────────

  /**
   * Resize an RGB image using bilinear interpolation.
   *
   * @param pixels – Source RGB buffer (row-major interleaved).
   * @param srcW   – Source width in pixels.
   * @param srcH   – Source height in pixels.
   * @param dstW   – Destination width.
   * @param dstH   – Destination height.
   * @returns Resized RGB buffer of size dstW × dstH × 3.
   */
  static resizeBilinear(
    pixels: Float32Array,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number,
  ): Float32Array {
    const dst = new Float32Array(dstW * dstH * 3);
    const xRatio = srcW / dstW;
    const yRatio = srcH / dstH;

    for (let dy = 0; dy < dstH; dy++) {
      const sy = dy * yRatio;
      const y0 = Math.floor(sy);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const fy = sy - y0;

      for (let dx = 0; dx < dstW; dx++) {
        const sx = dx * xRatio;
        const x0 = Math.floor(sx);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const fx = sx - x0;

        const dstIdx = (dy * dstW + dx) * 3;

        for (let ch = 0; ch < 3; ch++) {
          const v00 = pixels[(y0 * srcW + x0) * 3 + ch];
          const v01 = pixels[(y0 * srcW + x1) * 3 + ch];
          const v10 = pixels[(y1 * srcW + x0) * 3 + ch];
          const v11 = pixels[(y1 * srcW + x1) * 3 + ch];

          dst[dstIdx + ch] =
            v00 * (1 - fx) * (1 - fy) +
            v01 * fx * (1 - fy) +
            v10 * (1 - fx) * fy +
            v11 * fx * fy;
        }
      }
    }

    return dst;
  }

  // ─── Histogram Equalization (CLAHE) ──────────────────────────────────

  /**
   * Apply Contrast-Limited Adaptive Histogram Equalization (CLAHE) to
   * compensate for uneven or poor lighting conditions.
   *
   * **Pipeline**:
   * 1. Convert RGB → Luminance (grayscale).
   * 2. Divide into tiles and build per-tile histograms.
   * 3. Clip histograms at `clipLimit` and redistribute excess.
   * 4. Build per-tile CDFs and bilinearly interpolate across tiles.
   * 5. Apply the equalized luminance back to each RGB channel.
   *
   * This approach preserves colour ratios while normalizing brightness.
   *
   * @param pixels – RGB pixel buffer with values in [0, 255].
   * @param width  – Image width.
   * @param height – Image height.
   * @returns Equalized RGB pixel buffer (same dimensions, [0, 255]).
   */
  static histogramEqualization(
    pixels: Float32Array,
    width: number,
    height: number,
  ): Float32Array {
    return FacePreprocessor.applyCLAHE(pixels, width, height, DEFAULT_CLAHE_CONFIG);
  }

  /**
   * Internal CLAHE implementation with configurable parameters.
   */
  private static applyCLAHE(
    pixels: Float32Array,
    width: number,
    height: number,
    config: CLAHEConfig,
  ): Float32Array {
    const { tilesX, tilesY, clipLimit } = config;
    const numBins = 256;

    // 1. Compute luminance channel
    const totalPixels = width * height;
    const luminance = new Float32Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const r = pixels[i * 3];
      const g = pixels[i * 3 + 1];
      const b = pixels[i * 3 + 2];
      // Standard luminance weights (BT.601)
      luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // 2. Build per-tile CDFs
    const tileW = Math.ceil(width / tilesX);
    const tileH = Math.ceil(height / tilesY);
    const tileCDFs: Float32Array[][] = [];

    for (let ty = 0; ty < tilesY; ty++) {
      tileCDFs[ty] = [];
      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = tx * tileW;
        const y0 = ty * tileH;
        const x1 = Math.min(x0 + tileW, width);
        const y1 = Math.min(y0 + tileH, height);

        // Build histogram
        const hist = new Float32Array(numBins);
        let tilePixelCount = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const bin = Math.min(255, Math.max(0, Math.round(luminance[y * width + x])));
            hist[bin]++;
            tilePixelCount++;
          }
        }

        // Clip histogram and redistribute excess
        const maxCount = clipLimit * (tilePixelCount / numBins);
        let excess = 0;
        for (let i = 0; i < numBins; i++) {
          if (hist[i] > maxCount) {
            excess += hist[i] - maxCount;
            hist[i] = maxCount;
          }
        }
        const redistPerBin = excess / numBins;
        for (let i = 0; i < numBins; i++) {
          hist[i] += redistPerBin;
        }

        // Build CDF (cumulative) and normalize to [0, 255]
        const cdf = new Float32Array(numBins);
        cdf[0] = hist[0];
        for (let i = 1; i < numBins; i++) {
          cdf[i] = cdf[i - 1] + hist[i];
        }

        // Normalize CDF to [0, 255]
        const cdfMin = cdf[0];
        const cdfMax = cdf[numBins - 1];
        const cdfRange = cdfMax - cdfMin;
        if (cdfRange > 0) {
          for (let i = 0; i < numBins; i++) {
            cdf[i] = ((cdf[i] - cdfMin) / cdfRange) * 255;
          }
        }

        tileCDFs[ty][tx] = cdf;
      }
    }

    // 3. Apply equalization with bilinear interpolation between tiles
    const output = new Float32Array(pixels.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const lum = Math.min(255, Math.max(0, Math.round(luminance[idx])));

        // Find which tile centre this pixel is closest to
        const ftx = (x / tileW) - 0.5;
        const fty = (y / tileH) - 0.5;

        const tx0 = Math.max(0, Math.floor(ftx));
        const ty0 = Math.max(0, Math.floor(fty));
        const tx1 = Math.min(tilesX - 1, tx0 + 1);
        const ty1 = Math.min(tilesY - 1, ty0 + 1);

        const fx = Math.max(0, Math.min(1, ftx - tx0));
        const fy = Math.max(0, Math.min(1, fty - ty0));

        // Bilinear interpolation of CDF values from surrounding tiles
        const v00 = tileCDFs[ty0][tx0][lum];
        const v01 = tileCDFs[ty0][tx1][lum];
        const v10 = tileCDFs[ty1][tx0][lum];
        const v11 = tileCDFs[ty1][tx1][lum];

        const equalized =
          v00 * (1 - fx) * (1 - fy) +
          v01 * fx * (1 - fy) +
          v10 * (1 - fx) * fy +
          v11 * fx * fy;

        // Apply ratio to original RGB channels
        const origLum = luminance[idx];
        const ratio = origLum > 0 ? equalized / origLum : 1;

        const pixIdx = idx * 3;
        output[pixIdx] = Math.min(255, Math.max(0, pixels[pixIdx] * ratio));
        output[pixIdx + 1] = Math.min(255, Math.max(0, pixels[pixIdx + 1] * ratio));
        output[pixIdx + 2] = Math.min(255, Math.max(0, pixels[pixIdx + 2] * ratio));
      }
    }

    return output;
  }

  // ─── Face Cropping ───────────────────────────────────────────────────

  /**
   * Crop the face region from a frame with configurable padding.
   *
   * Applies `padding` as a fraction of the bounding box dimensions
   * on each side, clamped to image boundaries.
   *
   * @param pixels  – Source RGB pixel buffer.
   * @param width   – Source image width.
   * @param height  – Source image height.
   * @param bbox    – Detected face bounding box.
   * @param padding – Padding fraction (default 0.2 = 20% on each side).
   * @returns Cropped pixel data with resulting dimensions.
   */
  static cropFace(
    pixels: Float32Array,
    width: number,
    height: number,
    bbox: BoundingBox,
    padding: number = 0.2,
  ): CropResult {
    // Compute padded crop region
    const padX = bbox.width * padding;
    const padY = bbox.height * padding;

    const x0 = Math.max(0, Math.floor(bbox.x - padX));
    const y0 = Math.max(0, Math.floor(bbox.y - padY));
    const x1 = Math.min(width, Math.ceil(bbox.x + bbox.width + padX));
    const y1 = Math.min(height, Math.ceil(bbox.y + bbox.height + padY));

    const cropW = x1 - x0;
    const cropH = y1 - y0;

    if (cropW <= 0 || cropH <= 0) {
      // Edge case: degenerate crop — return a 1×1 black pixel
      return {
        pixels: new Float32Array(3),
        width: 1,
        height: 1,
      };
    }

    const cropped = new Float32Array(cropW * cropH * 3);

    for (let cy = 0; cy < cropH; cy++) {
      const srcRowOffset = ((y0 + cy) * width + x0) * 3;
      const dstRowOffset = cy * cropW * 3;
      // Copy one row of RGB data
      for (let cx = 0; cx < cropW; cx++) {
        const si = srcRowOffset + cx * 3;
        const di = dstRowOffset + cx * 3;
        cropped[di] = pixels[si];
        cropped[di + 1] = pixels[si + 1];
        cropped[di + 2] = pixels[si + 2];
      }
    }

    return { pixels: cropped, width: cropW, height: cropH };
  }
}
