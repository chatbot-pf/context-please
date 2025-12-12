import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeminiEmbedding } from '../../src/embedding/gemini-embedding'

// Create a persistent mock function
const mockEmbedContent = vi.fn()

// Mock the @google/genai module
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        embedContent: mockEmbedContent,
      },
    })),
  }
})

describe('geminiEmbedding', () => {
  let embedding: GeminiEmbedding

  beforeEach(() => {
    // Clear calls history and restore default implementation
    mockEmbedContent.mockClear()
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: Array.from({ length: 3072 }).fill(0.1) }],
    })

    embedding = new GeminiEmbedding({
      model: 'gemini-embedding-001',
      apiKey: 'test-api-key',
    })
  })

  // ============================================================================
  // 1. Constructor & Configuration (4 tests)
  // ============================================================================
  describe('constructor & configuration', () => {
    it('should initialize with default configuration', () => {
      const config = embedding.getRetryConfig()
      expect(config.maxRetries).toBe(3)
      expect(config.baseDelay).toBe(1000)
      expect(embedding.getDimension()).toBe(3072)
    })

    it('should initialize with custom retry configuration', () => {
      const customEmbedding = new GeminiEmbedding({
        model: 'gemini-embedding-001',
        apiKey: 'test-api-key',
        maxRetries: 5,
        baseDelay: 2000,
      })
      const config = customEmbedding.getRetryConfig()
      expect(config.maxRetries).toBe(5)
      expect(config.baseDelay).toBe(2000)
    })

    it('should initialize with custom output dimensionality', () => {
      const customEmbedding = new GeminiEmbedding({
        model: 'gemini-embedding-001',
        apiKey: 'test-api-key',
        outputDimensionality: 768,
      })
      expect(customEmbedding.getDimension()).toBe(768)
    })

    it('should initialize with custom base URL', () => {
      const customEmbedding = new GeminiEmbedding({
        model: 'gemini-embedding-001',
        apiKey: 'test-api-key',
        baseURL: 'https://custom-api.example.com',
      })
      expect(customEmbedding.getProvider()).toBe('Gemini')
    })
  })

  // ============================================================================
  // 2. Basic Functionality (4 tests)
  // ============================================================================
  describe('basic functionality', () => {
    it('should embed single text successfully', async () => {
      const mockResponse = {
        embeddings: [
          {
            values: Array.from({ length: 3072 }).fill(0.1),
          },
        ],
      }
      mockEmbedContent.mockResolvedValue(mockResponse)

      const result = await embedding.embed('test text')

      expect(result.vector).toHaveLength(3072)
      expect(result.dimension).toBe(3072)
      expect(mockEmbedContent).toHaveBeenCalledTimes(1)
    })

    it('should embed batch of texts successfully', async () => {
      const mockResponse = {
        embeddings: [
          { values: Array.from({ length: 3072 }).fill(0.1) },
          { values: Array.from({ length: 3072 }).fill(0.2) },
          { values: Array.from({ length: 3072 }).fill(0.3) },
        ],
      }
      mockEmbedContent.mockResolvedValue(mockResponse)

      const results = await embedding.embedBatch(['text1', 'text2', 'text3'])

      expect(results).toHaveLength(3)
      expect(results[0].dimension).toBe(3072)
      expect(mockEmbedContent).toHaveBeenCalledTimes(1)
    })

    it('should handle empty input gracefully', async () => {
      const mockResponse = {
        embeddings: [
          {
            values: Array.from({ length: 3072 }).fill(0.1),
          },
        ],
      }
      mockEmbedContent.mockResolvedValue(mockResponse)

      const result = await embedding.embed('')

      expect(result.vector).toHaveLength(3072)
      expect(result.dimension).toBe(3072)
    })

    it('should return correct provider name', () => {
      expect(embedding.getProvider()).toBe('Gemini')
    })
  })

  // ============================================================================
  // 3. Error Classification (4 tests)
  // ============================================================================
  describe('error classification', () => {
    it('should identify network errors as retryable', () => {
      const networkErrors = [
        { code: 'ECONNREFUSED' },
        { code: 'ETIMEDOUT' },
        { code: 'ENOTFOUND' },
        { code: 'EAI_AGAIN' },
      ]

      networkErrors.forEach((error) => {
        expect((embedding as any).isRetryableError(error)).toBe(true)
      })
    })

    it('should identify retryable HTTP status codes', () => {
      const retryableErrors = [
        { status: 429 }, // Rate limit
        { status: 500 }, // Internal server error
        { status: 502 }, // Bad gateway
        { status: 503 }, // Service unavailable
        { status: 504 }, // Gateway timeout
      ]

      retryableErrors.forEach((error) => {
        expect((embedding as any).isRetryableError(error)).toBe(true)
      })
    })

    it('should identify error message patterns as retryable', () => {
      const retryableErrors = [
        { message: 'Rate limit exceeded' },
        { message: 'Quota exceeded' },
        { message: 'Service unavailable' },
        { message: 'Connection timeout' },
        { message: 'Connection reset' },
      ]

      retryableErrors.forEach((error) => {
        expect((embedding as any).isRetryableError(error)).toBe(true)
      })
    })

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        { status: 400 }, // Bad request
        { status: 401 }, // Unauthorized
        { status: 403 }, // Forbidden
        { message: 'Invalid API key' },
        { message: 'Malformed request' },
      ]

      nonRetryableErrors.forEach((error) => {
        expect((embedding as any).isRetryableError(error)).toBe(false)
      })
    })
  })

  // ============================================================================
  // 4. Retry Mechanism (4 tests)
  // ============================================================================
  describe('retry mechanism', () => {
    it('should retry on retryable errors with exponential backoff', async () => {
      let attemptCount = 0
      mockEmbedContent.mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          const error = new Error('Rate limit exceeded')
          ;(error as any).status = 429
          throw error
        }
        return Promise.resolve({
          embeddings: [{ values: Array.from({ length: 3072 }).fill(0.1) }],
        })
      })

      const result = await embedding.embed('test text')

      expect(result.vector).toHaveLength(3072)
      expect(attemptCount).toBe(3)
    })

    it('should respect maxRetries limit', async () => {
      embedding.setMaxRetries(1)
      mockEmbedContent.mockRejectedValue({
        status: 429,
        message: 'Rate limit exceeded',
      })

      await expect(embedding.embed('test text')).rejects.toThrow()
      expect(mockEmbedContent).toHaveBeenCalledTimes(2) // Initial + 1 retry
    })

    it('should not retry on non-retryable errors', async () => {
      mockEmbedContent.mockRejectedValue({
        status: 401,
        message: 'Invalid API key',
      })

      await expect(embedding.embed('test text')).rejects.toThrow()
      expect(mockEmbedContent).toHaveBeenCalledTimes(1)
    })

    it('should cap delay at 10 seconds', async () => {
      embedding.setMaxRetries(10)
      embedding.setBaseDelay(5000)

      let attemptCount = 0
      const delays: number[] = []
      const originalSetTimeout = globalThis.setTimeout

      vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback: any, delay: number) => {
        delays.push(delay)
        return originalSetTimeout(callback, 0) as any
      })

      mockEmbedContent.mockImplementation(() => {
        attemptCount++
        if (attemptCount < 5) {
          const error = new Error('Service unavailable')
          ;(error as any).status = 503
          throw error
        }
        return Promise.resolve({
          embeddings: [{ values: Array.from({ length: 3072 }).fill(0.1) }],
        })
      })

      await embedding.embed('test text')

      // Check that delay is capped at 10000ms
      delays.forEach((delay) => {
        expect(delay).toBeLessThanOrEqual(10000)
      })

      vi.restoreAllMocks()
    })
  })

  // ============================================================================
  // 5. Batch Processing with Fallback (3 tests)
  // ============================================================================
  describe('batch processing with fallback', () => {
    it('should fallback to individual requests when batch fails', async () => {
      let callCount = 0

      mockEmbedContent.mockImplementation(() => {
        callCount++
        // First call (batch) fails with non-retryable error
        if (callCount === 1) {
          return Promise.reject(new Error('Batch processing failed'))
        }
        // Subsequent calls (individual) succeed
        return Promise.resolve({
          embeddings: [{ values: Array.from({ length: 3072 }).fill(0.1) }],
        })
      })

      const results = await embedding.embedBatch(['text1', 'text2', 'text3'])

      expect(results).toHaveLength(3)
      expect(callCount).toBe(4) // 1 batch + 3 individual
    })

    it('should preserve order in fallback mode', async () => {
      let callCount = 0

      mockEmbedContent.mockImplementation(() => {
        callCount++
        // First call (batch) fails with non-retryable error
        if (callCount === 1) {
          return Promise.reject(new Error('Batch processing failed'))
        }
        // Subsequent individual calls succeed with different values
        return Promise.resolve({
          embeddings: [{ values: Array.from({ length: 3072 }).fill(callCount * 0.1) }],
        })
      })

      const results = await embedding.embedBatch(['text1', 'text2', 'text3'])

      expect(results).toHaveLength(3)
      expect(results[0].vector[0]).toBeCloseTo(0.2) // callCount = 2
      expect(results[1].vector[0]).toBeCloseTo(0.3) // callCount = 3
      expect(results[2].vector[0]).toBeCloseTo(0.4) // callCount = 4
    })

    it('should throw error if both batch and individual requests fail', async () => {
      mockEmbedContent.mockRejectedValue({
        status: 401,
        message: 'Invalid API key',
      })

      await expect(embedding.embedBatch(['text1', 'text2'])).rejects.toThrow()
    })
  })

  // ============================================================================
  // 6. Configuration Methods (4 tests)
  // ============================================================================
  describe('configuration methods', () => {
    it('should update model and dimension', () => {
      embedding.setModel('gemini-embedding-001')
      expect(embedding.getDimension()).toBe(3072)
    })

    it('should update output dimensionality', () => {
      embedding.setOutputDimensionality(768)
      expect(embedding.getDimension()).toBe(768)
    })

    it('should update retry configuration', () => {
      embedding.setMaxRetries(5)
      embedding.setBaseDelay(2000)

      const config = embedding.getRetryConfig()
      expect(config.maxRetries).toBe(5)
      expect(config.baseDelay).toBe(2000)
    })

    it('should validate retry configuration parameters', () => {
      expect(() => embedding.setMaxRetries(-1)).toThrow('maxRetries must be non-negative')
      expect(() => embedding.setBaseDelay(0)).toThrow('baseDelay must be positive')
      expect(() => embedding.setBaseDelay(-100)).toThrow('baseDelay must be positive')
    })
  })

  // ============================================================================
  // 7. Model Support (3 tests)
  // ============================================================================
  describe('model support', () => {
    it('should support gemini-embedding-001', () => {
      const models = GeminiEmbedding.getSupportedModels()
      expect(models['gemini-embedding-001']).toBeDefined()
      expect(models['gemini-embedding-001'].dimension).toBe(3072)
    })

    it('should validate supported dimensions', () => {
      expect(embedding.isDimensionSupported(3072)).toBe(true)
      expect(embedding.isDimensionSupported(1536)).toBe(true)
      expect(embedding.isDimensionSupported(768)).toBe(true)
      expect(embedding.isDimensionSupported(256)).toBe(true)
      expect(embedding.isDimensionSupported(512)).toBe(false)
    })

    it('should get supported dimensions for model', () => {
      const dimensions = embedding.getSupportedDimensions()
      expect(dimensions).toEqual([3072, 1536, 768, 256])
    })
  })

  // ============================================================================
  // 8. Edge Cases (6 tests)
  // ============================================================================
  describe('edge cases', () => {
    it('should handle invalid API response', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: null,
      })

      await expect(embedding.embed('test')).rejects.toThrow()
    })

    it('should handle missing embedding values', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: null }],
      })

      await expect(embedding.embed('test')).rejects.toThrow()
    })

    it('should handle concurrent requests', async () => {
      mockEmbedContent.mockImplementation(() => {
        return Promise.resolve({
          embeddings: [{ values: Array.from({ length: 3072 }).fill(0.1) }],
        })
      })

      const promises = [
        embedding.embed('text1'),
        embedding.embed('text2'),
        embedding.embed('text3'),
      ]

      const results = await Promise.all(promises)
      expect(results).toHaveLength(3)
      expect(mockEmbedContent).toHaveBeenCalledTimes(3)
    })

    it('should handle null/undefined text input', async () => {
      mockEmbedContent.mockImplementation(() => {
        return Promise.resolve({
          embeddings: [{ values: Array.from({ length: 3072 }).fill(0.1) }],
        })
      })

      // preprocessText should convert null/undefined to ' '
      const result = await embedding.embed(null as any)
      expect(result.vector).toHaveLength(3072)
    })

    it('should handle empty batch array', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [],
      })

      const results = await embedding.embedBatch([])
      expect(results).toEqual([])
    })

    it('should get client instance', () => {
      const client = embedding.getClient()
      expect(client).toBeDefined()
    })
  })

  // ============================================================================
  // 9. Performance (2 tests)
  // ============================================================================
  describe('performance', () => {
    it('should complete embedding within reasonable time', async () => {
      mockEmbedContent.mockImplementation(() => {
        return Promise.resolve({
          embeddings: [{ values: Array.from({ length: 3072 }).fill(0.1) }],
        })
      })

      const startTime = Date.now()
      await embedding.embed('test text')
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(1000) // Should complete in less than 1 second
    })

    it('should handle large batch efficiently', async () => {
      const largeBatch = Array.from({ length: 100 }).fill('test text')
      mockEmbedContent.mockImplementation(() => {
        return Promise.resolve({
          embeddings: largeBatch.map(() => ({ values: Array.from({ length: 3072 }).fill(0.1) })),
        })
      })

      const results = await embedding.embedBatch(largeBatch)
      expect(results).toHaveLength(100)
    })
  })

  // ============================================================================
  // 10. Detect Dimension (1 test - bonus test for completeness)
  // ============================================================================
  describe('dimension detection', () => {
    it('should detect dimension without API call', async () => {
      const dimension = await embedding.detectDimension()
      expect(dimension).toBe(3072)
      expect(mockEmbedContent).not.toHaveBeenCalled()
    })
  })
})
