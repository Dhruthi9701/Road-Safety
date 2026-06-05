/**
 * NHAI FaceAuth — Face Matcher
 *
 * Computes cosine similarity between face embeddings and matches
 * a probe embedding against the enrolled-user database. Designed
 * for efficient operation with up to 500 enrolled users on-device.
 *
 * @module faceRecognition/FaceMatcher
 */

import {
  MATCH_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  EMBEDDING_DIMENSION,
} from '../../constants/config';
import type { FaceEmbedding, MatchResult, MatchLevel, EnrolledUser } from '../../types';
import type { EmbeddingComparison, MatchCandidate } from './types';

/**
 * Provides face-to-face and face-to-database matching operations.
 *
 * All similarity computations use **cosine similarity** on L2-normalised
 * embeddings (which is equivalent to the dot product when vectors are
 * unit-length).
 *
 * **Thresholds** (from config):
 * - `≥ 0.85` → HIGH_CONFIDENCE match
 * - `[0.70, 0.85)` → LOW_CONFIDENCE match (prompt retry)
 * - `< 0.70` → NO_MATCH
 *
 * @example
 * ```ts
 * const matcher = new FaceMatcher();
 * const result = matcher.matchAgainstDatabase(probe, enrolledUsers);
 * if (result.matched) {
 *   console.log(`Matched ${result.userName} (${result.confidence})`);
 * }
 * ```
 */
export class FaceMatcher {
  // ─── Core Similarity ─────────────────────────────────────────────────

  /**
   * Compute the cosine similarity between two embedding vectors.
   *
   * ```
   * cosine_sim = (a · b) / (||a|| × ||b||)
   * ```
   *
   * Includes early-termination: if the running dot product can no
   * longer reach the LOW_CONFIDENCE_THRESHOLD given the remaining
   * dimensions, the computation bails out early with a low score.
   *
   * @param a – First embedding vector (128-D).
   * @param b – Second embedding vector (128-D).
   * @returns Similarity in [−1, +1]; 1 = identical.
   *
   * @throws {Error} If vectors have different lengths.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(
        `[FaceMatcher] Vector length mismatch: ${a.length} vs ${b.length}.`,
      );
    }

    const n = a.length;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // Early termination check interval (every 32 dimensions)
    const checkInterval = 32;

    for (let i = 0; i < n; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];

      // Early termination: check periodically whether a match is still
      // mathematically possible.  By Cauchy-Schwarz, the maximum
      // remaining dot-product contribution is sqrt(remA * remB), where
      // remA/B are upper-bound remaining norms (assume remaining
      // dimensions maximally aligned).
      if ((i + 1) % checkInterval === 0 && i + 1 < n) {
        const remaining = n - i - 1;
        // Upper-bound remaining contribution (assuming unit vectors,
        // each remaining dimension contributes at most 1/sqrt(n)).
        // For a rough bound: remaining * (1/n) is the max contribution
        // per dimension if vectors were perfectly aligned and unit-norm.
        // More practically, we check if even maxing out can reach threshold.
        const maxRemainingDot = Math.sqrt(remaining) * Math.sqrt(remaining);
        // maxRemainingDot ~ remaining (loose bound).
        // This is a heuristic: if dotProduct + remaining < threshold * sqrt(normA+remaining) * sqrt(normB+remaining)
        // A cheaper check: if the dot product is deeply negative, bail.
        if (dotProduct + remaining < LOW_CONFIDENCE_THRESHOLD * n * 0.5) {
          // Cannot possibly reach threshold — finish computing norms for
          // a correct (but low) score
          for (let j = i + 1; j < n; j++) {
            dotProduct += a[j] * b[j];
            normA += a[j] * a[j];
            normB += b[j] * b[j];
          }
          break;
        }
      }
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator < 1e-10) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Match a probe embedding against the full enrolled-user database.
   *
   * Iterates through all enrolled users, computes cosine similarity,
   * and returns the best match with confidence classification.
   *
   * Optimised for up to 500 users with early-exit on perfect match
   * and pre-sorted candidates.
   *
   * @param embedding     – Probe face embedding (Float32Array, 128-D).
   * @param enrolledUsers – Array of enrolled user records.
   * @returns Best match result with confidence and timing metadata.
   */
  matchAgainstDatabase(
    embedding: FaceEmbedding,
    enrolledUsers: EnrolledUser[],
  ): MatchResult {
    const startTime = performance.now();

    if (enrolledUsers.length === 0) {
      return {
        matched: false,
        userId: null,
        userName: null,
        confidence: 0,
        matchLevel: 'NO_MATCH',
        processingTimeMs: performance.now() - startTime,
      };
    }

    // Convert probe to number[] once for reuse
    const probeArr = Array.from(embedding);

    let bestCandidate: MatchCandidate | null = null;
    let bestSimilarity = -Infinity;

    for (let i = 0; i < enrolledUsers.length; i++) {
      const user = enrolledUsers[i];

      // Validate stored embedding
      if (
        !user.embedding ||
        !Array.isArray(user.embedding) ||
        user.embedding.length !== EMBEDDING_DIMENSION
      ) {
        continue;
      }

      const similarity = this.cosineSimilarity(probeArr, user.embedding);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCandidate = {
          userId: user.id,
          userName: user.name,
          similarity,
          matchLevel: FaceMatcher.classifyMatch(similarity),
        };

        // Early exit on very high confidence (practically identical)
        if (similarity >= 0.99) {
          break;
        }
      }
    }

    const processingTimeMs = performance.now() - startTime;

    if (!bestCandidate) {
      return {
        matched: false,
        userId: null,
        userName: null,
        confidence: 0,
        matchLevel: 'NO_MATCH',
        processingTimeMs,
      };
    }

    const matchLevel = bestCandidate.matchLevel;
    const matched = matchLevel === 'HIGH_CONFIDENCE' || matchLevel === 'LOW_CONFIDENCE';

    return {
      matched,
      userId: matched ? bestCandidate.userId : null,
      userName: matched ? bestCandidate.userName : null,
      confidence: bestCandidate.similarity,
      matchLevel,
      processingTimeMs,
    };
  }

  /**
   * Compare a probe embedding against a single enrolled user's embedding.
   *
   * Useful for 1:1 verification (e.g. confirming identity of a known user).
   *
   * @param embedding     – Probe face embedding.
   * @param userEmbedding – The enrolled user's stored embedding.
   * @returns Cosine similarity score in [−1, +1].
   */
  matchAgainstUser(embedding: FaceEmbedding, userEmbedding: number[]): number {
    return this.cosineSimilarity(Array.from(embedding), userEmbedding);
  }

  /**
   * Compute a detailed embedding comparison with distance and timing.
   *
   * @param a – First embedding.
   * @param b – Second embedding.
   * @returns Full comparison result including L2 distance.
   */
  compareEmbeddings(a: FaceEmbedding, b: FaceEmbedding): EmbeddingComparison {
    const startTime = performance.now();
    const aArr = Array.from(a);
    const bArr = Array.from(b);

    const similarity = this.cosineSimilarity(aArr, bArr);
    const matchLevel = FaceMatcher.classifyMatch(similarity);

    // Compute L2 distance
    let distSq = 0;
    for (let i = 0; i < aArr.length; i++) {
      const diff = aArr[i] - bArr[i];
      distSq += diff * diff;
    }

    return {
      similarity,
      matched: matchLevel === 'HIGH_CONFIDENCE' || matchLevel === 'LOW_CONFIDENCE',
      matchLevel,
      distance: Math.sqrt(distSq),
      comparisonTimeMs: performance.now() - startTime,
    };
  }

  // ─── Embedding Aggregation ───────────────────────────────────────────

  /**
   * Average multiple embeddings to produce a centroid embedding
   * (used during enrollment to create a representative template
   * from 3-5 photos).
   *
   * The result is L2-normalized so it lies on the unit hypersphere.
   *
   * @param embeddings – Array of embedding vectors (all same length).
   * @returns L2-normalized centroid embedding.
   *
   * @throws {Error} If the input array is empty.
   * @throws {Error} If embeddings have inconsistent dimensions.
   */
  averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      throw new Error('[FaceMatcher] Cannot average zero embeddings.');
    }

    const dim = embeddings[0].length;
    const centroid = new Array<number>(dim).fill(0);

    for (let i = 0; i < embeddings.length; i++) {
      if (embeddings[i].length !== dim) {
        throw new Error(
          `[FaceMatcher] Dimension mismatch at index ${i}: expected ${dim}, ` +
          `got ${embeddings[i].length}.`,
        );
      }
      for (let j = 0; j < dim; j++) {
        centroid[j] += embeddings[i][j];
      }
    }

    // Average
    const n = embeddings.length;
    for (let j = 0; j < dim; j++) {
      centroid[j] /= n;
    }

    // L2 normalize the centroid
    let sumSq = 0;
    for (let j = 0; j < dim; j++) {
      sumSq += centroid[j] * centroid[j];
    }
    const norm = Math.sqrt(sumSq);

    if (norm < 1e-10) {
      return centroid;
    }

    const invNorm = 1.0 / norm;
    for (let j = 0; j < dim; j++) {
      centroid[j] *= invNorm;
    }

    return centroid;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  /**
   * Classify a cosine similarity score into a match level.
   *
   * @param similarity – Cosine similarity value.
   * @returns Match classification tier.
   */
  static classifyMatch(similarity: number): MatchLevel {
    if (similarity >= MATCH_THRESHOLD) {
      return 'HIGH_CONFIDENCE';
    }
    if (similarity >= LOW_CONFIDENCE_THRESHOLD) {
      return 'LOW_CONFIDENCE';
    }
    return 'NO_MATCH';
  }
}
