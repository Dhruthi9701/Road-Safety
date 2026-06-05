import { FaceMatcher } from '../../../src/modules/faceRecognition/FaceMatcher';
import { MockDataFactory } from '../../utils/MockDataFactory';

describe('FaceMatcher', () => {
  describe('Cosine Similarity', () => {
    it('should return 1.0 for identical embeddings', () => {
      const emb1 = MockDataFactory.generateMockEmbedding(128);
      const emb2 = new Float32Array(emb1);
      
      const similarity = FaceMatcher.cosineSimilarity(emb1, emb2);
      expect(similarity).toBeCloseTo(1.0, 2);
    });

    it('should return value between 0 and 1', () => {
      const emb1 = MockDataFactory.generateMockEmbedding(128);
      const emb2 = MockDataFactory.generateMockEmbedding(128);
      
      const similarity = FaceMatcher.cosineSimilarity(emb1, emb2);
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('Match Against Database', () => {
    it('should find match above threshold', () => {
      const users = MockDataFactory.generateMockUsers(5);
      const queryEmbedding = new Float32Array(users[0].embedding);
      
      const result = FaceMatcher.matchAgainstDatabase(queryEmbedding, users);
      
      expect(result.matchLevel).toBe('HIGH_CONFIDENCE');
      expect(result.userId).toBe(users[0].id);
    });

    it('should return no match for empty database', () => {
      const embedding = MockDataFactory.generateMockEmbedding(128);
      
      const result = FaceMatcher.matchAgainstDatabase(embedding, []);
      
      expect(result.matchLevel).toBe('NO_MATCH');
    });
  });
});
