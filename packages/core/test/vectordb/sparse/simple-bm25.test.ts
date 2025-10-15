import { beforeEach, describe, expect, it } from 'vitest'
import { SimpleBM25 } from '../../../src/vectordb/sparse/simple-bm25'

describe('simpleBM25', () => {
  let bm25: SimpleBM25

  beforeEach(() => {
    bm25 = new SimpleBM25()
  })

  describe('constructor', () => {
    it('should create instance with default parameters', () => {
      const generator = new SimpleBM25()
      expect(generator).toBeInstanceOf(SimpleBM25)
      expect(generator.isTrained()).toBe(false)
    })

    it('should accept custom k1 parameter', () => {
      const generator = new SimpleBM25({ k1: 2.0 })
      expect(generator).toBeInstanceOf(SimpleBM25)
    })

    it('should accept custom b parameter', () => {
      const generator = new SimpleBM25({ b: 0.5 })
      expect(generator).toBeInstanceOf(SimpleBM25)
    })

    it('should accept stop words', () => {
      const stopWords = new Set(['the', 'a', 'an'])
      const generator = new SimpleBM25({ stopWords })
      expect(generator).toBeInstanceOf(SimpleBM25)
    })
  })

  describe('learn', () => {
    it('should learn from simple corpus', () => {
      // Arrange
      const corpus = [
        'the quick brown fox',
        'the lazy dog',
        'quick fox jumps',
      ]

      // Act
      bm25.learn(corpus)

      // Assert
      expect(bm25.isTrained()).toBe(true)
      expect(bm25.getVocabularySize()).toBeGreaterThan(0)
      expect(bm25.getAverageDocumentLength()).toBeGreaterThan(0)
    })

    it('should calculate correct vocabulary size', () => {
      // Arrange
      const corpus = [
        'word1 word2 word3',
        'word1 word4',
        'word2 word3 word4',
      ]

      // Act
      bm25.learn(corpus)

      // Assert
      // Unique words: word1, word2, word3, word4 = 4
      expect(bm25.getVocabularySize()).toBe(4)
    })

    it('should calculate correct average document length', () => {
      // Arrange
      const corpus = [
        'one two', // 2 tokens
        'three four five', // 3 tokens
        'six', // 1 token
      ]

      // Act
      bm25.learn(corpus)

      // Assert
      // Average = (2 + 3 + 1) / 3 = 2
      expect(bm25.getAverageDocumentLength()).toBe(2)
    })

    it('should throw error for empty corpus', () => {
      // Arrange
      const emptyCorpus: string[] = []

      // Act & Assert
      expect(() => bm25.learn(emptyCorpus)).toThrow('Cannot learn from empty corpus')
    })

    it('should handle corpus with duplicate documents', () => {
      // Arrange
      const corpus = [
        'document one',
        'document one',
        'document two',
      ]

      // Act
      bm25.learn(corpus)

      // Assert
      expect(bm25.isTrained()).toBe(true)
      // Vocabulary: document, one, two = 3
      expect(bm25.getVocabularySize()).toBe(3)
    })

    it('should filter short terms based on minTermLength', () => {
      // Arrange
      const generator = new SimpleBM25({ minTermLength: 3 })
      const corpus = ['a big dog', 'to be or not to be']

      // Act
      generator.learn(corpus)

      // Assert
      // Short terms 'a', 'to', 'be', 'or' should be filtered
      // Remaining: big, dog, not = 3
      expect(generator.getVocabularySize()).toBe(3)
    })

    it('should filter stop words', () => {
      // Arrange
      const stopWords = new Set(['the', 'a', 'an'])
      const generator = new SimpleBM25({ stopWords })
      const corpus = ['the quick fox', 'a lazy dog']

      // Act
      generator.learn(corpus)

      // Assert
      // Filtered: the, a
      // Remaining: quick, fox, lazy, dog = 4
      expect(generator.getVocabularySize()).toBe(4)
    })
  })

  describe('generate', () => {
    beforeEach(() => {
      // Train with a simple corpus
      const corpus = [
        'the quick brown fox jumps over the lazy dog',
        'the dog runs quickly',
        'brown fox is quick',
      ]
      bm25.learn(corpus)
    })

    it('should throw error if not trained', () => {
      // Arrange
      const untrained = new SimpleBM25()
      const text = 'test document'

      // Act & Assert
      expect(() => untrained.generate(text)).toThrow('must be trained')
    })

    it('should generate sparse vector with indices and values', () => {
      // Arrange
      const text = 'quick brown fox'

      // Act
      const vector = bm25.generate(text)

      // Assert
      expect(vector).toHaveProperty('indices')
      expect(vector).toHaveProperty('values')
      expect(Array.isArray(vector.indices)).toBe(true)
      expect(Array.isArray(vector.values)).toBe(true)
      expect(vector.indices.length).toBe(vector.values.length)
    })

    it('should generate non-empty vector for known terms', () => {
      // Arrange
      const text = 'quick fox'

      // Act
      const vector = bm25.generate(text)

      // Assert
      expect(vector.indices.length).toBeGreaterThan(0)
      expect(vector.values.length).toBeGreaterThan(0)
    })

    it('should generate empty vector for unknown terms', () => {
      // Arrange
      const text = 'unknown terms xyz'

      // Act
      const vector = bm25.generate(text)

      // Assert
      expect(vector.indices.length).toBe(0)
      expect(vector.values.length).toBe(0)
    })

    it('should generate different vectors for different texts', () => {
      // Arrange
      const text1 = 'quick fox'
      const text2 = 'lazy dog'

      // Act
      const vector1 = bm25.generate(text1)
      const vector2 = bm25.generate(text2)

      // Assert
      expect(vector1.indices).not.toEqual(vector2.indices)
    })

    it('should assign higher scores to rare terms', () => {
      // Arrange
      // 'fox' appears in 2/3 documents, 'jumps' appears in 1/3
      // 'jumps' should have higher IDF
      const text = 'fox jumps'

      // Act
      const vector = bm25.generate(text)

      // Assert
      expect(vector.values.length).toBe(2)
      // Find indices for 'fox' and 'jumps'
      const vocab = bm25.getVocabulary()
      const idfScores = bm25.getIDFScores()
      const foxScore = idfScores.get('fox') || 0
      const jumpsScore = idfScores.get('jumps') || 0
      // 'jumps' (rarer) should have higher IDF than 'fox'
      expect(jumpsScore).toBeGreaterThan(foxScore)
    })

    it('should apply minScore filter when configured', () => {
      // Arrange
      const text = 'quick brown fox lazy dog'
      const minScore = 0.5

      // Act
      const vector = bm25.generate(text, { minScore })

      // Assert
      // All values should be >= minScore
      vector.values.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(minScore)
      })
    })

    it('should apply maxTerms limit when configured', () => {
      // Arrange
      const text = 'quick brown fox lazy dog'
      const maxTerms = 2

      // Act
      const vector = bm25.generate(text, { maxTerms })

      // Assert
      expect(vector.indices.length).toBeLessThanOrEqual(maxTerms)
      expect(vector.values.length).toBeLessThanOrEqual(maxTerms)
    })

    it('should keep highest scoring terms when applying maxTerms', () => {
      // Arrange
      const text = 'quick brown fox lazy dog'
      const maxTerms = 2

      // Act
      const vectorUnlimited = bm25.generate(text)
      const vectorLimited = bm25.generate(text, { maxTerms })

      // Assert
      expect(vectorLimited.indices.length).toBe(maxTerms)
      // Limited vector should contain the top scoring terms
      const topScores = [...vectorUnlimited.values].sort((a, b) => b - a).slice(0, maxTerms)
      vectorLimited.values.forEach((score) => {
        expect(topScores).toContain(score)
      })
    })

    it('should normalize vector when configured', () => {
      // Arrange
      const text = 'quick brown fox'

      // Act
      const vector = bm25.generate(text, { normalize: true })

      // Assert
      // Calculate L2 norm
      const norm = Math.sqrt(vector.values.reduce((sum, val) => sum + val * val, 0))
      expect(norm).toBeCloseTo(1.0, 5)
    })
  })

  describe('generateBatch', () => {
    beforeEach(() => {
      const corpus = [
        'document one with some words',
        'document two with other words',
        'document three',
      ]
      bm25.learn(corpus)
    })

    it('should generate vectors for multiple texts', () => {
      // Arrange
      const texts = ['document one', 'document two', 'document three']

      // Act
      const vectors = bm25.generateBatch(texts)

      // Assert
      expect(vectors).toHaveLength(3)
      vectors.forEach((vector) => {
        expect(vector).toHaveProperty('indices')
        expect(vector).toHaveProperty('values')
      })
    })

    it('should return empty array for empty input', () => {
      // Arrange
      const texts: string[] = []

      // Act
      const vectors = bm25.generateBatch(texts)

      // Assert
      expect(vectors).toHaveLength(0)
    })

    it('should apply config to all vectors in batch', () => {
      // Arrange
      const texts = ['document one', 'document two']
      const config = { maxTerms: 1 }

      // Act
      const vectors = bm25.generateBatch(texts, config)

      // Assert
      vectors.forEach((vector) => {
        expect(vector.indices.length).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('integration', () => {
    it('should work end-to-end for code search scenario', () => {
      // Arrange
      const codeCorpus = [
        'function calculateTotal(items) { return sum(items); }',
        'class UserManager { constructor() { this.users = []; } }',
        'const fetchData = async () => { return await api.get(); }',
      ]

      const bm25 = new SimpleBM25()
      bm25.learn(codeCorpus)

      const query = 'function calculate'

      // Act
      const vector = bm25.generate(query)

      // Assert
      expect(vector.indices.length).toBeGreaterThan(0)
      expect(vector.values.length).toBeGreaterThan(0)
      // All scores should be positive
      vector.values.forEach((score) => {
        expect(score).toBeGreaterThan(0)
      })
    })

    it('should handle real-world text with special characters', () => {
      // Arrange
      const corpus = [
        'const API_KEY = "sk-1234";',
        'function test() { console.log("Hello, World!"); }',
        'import { Component } from "@angular/core";',
      ]

      const bm25 = new SimpleBM25()
      bm25.learn(corpus)

      const query = 'function console'

      // Act
      const vector = bm25.generate(query)

      // Assert
      expect(vector.indices.length).toBeGreaterThan(0)
    })
  })
})
