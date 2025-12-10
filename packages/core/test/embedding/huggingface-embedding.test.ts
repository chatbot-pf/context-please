import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HuggingFaceEmbedding } from '../../src/embedding/huggingface-embedding'

// Mock the @huggingface/transformers module
const mockFromPretrainedTokenizer = vi.fn()
const mockFromPretrainedModel = vi.fn()
const mockTokenizer = vi.fn()
const mockModel = vi.fn()

vi.mock('@huggingface/transformers', () => {
  return {
    AutoTokenizer: {
      from_pretrained: mockFromPretrainedTokenizer,
    },
    AutoModel: {
      from_pretrained: mockFromPretrainedModel,
    },
    env: {
      cacheDir: undefined,
    },
  }
})

describe('HuggingFaceEmbedding', () => {
  let embedding: HuggingFaceEmbedding

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks()

    // Setup default mock implementations
    mockFromPretrainedTokenizer.mockResolvedValue(mockTokenizer)
    mockFromPretrainedModel.mockResolvedValue(mockModel)

    mockTokenizer.mockReturnValue({
      input_ids: { dims: [1, 10] },
      attention_mask: { dims: [1, 10] },
    })

    mockModel.mockResolvedValue({
      sentence_embedding: {
        tolist: () => [[...new Array(768).fill(0.1)]],
      },
    })

    embedding = new HuggingFaceEmbedding()
  })

  // ============================================================================
  // 1. Constructor & Configuration (4 tests)
  // ============================================================================
  describe('constructor & configuration', () => {
    it('should initialize with default configuration', () => {
      expect(embedding.getModel()).toBe('MongoDB/mdbr-leaf-ir')
      expect(embedding.getDtype()).toBe('fp32')
      expect(embedding.getDimension()).toBe(768)
      expect(embedding.getQueryPrefix()).toBe('Represent this sentence for searching relevant passages: ')
    })

    it('should initialize with custom model', () => {
      const customEmbedding = new HuggingFaceEmbedding({
        model: 'MongoDB/mdbr-leaf-mt',
      })
      expect(customEmbedding.getModel()).toBe('MongoDB/mdbr-leaf-mt')
      expect(customEmbedding.getQueryPrefix()).toBeUndefined() // MT model has no prefix
    })

    it('should initialize with custom dtype', () => {
      const customEmbedding = new HuggingFaceEmbedding({
        dtype: 'q8',
      })
      expect(customEmbedding.getDtype()).toBe('q8')
    })

    it('should allow custom query prefix override', () => {
      const customEmbedding = new HuggingFaceEmbedding({
        queryPrefix: 'Custom prefix: ',
      })
      expect(customEmbedding.getQueryPrefix()).toBe('Custom prefix: ')
    })
  })

  // ============================================================================
  // 2. Model Loading (3 tests)
  // ============================================================================
  describe('model loading', () => {
    it('should lazy load model on first embed call', async () => {
      expect(embedding.isModelLoaded()).toBe(false)

      await embedding.embed('test text')

      expect(embedding.isModelLoaded()).toBe(true)
      expect(mockFromPretrainedTokenizer).toHaveBeenCalledTimes(1)
      expect(mockFromPretrainedModel).toHaveBeenCalledTimes(1)
    })

    it('should cache model after first load', async () => {
      await embedding.embed('text1')
      await embedding.embed('text2')
      await embedding.embed('text3')

      // Should only load once despite multiple embed calls
      expect(mockFromPretrainedTokenizer).toHaveBeenCalledTimes(1)
      expect(mockFromPretrainedModel).toHaveBeenCalledTimes(1)
    })

    it('should load model with correct dtype', async () => {
      const q8Embedding = new HuggingFaceEmbedding({ dtype: 'q8' })
      await q8Embedding.embed('test')

      expect(mockFromPretrainedModel).toHaveBeenCalledWith(
        'MongoDB/mdbr-leaf-ir',
        { dtype: 'q8' },
      )
    })
  })

  // ============================================================================
  // 3. Embedding Generation (4 tests)
  // ============================================================================
  describe('embedding generation', () => {
    it('should embed single text successfully', async () => {
      const result = await embedding.embed('test text')

      expect(result.vector).toHaveLength(768)
      expect(result.dimension).toBe(768)
      expect(mockTokenizer).toHaveBeenCalled()
      expect(mockModel).toHaveBeenCalled()
    })

    it('should embed batch of texts successfully', async () => {
      mockModel.mockResolvedValue({
        sentence_embedding: {
          tolist: () => [
            [...new Array(768).fill(0.1)],
            [...new Array(768).fill(0.2)],
            [...new Array(768).fill(0.3)],
          ],
        },
      })

      const results = await embedding.embedBatch(['text1', 'text2', 'text3'])

      expect(results).toHaveLength(3)
      expect(results[0].dimension).toBe(768)
      expect(results[1].dimension).toBe(768)
      expect(results[2].dimension).toBe(768)
    })

    it('should handle empty batch array', async () => {
      const results = await embedding.embedBatch([])
      expect(results).toEqual([])
    })

    it('should handle empty input text', async () => {
      const result = await embedding.embed('')

      expect(result.vector).toHaveLength(768)
      expect(result.dimension).toBe(768)
    })
  })

  // ============================================================================
  // 4. Query Prefix Handling (3 tests)
  // ============================================================================
  describe('query prefix handling', () => {
    it('should apply query prefix for IR model', async () => {
      await embedding.embed('test query')

      expect(mockTokenizer).toHaveBeenCalledWith(
        ['Represent this sentence for searching relevant passages: test query'],
        { padding: true },
      )
    })

    it('should not apply prefix for MT model', async () => {
      const mtEmbedding = new HuggingFaceEmbedding({
        model: 'MongoDB/mdbr-leaf-mt',
      })

      await mtEmbedding.embed('test query')

      expect(mockTokenizer).toHaveBeenCalledWith(
        ['test query'],
        { padding: true },
      )
    })

    it('should apply prefix to batch texts', async () => {
      mockModel.mockResolvedValue({
        sentence_embedding: {
          tolist: () => [
            [...new Array(768).fill(0.1)],
            [...new Array(768).fill(0.2)],
          ],
        },
      })

      await embedding.embedBatch(['query1', 'query2'])

      expect(mockTokenizer).toHaveBeenCalledWith(
        [
          'Represent this sentence for searching relevant passages: query1',
          'Represent this sentence for searching relevant passages: query2',
        ],
        { padding: true },
      )
    })
  })

  // ============================================================================
  // 5. Error Handling (3 tests)
  // ============================================================================
  describe('error handling', () => {
    it('should throw error when model fails to load', async () => {
      mockFromPretrainedModel.mockRejectedValue(new Error('Model not found'))

      await expect(embedding.embed('test')).rejects.toThrow('Failed to load HuggingFace model')
    })

    it('should throw error when model returns no sentence_embedding', async () => {
      mockModel.mockResolvedValue({})

      await expect(embedding.embed('test')).rejects.toThrow('Model did not return sentence_embedding')
    })

    it('should fallback to individual processing when batch fails', async () => {
      let callCount = 0
      mockModel.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // First call (batch) fails
          return Promise.reject(new Error('Batch processing failed'))
        }
        // Individual calls succeed
        return Promise.resolve({
          sentence_embedding: {
            tolist: () => [[...new Array(768).fill(0.1)]],
          },
        })
      })

      const results = await embedding.embedBatch(['text1', 'text2'])

      expect(results).toHaveLength(2)
      expect(callCount).toBe(3) // 1 batch + 2 individual
    })
  })

  // ============================================================================
  // 6. Dimension Detection (2 tests)
  // ============================================================================
  describe('dimension detection', () => {
    it('should detect dimension without API call', async () => {
      const dimension = await embedding.detectDimension()
      expect(dimension).toBe(768)
      // No model loading should have occurred
      expect(mockFromPretrainedModel).not.toHaveBeenCalled()
    })

    it('should return correct dimension for different models', async () => {
      const irEmbedding = new HuggingFaceEmbedding({ model: 'MongoDB/mdbr-leaf-ir' })
      const mtEmbedding = new HuggingFaceEmbedding({ model: 'MongoDB/mdbr-leaf-mt' })

      expect(await irEmbedding.detectDimension()).toBe(768)
      expect(await mtEmbedding.detectDimension()).toBe(768)
    })
  })

  // ============================================================================
  // 7. Supported Models (2 tests)
  // ============================================================================
  describe('supported models', () => {
    it('should list supported LEAF models', () => {
      const models = HuggingFaceEmbedding.getSupportedModels()

      expect(models['MongoDB/mdbr-leaf-ir']).toBeDefined()
      expect(models['MongoDB/mdbr-leaf-mt']).toBeDefined()
    })

    it('should have correct model specifications', () => {
      const models = HuggingFaceEmbedding.getSupportedModels()

      expect(models['MongoDB/mdbr-leaf-ir'].dimension).toBe(768)
      expect(models['MongoDB/mdbr-leaf-ir'].maxTokens).toBe(512)
      expect(models['MongoDB/mdbr-leaf-ir'].queryPrefix).toBe('Represent this sentence for searching relevant passages: ')

      expect(models['MongoDB/mdbr-leaf-mt'].dimension).toBe(768)
      expect(models['MongoDB/mdbr-leaf-mt'].maxTokens).toBe(512)
      expect(models['MongoDB/mdbr-leaf-mt'].queryPrefix).toBeUndefined()
    })
  })

  // ============================================================================
  // 8. Provider Info (2 tests)
  // ============================================================================
  describe('provider info', () => {
    it('should return correct provider name', () => {
      expect(embedding.getProvider()).toBe('HuggingFace')
    })

    it('should return correct dimension', () => {
      expect(embedding.getDimension()).toBe(768)
    })
  })

  // ============================================================================
  // 9. Preload (2 tests)
  // ============================================================================
  describe('preload', () => {
    it('should preload model when called', async () => {
      expect(embedding.isModelLoaded()).toBe(false)

      await embedding.preload()

      expect(embedding.isModelLoaded()).toBe(true)
    })

    it('should not reload if already loaded', async () => {
      await embedding.preload()
      await embedding.preload()

      expect(mockFromPretrainedModel).toHaveBeenCalledTimes(1)
    })
  })

  // ============================================================================
  // 10. Concurrent Requests (2 tests)
  // ============================================================================
  describe('concurrent requests', () => {
    it('should handle concurrent embed calls', async () => {
      const promises = [
        embedding.embed('text1'),
        embedding.embed('text2'),
        embedding.embed('text3'),
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(results.every(r => r.vector.length === 768)).toBe(true)
    })

    it('should load model only once for concurrent initial calls', async () => {
      // Reset to fresh embedding
      embedding = new HuggingFaceEmbedding()

      // Make concurrent calls before model is loaded
      const promises = [
        embedding.embed('text1'),
        embedding.embed('text2'),
        embedding.embed('text3'),
      ]

      await Promise.all(promises)

      // Model should only be loaded once
      expect(mockFromPretrainedModel).toHaveBeenCalledTimes(1)
    })
  })

  // ============================================================================
  // 11. Text Preprocessing (2 tests)
  // ============================================================================
  describe('text preprocessing', () => {
    it('should handle null/undefined input', async () => {
      const result = await embedding.embed(null as any)
      expect(result.vector).toHaveLength(768)
    })

    it('should truncate long text', async () => {
      const longText = 'a'.repeat(10000)
      const result = await embedding.embed(longText)
      expect(result.vector).toHaveLength(768)
    })
  })
})
