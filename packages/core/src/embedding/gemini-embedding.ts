import type { ContentEmbedding } from '@google/genai'
import type { EmbeddingVector } from './base-embedding'
import { retry } from 'es-toolkit'
import { GoogleGenAI } from '@google/genai'
import { Embedding } from './base-embedding'

export interface GeminiEmbeddingConfig {
  model: string
  apiKey: string
  baseURL?: string // Optional custom API endpoint URL
  outputDimensionality?: number // Optional dimension override
  maxRetries?: number // Maximum number of retry attempts (default: 3)
  baseDelay?: number // Base delay in milliseconds for exponential backoff (default: 1000ms)
}

export class GeminiEmbedding extends Embedding {
  private client: GoogleGenAI
  private config: GeminiEmbeddingConfig
  private dimension: number = 3072 // Default dimension for gemini-embedding-001
  protected maxTokens: number = 2048 // Maximum tokens for Gemini embedding models
  private maxRetries: number
  private baseDelay: number

  constructor(config: GeminiEmbeddingConfig) {
    super()
    this.config = config
    this.maxRetries = config.maxRetries ?? 3
    this.baseDelay = config.baseDelay ?? 1000
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
      ...(config.baseURL && {
        httpOptions: {
          baseUrl: config.baseURL,
        },
      }),
    })

    // Set dimension based on model and configuration
    this.updateDimensionForModel(config.model || 'gemini-embedding-001')

    // Override dimension if specified in config
    if (config.outputDimensionality) {
      this.dimension = config.outputDimensionality
    }
  }

  private updateDimensionForModel(model: string): void {
    const supportedModels = GeminiEmbedding.getSupportedModels()
    const modelInfo = supportedModels[model]

    if (modelInfo) {
      this.dimension = modelInfo.dimension
      this.maxTokens = modelInfo.contextLength
    }
    else {
      // Use default dimension and context length for unknown models
      this.dimension = 3072
      this.maxTokens = 2048
    }
  }

  /**
   * Determine if an error is retryable
   * @param error Error object to check
   * @returns True if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false
    }

    // Network errors
    const networkErrorCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']
    if ('code' in error && typeof error.code === 'string' && networkErrorCodes.includes(error.code)) {
      return true
    }

    // HTTP status codes
    const retryableStatusCodes = [429, 500, 502, 503, 504]
    if ('status' in error && typeof error.status === 'number' && retryableStatusCodes.includes(error.status)) {
      return true
    }

    // Error message patterns
    const errorMessage = ('message' in error && typeof error.message === 'string')
      ? error.message.toLowerCase()
      : ''
    const retryablePatterns = [
      'rate limit',
      'quota exceeded',
      'service unavailable',
      'timeout',
      'connection',
    ]

    return retryablePatterns.some(pattern => errorMessage.includes(pattern))
  }

  /**
   * Execute operation with retry logic using es-toolkit retry
   * Only retries on retryable errors (network errors, rate limits, server errors)
   * @param operation Operation to execute
   * @param context Context string for error messages
   * @returns Operation result
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    try {
      return await retry(
        async () => {
          try {
            return await operation()
          }
          catch (error) {
            // If error is not retryable, throw a special error to stop retries
            if (!this.isRetryableError(error)) {
              // Wrap in a non-retryable marker while preserving original error
              const nonRetryableError = new Error(`${context}: ${error instanceof Error ? error.message : 'Unknown error'}`, {
                cause: error,
              })
              ;(nonRetryableError as any).__nonRetryable = true
              throw nonRetryableError
            }
            // Re-throw retryable errors to trigger retry
            throw error
          }
        },
        {
          retries: this.maxRetries,
          delay: (attempts) => Math.min(this.baseDelay * Math.pow(2, attempts), 10000),
        },
      )
    }
    catch (error) {
      // If it's a non-retryable error, throw as-is
      if (typeof error === 'object' && error !== null && (error as any).__nonRetryable) {
        throw error
      }
      // If it was retryable but still failed after all retries
      throw new Error(`${context}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async detectDimension(): Promise<number> {
    // Gemini doesn't need dynamic detection, return configured dimension
    return this.dimension
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const processedText = this.preprocessText(text)
    const model = this.config.model || 'gemini-embedding-001'

    return this.executeWithRetry(async () => {
      const response = await this.client.models.embedContent({
        model,
        contents: processedText,
        config: {
          outputDimensionality: this.config.outputDimensionality || this.dimension,
        },
      })

      if (!response.embeddings || !response.embeddings[0] || !response.embeddings[0].values) {
        throw new Error('Gemini API returned invalid response')
      }

      return {
        vector: response.embeddings[0].values,
        dimension: response.embeddings[0].values.length,
      }
    }, 'Gemini embedding failed')
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const processedTexts = this.preprocessTexts(texts)
    const model = this.config.model || 'gemini-embedding-001'

    // Try batch processing with retry logic
    try {
      return await this.executeWithRetry(async () => {
        const response = await this.client.models.embedContent({
          model,
          contents: processedTexts,
          config: {
            outputDimensionality: this.config.outputDimensionality || this.dimension,
          },
        })

        if (!response.embeddings) {
          throw new Error('Gemini API returned invalid response')
        }

        return response.embeddings.map((embedding: ContentEmbedding) => {
          if (!embedding.values) {
            throw new Error('Gemini API returned invalid embedding data')
          }
          return {
            vector: embedding.values,
            dimension: embedding.values.length,
          }
        })
      }, 'Gemini batch embedding failed')
    }
    catch (batchError) {
      // Fallback: Process individually if batch fails after all retries
      // Add delay between requests to avoid rate limiting
      const results: EmbeddingVector[] = []
      const FALLBACK_DELAY_MS = 100 // Delay between individual requests

      for (let i = 0; i < processedTexts.length; i++) {
        const text = processedTexts[i]
        try {
          // Add delay between requests (except for first)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, FALLBACK_DELAY_MS))
          }

          const result = await this.embed(text)
          results.push(result)
        }
        catch (individualError) {
          // If individual request also fails, re-throw the error with cause
          const error = new Error('Gemini batch embedding failed (both batch and individual attempts failed)', {
            cause: individualError,
          })
          throw error
        }
      }

      return results
    }
  }

  getDimension(): number {
    return this.dimension
  }

  getProvider(): string {
    return 'Gemini'
  }

  /**
   * Set model type
   * @param model Model name
   */
  setModel(model: string): void {
    this.config.model = model
    this.updateDimensionForModel(model)
  }

  /**
   * Set output dimensionality
   * @param dimension Output dimension (must be supported by the model)
   */
  setOutputDimensionality(dimension: number): void {
    this.config.outputDimensionality = dimension
    this.dimension = dimension
  }

  /**
   * Get client instance (for advanced usage)
   */
  getClient(): GoogleGenAI {
    return this.client
  }

  /**
   * Get list of supported models
   */
  static getSupportedModels(): Record<string, { dimension: number, contextLength: number, description: string, supportedDimensions?: number[] }> {
    return {
      'gemini-embedding-001': {
        dimension: 3072,
        contextLength: 2048,
        description: 'Latest Gemini embedding model with state-of-the-art performance (recommended)',
        supportedDimensions: [3072, 1536, 768, 256], // Matryoshka Representation Learning support
      },
    }
  }

  /**
   * Get supported dimensions for the current model
   */
  getSupportedDimensions(): number[] {
    const modelInfo = GeminiEmbedding.getSupportedModels()[this.config.model || 'gemini-embedding-001']
    return modelInfo?.supportedDimensions || [this.dimension]
  }

  /**
   * Validate if a dimension is supported by the current model
   */
  isDimensionSupported(dimension: number): boolean {
    const supportedDimensions = this.getSupportedDimensions()
    return supportedDimensions.includes(dimension)
  }

  /**
   * Get current retry configuration
   * @returns Object containing maxRetries and baseDelay
   */
  getRetryConfig(): { maxRetries: number, baseDelay: number } {
    return {
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
    }
  }

  /**
   * Set maximum number of retry attempts
   * @param maxRetries Maximum retry attempts
   */
  setMaxRetries(maxRetries: number): void {
    if (maxRetries < 0) {
      throw new Error('maxRetries must be non-negative')
    }
    this.maxRetries = maxRetries
  }

  /**
   * Set base delay for exponential backoff
   * @param baseDelay Base delay in milliseconds
   */
  setBaseDelay(baseDelay: number): void {
    if (baseDelay <= 0) {
      throw new Error('baseDelay must be positive')
    }
    this.baseDelay = baseDelay
  }
}
