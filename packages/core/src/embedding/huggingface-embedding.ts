import type { EmbeddingVector } from './base-embedding'
import { Embedding } from './base-embedding'

export type HuggingFaceDtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'

export interface HuggingFaceEmbeddingConfig {
  model?: string
  dtype?: HuggingFaceDtype
  queryPrefix?: string
  cacheDir?: string
}

// Lazy-loaded types to avoid immediate import
type TransformersModule = typeof import('@huggingface/transformers')
type AutoModelType = Awaited<ReturnType<TransformersModule['AutoModel']['from_pretrained']>>
type AutoTokenizerType = Awaited<ReturnType<TransformersModule['AutoTokenizer']['from_pretrained']>>

export class HuggingFaceEmbedding extends Embedding {
  protected maxTokens: number = 512
  private model: AutoModelType | null = null
  private tokenizer: AutoTokenizerType | null = null
  private dimension: number = 768
  private config: HuggingFaceEmbeddingConfig
  private modelLoading: Promise<void> | null = null
  private transformersModule: TransformersModule | null = null

  constructor(config: HuggingFaceEmbeddingConfig = {}) {
    super()
    this.config = {
      model: config.model || 'MongoDB/mdbr-leaf-ir',
      dtype: config.dtype || 'fp32',
      queryPrefix: config.queryPrefix,
      cacheDir: config.cacheDir,
    }

    // Set dimension and query prefix based on model
    const modelId = this.config.model ?? 'MongoDB/mdbr-leaf-ir'
    const modelInfo = HuggingFaceEmbedding.getSupportedModels()[modelId]
    if (modelInfo) {
      this.dimension = modelInfo.dimension
      this.maxTokens = modelInfo.maxTokens
      // Use model-specific query prefix if not overridden
      if (this.config.queryPrefix === undefined) {
        this.config.queryPrefix = modelInfo.queryPrefix
      }
    }
  }

  /**
   * Get list of supported LEAF models
   */
  static getSupportedModels(): Record<string, {
    dimension: number
    maxTokens: number
    description: string
    queryPrefix?: string
  }> {
    return {
      'MongoDB/mdbr-leaf-ir': {
        dimension: 768,
        maxTokens: 512,
        description: 'LEAF model optimized for information retrieval and semantic search (DEFAULT)',
        queryPrefix: 'Represent this sentence for searching relevant passages: ',
      },
      'MongoDB/mdbr-leaf-mt': {
        dimension: 768,
        maxTokens: 512,
        description: 'LEAF multi-task model for classification, clustering, and sentence similarity',
        queryPrefix: undefined, // MT model doesn't use query prefix
      },
    }
  }

  /**
   * Lazy load transformers module
   */
  private async getTransformersModule(): Promise<TransformersModule> {
    if (!this.transformersModule) {
      this.transformersModule = await import('@huggingface/transformers')

      // Configure cache directory if specified
      if (this.config.cacheDir) {
        this.transformersModule.env.cacheDir = this.config.cacheDir
      }
    }
    return this.transformersModule
  }

  /**
   * Lazy load model and tokenizer on first use
   */
  private async ensureModel(): Promise<void> {
    // If already loaded, return immediately
    if (this.model && this.tokenizer) {
      return
    }

    // If loading is in progress, wait for it
    if (this.modelLoading) {
      await this.modelLoading
      return
    }

    // Start loading
    this.modelLoading = this.loadModel()
    await this.modelLoading
  }

  /**
   * Actually load the model and tokenizer
   */
  private async loadModel(): Promise<void> {
    try {
      const transformers = await this.getTransformersModule()
      const modelId = this.config.model ?? 'MongoDB/mdbr-leaf-ir'

      console.log(`[HuggingFace] Loading model: ${modelId} (dtype: ${this.config.dtype})`)

      // Load tokenizer and model in parallel
      const [tokenizer, model] = await Promise.all([
        transformers.AutoTokenizer.from_pretrained(modelId),
        transformers.AutoModel.from_pretrained(modelId, {
          dtype: this.config.dtype,
        }),
      ])

      this.tokenizer = tokenizer
      this.model = model

      console.log(`[HuggingFace] Model loaded successfully: ${modelId}`)
    }
    catch (error) {
      this.modelLoading = null // Reset so it can be retried
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to load HuggingFace model ${this.config.model}: ${errorMessage}`)
    }
  }

  /**
   * Apply query prefix if configured (for IR models)
   */
  private applyQueryPrefix(text: string): string {
    if (this.config.queryPrefix) {
      return this.config.queryPrefix + text
    }
    return text
  }

  async detectDimension(): Promise<number> {
    // LEAF models have fixed dimensions, no dynamic detection needed
    return this.dimension
  }

  async embed(text: string): Promise<EmbeddingVector> {
    await this.ensureModel()

    const processedText = this.preprocessText(text)
    const prefixedText = this.applyQueryPrefix(processedText)

    try {
      // Tokenize
      const inputs = await this.tokenizer!([prefixedText], { padding: true })

      // Get embeddings
      const outputs = await this.model!(inputs)

      // Extract sentence embedding
      if (!outputs.sentence_embedding) {
        throw new Error('Model did not return sentence_embedding')
      }

      // Convert tensor to array
      const embedding = outputs.sentence_embedding.tolist()[0] as number[]

      return {
        vector: embedding,
        dimension: embedding.length,
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const err = new Error(`HuggingFace embedding failed: ${errorMessage}`)
      ;(err as Error & { cause?: unknown }).cause = error
      throw err
    }
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    if (texts.length === 0) {
      return []
    }

    await this.ensureModel()

    const processedTexts = this.preprocessTexts(texts)
    const prefixedTexts = processedTexts.map(text => this.applyQueryPrefix(text))

    try {
      // Tokenize batch
      const inputs = await this.tokenizer!(prefixedTexts, { padding: true })

      // Get embeddings
      const outputs = await this.model!(inputs)

      // Extract sentence embeddings
      if (!outputs.sentence_embedding) {
        throw new Error('Model did not return sentence_embedding')
      }

      // Convert tensor to array
      const embeddings = outputs.sentence_embedding.tolist() as number[][]

      return embeddings.map(embedding => ({
        vector: embedding,
        dimension: embedding.length,
      }))
    }
    catch (error) {
      // Fallback: process individually if batch fails
      const batchErrorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`[HuggingFace] Batch embedding failed: ${batchErrorMessage}, falling back to individual processing`)

      const results: EmbeddingVector[] = []
      for (const text of texts) {
        try {
          const result = await this.embed(text)
          results.push(result)
        }
        catch (individualError) {
          const err = new Error(`HuggingFace batch embedding failed (both batch and individual attempts failed): ${batchErrorMessage}`)
          ;(err as Error & { cause?: unknown }).cause = individualError
          throw err
        }
      }

      return results
    }
  }

  getDimension(): number {
    return this.dimension
  }

  getProvider(): string {
    return 'HuggingFace'
  }

  /**
   * Get the current model ID
   */
  getModel(): string {
    return this.config.model ?? 'MongoDB/mdbr-leaf-ir'
  }

  /**
   * Get the current dtype setting
   */
  getDtype(): HuggingFaceDtype {
    return this.config.dtype ?? 'fp32'
  }

  /**
   * Get the query prefix (if any)
   */
  getQueryPrefix(): string | undefined {
    return this.config.queryPrefix
  }

  /**
   * Check if model is loaded
   */
  isModelLoaded(): boolean {
    return this.model !== null && this.tokenizer !== null
  }

  /**
   * Preload the model (optional, for eager loading)
   */
  async preload(): Promise<void> {
    await this.ensureModel()
  }
}
