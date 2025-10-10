import { describe, it, expect, beforeEach } from 'vitest';
import { Embedding, EmbeddingVector } from '../../src/embedding/base-embedding';

// Create a concrete implementation for testing
class TestEmbedding extends Embedding {
  protected maxTokens = 100;
  private dimension = 128;

  async detectDimension(_testText?: string): Promise<number> {
    return this.dimension;
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const processedText = this.preprocessText(text);
    // Return mock vector
    return {
      vector: new Array(this.dimension).fill(0.1),
      dimension: this.dimension,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const processedTexts = this.preprocessTexts(texts);
    return processedTexts.map(() => ({
      vector: new Array(this.dimension).fill(0.1),
      dimension: this.dimension,
    }));
  }

  getDimension(): number {
    return this.dimension;
  }

  getProvider(): string {
    return 'test-provider';
  }

  // Expose protected methods for testing
  public testPreprocessText(text: string): string {
    return this.preprocessText(text);
  }

  public testPreprocessTexts(texts: string[]): string[] {
    return this.preprocessTexts(texts);
  }
}

describe('Embedding (base class)', () => {
  let embedding: TestEmbedding;

  beforeEach(() => {
    embedding = new TestEmbedding();
  });

  describe('preprocessText', () => {
    it('should replace empty string with single space', () => {
      const result = embedding.testPreprocessText('');
      expect(result).toBe(' ');
    });

    it('should return text unchanged if within token limit', () => {
      const shortText = 'This is a short text';
      const result = embedding.testPreprocessText(shortText);
      expect(result).toBe(shortText);
    });

    it('should truncate text if exceeds max tokens', () => {
      // maxTokens = 100, so maxChars = 400
      const longText = 'a'.repeat(500);
      const result = embedding.testPreprocessText(longText);

      expect(result.length).toBeLessThanOrEqual(400);
      expect(result).toBe('a'.repeat(400));
    });

    it('should handle text exactly at the limit', () => {
      const text = 'a'.repeat(400); // Exactly at maxChars
      const result = embedding.testPreprocessText(text);

      expect(result).toBe(text);
    });

    it('should handle text with special characters', () => {
      const text = 'Hello\nWorld\t!@#$%^&*()';
      const result = embedding.testPreprocessText(text);

      expect(result).toBe(text);
    });

    it('should handle unicode characters', () => {
      const text = 'Hello 世界 🌍';
      const result = embedding.testPreprocessText(text);

      expect(result).toBe(text);
    });
  });

  describe('preprocessTexts', () => {
    it('should preprocess array of texts', () => {
      const texts = ['text1', 'text2', 'text3'];
      const results = embedding.testPreprocessTexts(texts);

      expect(results).toHaveLength(3);
      expect(results).toEqual(texts);
    });

    it('should handle empty strings in array', () => {
      const texts = ['', 'text', ''];
      const results = embedding.testPreprocessTexts(texts);

      expect(results).toEqual([' ', 'text', ' ']);
    });

    it('should truncate long texts in array', () => {
      const texts = ['short', 'a'.repeat(500), 'medium'];
      const results = embedding.testPreprocessTexts(texts);

      expect(results[0]).toBe('short');
      expect(results[1].length).toBe(400);
      expect(results[2]).toBe('medium');
    });

    it('should handle empty array', () => {
      const results = embedding.testPreprocessTexts([]);
      expect(results).toEqual([]);
    });
  });

  describe('abstract method implementations', () => {
    it('should implement detectDimension', async () => {
      const dimension = await embedding.detectDimension();
      expect(dimension).toBe(128);
    });

    it('should implement embed', async () => {
      const result = await embedding.embed('test text');

      expect(result).toHaveProperty('vector');
      expect(result).toHaveProperty('dimension');
      expect(result.dimension).toBe(128);
      expect(result.vector).toHaveLength(128);
    });

    it('should implement embedBatch', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const results = await embedding.embedBatch(texts);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('vector');
        expect(result).toHaveProperty('dimension');
        expect(result.dimension).toBe(128);
      });
    });

    it('should implement getDimension', () => {
      const dimension = embedding.getDimension();
      expect(dimension).toBe(128);
    });

    it('should implement getProvider', () => {
      const provider = embedding.getProvider();
      expect(provider).toBe('test-provider');
    });
  });

  describe('integration', () => {
    it('should preprocess text before embedding', async () => {
      const emptyText = '';
      const result = await embedding.embed(emptyText);

      // Should have processed empty string to space
      expect(result.vector).toBeDefined();
      expect(result.dimension).toBe(128);
    });

    it('should preprocess texts before batch embedding', async () => {
      const texts = ['', 'a'.repeat(500), 'normal'];
      const results = await embedding.embedBatch(texts);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.vector).toBeDefined();
        expect(result.dimension).toBe(128);
      });
    });
  });
});
