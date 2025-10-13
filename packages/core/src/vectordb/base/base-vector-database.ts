import type {
  HybridSearchOptions,
  HybridSearchRequest,
  HybridSearchResult,
  SearchOptions,
  VectorDatabase,
  VectorDocument,
  VectorSearchResult,
} from '../types'

/**
 * Base configuration interface for all vector databases
 */
export interface BaseDatabaseConfig {
  address?: string
  token?: string
  username?: string
  password?: string
}

/**
 * Abstract base class for vector database implementations
 *
 * Provides common functionality:
 * - Asynchronous initialization pattern
 * - Configuration management
 * - Address resolution
 *
 * Subclasses must implement:
 * - initialize(): Database-specific initialization logic
 * - All VectorDatabase interface methods
 *
 * @template TConfig - The configuration type for the database
 */
export abstract class BaseVectorDatabase<TConfig extends BaseDatabaseConfig = BaseDatabaseConfig> implements VectorDatabase {
  protected config: TConfig
  protected initializationPromise: Promise<void>

  constructor(config: TConfig) {
    this.config = config
    this.initializationPromise = this.initialize()
  }

  /**
   * Initialize the database connection
   * Called automatically in constructor
   * Subclasses should implement database-specific initialization
   */
  protected abstract initialize(): Promise<void>

  /**
   * Ensure initialization is complete before method execution
   * Should be called at the start of every public method
   */
  protected async ensureInitialized(): Promise<void> {
    await this.initializationPromise
  }

  /**
   * Ensure collection is loaded before search/query operations
   * Subclasses should implement database-specific loading logic
   */
  protected abstract ensureLoaded(collectionName: string): Promise<void>

  // VectorDatabase interface methods (must be implemented by subclasses)
  abstract createCollection(
    collectionName: string,
    dimension: number,
    description?: string
  ): Promise<void>

  abstract createHybridCollection(
    collectionName: string,
    dimension: number,
    description?: string
  ): Promise<void>

  abstract dropCollection(collectionName: string): Promise<void>

  abstract hasCollection(collectionName: string): Promise<boolean>

  abstract listCollections(): Promise<string[]>

  abstract insert(
    collectionName: string,
    documents: VectorDocument[]
  ): Promise<void>

  abstract insertHybrid(
    collectionName: string,
    documents: VectorDocument[]
  ): Promise<void>

  abstract search(
    collectionName: string,
    queryVector: number[],
    options?: SearchOptions
  ): Promise<VectorSearchResult[]>

  abstract hybridSearch(
    collectionName: string,
    searchRequests: HybridSearchRequest[],
    options?: HybridSearchOptions
  ): Promise<HybridSearchResult[]>

  abstract delete(collectionName: string, ids: string[]): Promise<void>

  abstract query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number
  ): Promise<Record<string, any>[]>

  abstract checkCollectionLimit(): Promise<boolean>
}
