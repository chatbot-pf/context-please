import type { BaseDatabaseConfig } from './base/base-vector-database'
import type { BM25Config } from './sparse/simple-bm25'
import type {
  HybridSearchOptions,
  HybridSearchRequest,
  HybridSearchResult,
  SearchOptions,
  VectorDocument,
  VectorSearchResult,
} from './types'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { Modifier, QdrantClient } from '@qdrant/js-client-grpc'
import { BaseVectorDatabase } from './base/base-vector-database'
import { SimpleBM25 } from './sparse/simple-bm25'

export interface QdrantConfig extends BaseDatabaseConfig {
  /**
   * API key for Qdrant Cloud
   * Optional for self-hosted instances
   */
  apiKey?: string

  /**
   * Connection timeout in milliseconds
   * @default 10000
   */
  timeout?: number

  /**
   * BM25 configuration for sparse vector generation
   */
  bm25Config?: BM25Config
}

/**
 * Qdrant Vector Database implementation using gRPC client
 *
 * Features:
 * - Named vectors (dense + sparse)
 * - Hybrid search with RRF fusion
 * - BM25 sparse vector generation
 * - Self-hosted and cloud support
 *
 * Architecture:
 * - Dense vectors: From embedding providers (OpenAI, VoyageAI, etc.)
 * - Sparse vectors: Generated using SimpleBM25 for keyword matching
 * - Hybrid search: Combines both using Qdrant's prefetch + RRF
 */
export class QdrantVectorDatabase extends BaseVectorDatabase<QdrantConfig> {
  private client: QdrantClient | null = null
  private bm25Generator: SimpleBM25

  // Named vector configurations
  private readonly DENSE_VECTOR_NAME = 'dense'
  private readonly SPARSE_VECTOR_NAME = 'sparse'

  constructor(config: QdrantConfig) {
    super(config)
    this.bm25Generator = new SimpleBM25(config.bm25Config)
  }

  /**
   * Initialize Qdrant client connection
   */
  protected async initialize(): Promise<void> {
    const resolvedAddress = await this.resolveAddress()
    await this.initializeClient(resolvedAddress)
  }

  /**
   * Create Qdrant client instance
   */
  private async initializeClient(address: string): Promise<void> {
    console.log('[QdrantDB] 🔌 Connecting to Qdrant at:', address)

    // Parse address to extract host and port
    const url = new URL(address.startsWith('http') ? address : `http://${address}`)
    const host = url.hostname
    const port = url.port ? Number.parseInt(url.port) : 6334

    this.client = new QdrantClient({
      host,
      port,
      apiKey: this.config.apiKey,
      timeout: this.config.timeout || 10000,
    })

    // Suppress MaxListenersExceededWarning for gRPC connections
    // Multiple operations on the same collection trigger multiple listeners
    // This is normal for gRPC HTTP/2 multiplexing and not a memory leak
    if (this.client && typeof (this.client as any).setMaxListeners === 'function') {
      (this.client as any).setMaxListeners(50)
    }

    console.log('[QdrantDB] ✅ Connected to Qdrant successfully')
  }

  /**
   * Resolve address from config
   * Unlike Milvus, Qdrant doesn't have auto-provisioning
   */
  protected async resolveAddress(): Promise<string> {
    if (!this.config.address) {
      throw new Error('Qdrant address is required. Set QDRANT_URL environment variable.')
    }
    return this.config.address
  }

  /**
   * Override to add client null check
   */
  protected override async ensureInitialized(): Promise<void> {
    await super.ensureInitialized()
    if (!this.client) {
      throw new Error('QdrantClient is not initialized')
    }
  }

  /**
   * Qdrant doesn't require explicit collection loading
   * Collections are loaded on-demand automatically
   */
  protected async ensureLoaded(collectionName: string): Promise<void> {
    // No-op for Qdrant - collections are loaded automatically
    return Promise.resolve()
  }

  /**
   * Create collection with dense vectors only
   */
  async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
    await this.ensureInitialized()

    console.log('[QdrantDB] 🔧 Creating collection:', collectionName)
    console.log('[QdrantDB] 📏 Vector dimension:', dimension)

    await this.client!.api('collections').create({
      collectionName,
      vectorsConfig: {
        config: {
          case: 'paramsMap',
          value: {
            map: {
              [this.DENSE_VECTOR_NAME]: {
                size: BigInt(dimension),
                distance: 1, // Cosine = 1
              },
            },
          },
        },
      },
    })

    console.log('[QdrantDB] ✅ Collection created successfully')
  }

  /**
   * Create collection with hybrid search support (dense + sparse vectors)
   */
  async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
    await this.ensureInitialized()

    console.log('[QdrantDB] 🔧 Creating hybrid collection:', collectionName)
    console.log('[QdrantDB] 📏 Dense vector dimension:', dimension)

    await this.client!.api('collections').create({
      collectionName,
      vectorsConfig: {
        config: {
          case: 'paramsMap',
          value: {
            map: {
              [this.DENSE_VECTOR_NAME]: {
                size: BigInt(dimension),
                distance: 1, // Cosine = 1
              },
            },
          },
        },
      },
      sparseVectorsConfig: {
        map: {
          [this.SPARSE_VECTOR_NAME]: {
            modifier: Modifier.Idf,
          },
        },
      },
    })

    console.log('[QdrantDB] ✅ Hybrid collection created successfully')
  }

  /**
   * Drop collection
   */
  async dropCollection(collectionName: string): Promise<void> {
    await this.ensureInitialized()

    console.log('[QdrantDB] 🗑️  Dropping collection:', collectionName)
    await this.client!.api('collections').delete({
      collectionName,
    })
    console.log('[QdrantDB] ✅ Collection dropped successfully')
  }

  /**
   * Check if collection exists
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    await this.ensureInitialized()

    try {
      const response = await this.client!.api('collections').get({
        collectionName,
      })
      return response.result !== undefined
    }
    catch (error: any) {
      // Handle gRPC NOT_FOUND error (code 5) or check error messages
      if (
        error.code === 5 // gRPC NOT_FOUND status code
        || error.rawMessage?.includes('not found')
        || error.rawMessage?.includes('does not exist')
        || error.message?.includes('not found')
        || error.message?.includes('does not exist')
      ) {
        return false
      }
      throw error
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    await this.ensureInitialized()

    const response = await this.client!.api('collections').list({})
    return response.collections.map((c: { name: string }) => c.name)
  }

  /**
   * Insert documents with dense vectors only
   */
  async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    console.log('[QdrantDB] 📝 Inserting', documents.length, 'documents into:', collectionName)

    const points = documents.map((doc) => ({
      id: {
        pointIdOptions: {
          case: 'num' as const,
          value: this.convertToNumericId(doc.id),
        },
      },
      vectors: {
        vectorsOptions: {
          case: 'vectors' as const,
          value: {
            vectors: {
              [this.DENSE_VECTOR_NAME]: {
                vector: {
                  case: 'dense' as const,
                  value: {
                    data: doc.vector,
                  },
                },
              },
            },
          },
        },
      },
      payload: {
        content: { kind: { case: 'stringValue' as const, value: doc.content } },
        relativePath: { kind: { case: 'stringValue' as const, value: doc.relativePath } },
        startLine: { kind: { case: 'integerValue' as const, value: BigInt(doc.startLine) } },
        endLine: { kind: { case: 'integerValue' as const, value: BigInt(doc.endLine) } },
        fileExtension: { kind: { case: 'stringValue' as const, value: doc.fileExtension } },
        metadata: { kind: { case: 'stringValue' as const, value: JSON.stringify(doc.metadata) } },
      },
    }))

    await this.client!.api('points').upsert({
      collectionName,
      wait: true,
      points,
    })

    console.log('[QdrantDB] ✅ Documents inserted successfully')
  }

  /**
   * Insert documents with hybrid vectors (dense + sparse)
   */
  async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    console.log('[QdrantDB] 📝 Inserting', documents.length, 'hybrid documents into:', collectionName)

    // Ensure BM25 is trained before insertion
    if (!this.bm25Generator.isTrained()) {
      // The BM25 model must be trained on the full corpus before insertion for accurate sparse vectors.
      // Training on a single batch leads to incorrect IDF scores and poor search quality.
      throw new Error('BM25 generator is not trained. The caller must explicitly train it via `getBM25Generator().learn(corpus)` before calling `insertHybrid`.')
    }

    // Generate sparse vectors for all documents
    const sparseVectors = documents.map((doc) =>
      this.bm25Generator.generate(doc.content),
    )

    const points = documents.map((doc, index) => ({
      id: {
        pointIdOptions: {
          case: 'num' as const,
          value: this.convertToNumericId(doc.id),
        },
      },
      vectors: {
        vectorsOptions: {
          case: 'vectors' as const,
          value: {
            vectors: {
              [this.DENSE_VECTOR_NAME]: {
                vector: {
                  case: 'dense' as const,
                  value: {
                    data: doc.vector,
                  },
                },
              },
              [this.SPARSE_VECTOR_NAME]: {
                vector: {
                  case: 'sparse' as const,
                  value: {
                    indices: sparseVectors[index].indices,
                    values: sparseVectors[index].values,
                  },
                },
              },
            },
          },
        },
      },
      payload: {
        content: { kind: { case: 'stringValue' as const, value: doc.content } },
        relativePath: { kind: { case: 'stringValue' as const, value: doc.relativePath } },
        startLine: { kind: { case: 'integerValue' as const, value: BigInt(doc.startLine) } },
        endLine: { kind: { case: 'integerValue' as const, value: BigInt(doc.endLine) } },
        fileExtension: { kind: { case: 'stringValue' as const, value: doc.fileExtension } },
        metadata: { kind: { case: 'stringValue' as const, value: JSON.stringify(doc.metadata) } },
      },
    }))

    await this.client!.api('points').upsert({
      collectionName,
      wait: true,
      points,
    })

    console.log('[QdrantDB] ✅ Hybrid documents inserted successfully')
  }

  /**
   * Search with dense vectors only
   */
  async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    console.log('[QdrantDB] 🔍 Searching in collection:', collectionName)

    const searchParams: any = {
      collectionName,
      vector: queryVector,
      vectorName: this.DENSE_VECTOR_NAME,
      limit: BigInt(options?.topK || 10),
      // For gRPC API, omitting withPayload returns all payload fields
      // Using withPayload causes "No PayloadSelector" error
    }

    // Apply filter if provided
    if (options?.filterExpr && options.filterExpr.trim().length > 0) {
      searchParams.filter = this.parseFilterExpression(options.filterExpr)
    }

    const results = await this.client!.api('points').search(searchParams)

    return results.result.map((result: any) => ({
      document: {
        id: result.id?.str || result.id?.num?.toString() || '',
        vector: queryVector,
        content: result.payload?.content?.stringValue || '',
        relativePath: result.payload?.relativePath?.stringValue || '',
        startLine: Number(result.payload?.startLine?.integerValue || 0),
        endLine: Number(result.payload?.endLine?.integerValue || 0),
        fileExtension: result.payload?.fileExtension?.stringValue || '',
        metadata: JSON.parse(result.payload?.metadata?.stringValue || '{}'),
      },
      score: result.score,
    }))
  }

  /**
   * Hybrid search with dense + sparse vectors using RRF fusion
   */
  async hybridSearch(
    collectionName: string,
    searchRequests: HybridSearchRequest[],
    options?: HybridSearchOptions,
  ): Promise<HybridSearchResult[]> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    console.log('[QdrantDB] 🔍 Performing hybrid search in collection:', collectionName)

    // Extract dense vector and query text from search requests by inspecting data types
    const denseQueryReq = searchRequests.find((req) => Array.isArray(req.data))
    const textQueryReq = searchRequests.find((req) => typeof req.data === 'string')

    if (!denseQueryReq || !textQueryReq) {
      throw new Error('Hybrid search requires one dense vector request (number[] data) and one text request (string data).')
    }

    const denseQuery = denseQueryReq.data as number[]
    const textQuery = textQueryReq.data as string

    // Generate sparse vector using BM25
    if (!this.bm25Generator.isTrained()) {
      console.warn('[QdrantDB] ⚠️  BM25 generator not trained. Hybrid search may have reduced quality.')
    }

    const sparseQuery = this.bm25Generator.isTrained()
      ? this.bm25Generator.generate(textQuery)
      : { indices: [], values: [] }

    console.log('[QdrantDB] 🔍 Dense query vector length:', denseQuery.length)
    console.log('[QdrantDB] 🔍 Sparse query terms:', sparseQuery.indices.length)
    console.log('[QdrantDB] 🔍 Sparse query indices:', sparseQuery.indices.slice(0, 5))
    console.log('[QdrantDB] 🔍 Sparse query values:', sparseQuery.values.slice(0, 5))

    // Validate sparse query has valid data
    if (sparseQuery.indices.length === 0
      || sparseQuery.values.length === 0
      || sparseQuery.indices.length !== sparseQuery.values.length) {
      console.warn('[QdrantDB] ⚠️  Invalid or empty sparse query. Falling back to dense-only search.')
      console.warn(`[QdrantDB] ⚠️  indices.length=${sparseQuery.indices.length}, values.length=${sparseQuery.values.length}`)
      return await this.search(collectionName, denseQuery, {
        topK: options?.limit || 10,
        filterExpr: options?.filterExpr,
      })
    }

    // Validate all values are positive (Qdrant requirement for sparse vectors)
    const hasNegativeValues = sparseQuery.values.some((v) => v <= 0)
    if (hasNegativeValues) {
      console.error('[QdrantDB] ❌ Sparse query contains non-positive values! This should not happen.')
      console.error('[QdrantDB] ❌ Falling back to dense-only search.')
      return await this.search(collectionName, denseQuery, {
        topK: options?.limit || 10,
        filterExpr: options?.filterExpr,
      })
    }

    console.log('[QdrantDB] ✅ Sparse query validated, proceeding with hybrid search')

    // Qdrant query API with nested prefetch for hybrid search
    // Using RRF (Reciprocal Rank Fusion) to combine sparse and dense results
    // Structure: prefetch contains one item with nested prefetch for dense/sparse, then fusion
    //
    // Note: Using plain objects that match the protobuf structure defined in:
    // @qdrant/js-client-grpc/dist/types/proto/points_pb.d.ts
    //
    // QueryPoints structure:
    //   - collectionName: string
    //   - prefetch: PrefetchQuery[]
    //   - limit: bigint
    //
    // PrefetchQuery structure:
    //   - prefetch?: PrefetchQuery[]  (nested prefetches)
    //   - query?: Query               (query to apply)
    //   - using?: string              (vector name)
    //   - limit?: bigint
    //
    // Query structure (oneof variant):
    //   - variant: { case: 'nearest', value: VectorInput } | { case: 'fusion', value: Fusion } | ...
    //
    // VectorInput structure (oneof variant):
    //   - variant: { case: 'dense', value: DenseVector } | { case: 'sparse', value: SparseVector } | ...
    //
    // DenseVector: { data: number[] }
    // SparseVector: { indices: number[], values: number[] }
    // Fusion enum: RRF = 0, DBSF = 1

    const queryParams: any = {
      collectionName,
      prefetch: [
        {
          // Dense vector prefetch
          query: {
            variant: {
              case: 'nearest' as const,
              value: {
                variant: {
                  case: 'dense' as const,
                  value: {
                    data: denseQuery,
                  },
                },
              },
            },
          },
          using: this.DENSE_VECTOR_NAME,
          limit: BigInt(denseQueryReq.limit || 25),
        },
        {
          // Sparse vector prefetch
          query: {
            variant: {
              case: 'nearest' as const,
              value: {
                variant: {
                  case: 'sparse' as const,
                  value: {
                    indices: sparseQuery.indices.map((i) => Number(i)),
                    values: sparseQuery.values,
                  },
                },
              },
            },
          },
          using: this.SPARSE_VECTOR_NAME,
          limit: BigInt(textQueryReq.limit || 25),
        },
      ],
      // Fusion query to combine results from prefetches
      query: {
        variant: {
          case: 'fusion' as const,
          value: 0 as const, // Fusion.RRF = 0
        },
      },
      limit: BigInt(options?.limit || 10),
      withPayload: {
        selectorOptions: {
          case: 'enable' as const,
          value: true,
        },
      },
    }

    // Apply filter if provided
    if (options?.filterExpr && options.filterExpr.trim().length > 0) {
      queryParams.filter = this.parseFilterExpression(options.filterExpr)
    }

    const results = await this.client!.api('points').query(queryParams)

    console.log('[QdrantDB] ✅ Found', results.result.length, 'results from hybrid search')

    return results.result.map((result: any) => ({
      document: {
        id: result.id?.str || result.id?.num?.toString() || '',
        content: result.payload?.content?.kind?.value || '',
        vector: [],
        relativePath: result.payload?.relativePath?.kind?.value || '',
        startLine: Number(result.payload?.startLine?.kind?.value || 0),
        endLine: Number(result.payload?.endLine?.kind?.value || 0),
        fileExtension: result.payload?.fileExtension?.kind?.value || '',
        metadata: JSON.parse(result.payload?.metadata?.kind?.value || '{}'),
      },
      score: result.score,
    }))
  }

  /**
   * Delete documents by IDs
   */
  async delete(collectionName: string, ids: string[]): Promise<void> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    console.log('[QdrantDB] 🗑️  Deleting', ids.length, 'documents from:', collectionName)

    await this.client!.api('points').delete({
      collectionName,
      wait: true,
      points: {
        pointsSelectorOneOf: {
          case: 'points' as const,
          value: {
            ids: ids.map((id) => ({
              pointIdOptions: {
                case: 'num' as const,
                value: this.convertToNumericId(id),
              },
            })),
          },
        },
      },
    })

    console.log('[QdrantDB] ✅ Documents deleted successfully')
  }

  /**
   * Query documents with filter conditions
   */
  async query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number,
  ): Promise<Record<string, any>[]> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    console.log('[QdrantDB] 📋 Querying collection:', collectionName)

    // Build scroll parameters
    // For gRPC API, omitting withPayload returns all payload fields
    // Using withPayload: true causes "No PayloadSelector" error
    const scrollParams: any = {
      collectionName,
      limit: limit || 100,
      withVector: false,
    }

    // Parse filter expression if provided
    if (filter && filter.trim().length > 0) {
      scrollParams.filter = this.parseFilterExpression(filter)
    }

    const results = await this.client!.api('points').scroll(scrollParams)

    // Dynamically map results based on requested outputFields
    return results.result.map((point: any) => {
      // Extract ID from protobuf structure
      // In gRPC API, id can be: {pointIdOptions: {case: 'num', value: bigint}} or {case: 'str', value: string}
      let idValue = ''
      if (point.id?.pointIdOptions?.case === 'num') {
        idValue = point.id.pointIdOptions.value.toString()
      }
      else if (point.id?.pointIdOptions?.case === 'str') {
        idValue = point.id.pointIdOptions.value
      }
      else if (point.id?.num !== undefined) {
        // Fallback for backward compatibility
        idValue = point.id.num.toString()
      }
      else if (point.id?.str !== undefined) {
        idValue = point.id.str
      }

      const result: Record<string, any> = {
        id: idValue,
      }

      // If no specific fields requested, return all known fields
      if (outputFields.length === 0) {
        // In gRPC client, payload values are wrapped in {kind: {case: 'stringValue', value: '...'}}
        result.content = point.payload?.content?.kind?.value || point.payload?.content?.stringValue
        result.relativePath = point.payload?.relativePath?.kind?.value || point.payload?.relativePath?.stringValue
        result.startLine = Number(point.payload?.startLine?.kind?.value || point.payload?.startLine?.integerValue || 0)
        result.endLine = Number(point.payload?.endLine?.kind?.value || point.payload?.endLine?.integerValue || 0)
        result.fileExtension = point.payload?.fileExtension?.kind?.value || point.payload?.fileExtension?.stringValue
        const metadataStr = point.payload?.metadata?.kind?.value || point.payload?.metadata?.stringValue
        result.metadata = JSON.parse(metadataStr || '{}')
      }
      else {
        // Only include requested fields
        for (const field of outputFields) {
          if (point.payload?.[field]) {
            const value = point.payload[field]
            // Handle different value types based on protobuf structure
            // In gRPC client, value is wrapped in {kind: {case: 'stringValue', value: '...'}}
            if (value.kind?.case === 'stringValue') {
              result[field] = field === 'metadata'
                ? JSON.parse(value.kind.value || '{}')
                : value.kind.value
            }
            else if (value.kind?.case === 'integerValue') {
              result[field] = Number(value.kind.value)
            }
            else if (value.kind?.case === 'doubleValue') {
              result[field] = value.kind.value
            }
            else if (value.kind?.case === 'boolValue') {
              result[field] = value.kind.value
            }
            // Fallback for direct value access (backward compatibility)
            else if (value.stringValue !== undefined) {
              result[field] = field === 'metadata'
                ? JSON.parse(value.stringValue || '{}')
                : value.stringValue
            }
            else if (value.integerValue !== undefined) {
              result[field] = Number(value.integerValue)
            }
            else if (value.doubleValue !== undefined) {
              result[field] = value.doubleValue
            }
            else if (value.boolValue !== undefined) {
              result[field] = value.boolValue
            }
          }
        }
      }

      return result
    })
  }

  /**
   * Check collection limit
   * Qdrant doesn't have hard collection limits like Zilliz Cloud
   */
  async checkCollectionLimit(): Promise<boolean> {
    // Qdrant (self-hosted or cloud) doesn't have hard collection limits
    return Promise.resolve(true)
  }

  /**
   * Parse Milvus-style filter expression to Qdrant filter format
   *
   * Example:
   * - "fileExtension == '.ts'" -> { must: [{ key: 'fileExtension', match: { value: '.ts' } }] }
   * - "fileExtension in ['.ts', '.js']" -> { must: [{ key: 'fileExtension', match: { any: ['.ts', '.js'] } }] }
   */
  private parseFilterExpression(expr: string): any {
    // Simple parser for common filter patterns
    // Format: "field == 'value'" or "field in ['val1', 'val2']"

    if (expr.includes(' in ')) {
      // Handle "field in [...]" pattern
      const match = expr.match(/(\w+)\s+in\s+\[(.*)\]/)
      if (match) {
        const field = match[1]
        const values = match[2]
          .split(',')
          .map((v) => v.trim().replace(/['"]/g, ''))

        // For "IN" operator, use a "must" clause with "any" match for better performance
        return {
          must: [{
            conditionOneOf: {
              case: 'field' as const,
              value: {
                key: field,
                match: {
                  matchValue: {
                    case: 'any' as const,
                    value: {
                      values: values.map((value) => ({ kind: { case: 'stringValue' as const, value } })),
                    },
                  },
                },
              },
            },
          }],
        }
      }
    }
    else if (expr.includes('==')) {
      // Handle "field == value" pattern
      const match = expr.match(/(\w+)\s*==\s*['"]?([^'"]+)['"]?/)
      if (match) {
        const field = match[1]
        const value = match[2].trim()

        return {
          must: [
            {
              conditionOneOf: {
                case: 'field' as const,
                value: {
                  key: field,
                  match: {
                    matchValue: {
                      case: 'keyword' as const,
                      value,
                    },
                  },
                },
              },
            },
          ],
        }
      }
    }

    // If parsing fails, return undefined (no filtering)
    console.warn('[QdrantDB] ⚠️  Could not parse filter expression:', expr)
    return undefined
  }

  /**
   * Convert chunk ID to numeric ID for Qdrant
   * Extracts the hex hash from chunk_XXXXXXXXXXXXXXXX and converts to bigint
   *
   * Example: chunk_edf5558e3dbbf10b -> 17141645883789484811n
   */
  private convertToNumericId(chunkId: string): bigint {
    // Extract hex portion from chunk_XXXXXXXXXXXXXXXX format
    const hex = chunkId.replace('chunk_', '')
    // Convert hex string to bigint (16 hex chars = 64 bits)
    return BigInt(`0x${hex}`)
  }

  /**
   * Get BM25 generator (for testing/debugging)
   */
  public getBM25Generator(): SimpleBM25 {
    return this.bm25Generator
  }

  /**
   * Get BM25 model file path for a collection
   */
  private getBM25ModelPath(collectionName: string): string {
    const homeDir = os.homedir()
    const modelDir = path.join(homeDir, '.context', 'bm25')
    return path.join(modelDir, `${collectionName}.json`)
  }

  /**
   * Save BM25 model to disk
   */
  async saveBM25Model(collectionName: string): Promise<void> {
    if (!this.bm25Generator.isTrained()) {
      console.log('[QdrantDB] ⚠️  BM25 model is not trained, skipping save')
      return
    }

    try {
      const modelPath = this.getBM25ModelPath(collectionName)
      const modelDir = path.dirname(modelPath)

      // Ensure directory exists
      await fs.mkdir(modelDir, { recursive: true })

      // Serialize and save BM25 model
      const modelJson = this.bm25Generator.toJSON()
      await fs.writeFile(modelPath, modelJson, 'utf-8')

      console.log(`[QdrantDB] 💾 Saved BM25 model to: ${modelPath}`)
    }
    catch (error) {
      console.error(`[QdrantDB] ❌ Failed to save BM25 model:`, error)
      throw error
    }
  }

  /**
   * Load BM25 model from disk
   */
  async loadBM25Model(collectionName: string): Promise<boolean> {
    try {
      const modelPath = this.getBM25ModelPath(collectionName)

      // Check if model file exists
      try {
        await fs.access(modelPath)
      }
      catch {
        console.log(`[QdrantDB] ℹ️  No saved BM25 model found at: ${modelPath}`)
        return false
      }

      // Load and deserialize BM25 model
      const modelJson = await fs.readFile(modelPath, 'utf-8')
      this.bm25Generator = SimpleBM25.fromJSON(modelJson)

      console.log(`[QdrantDB] 📂 Loaded BM25 model from: ${modelPath}`)
      return true
    }
    catch (error) {
      console.error(`[QdrantDB] ❌ Failed to load BM25 model:`, error)
      return false
    }
  }

  /**
   * Delete saved BM25 model
   */
  async deleteBM25Model(collectionName: string): Promise<void> {
    try {
      const modelPath = this.getBM25ModelPath(collectionName)

      // Check if model file exists
      try {
        await fs.access(modelPath)
      }
      catch {
        // File doesn't exist, nothing to delete
        return
      }

      await fs.unlink(modelPath)
      console.log(`[QdrantDB] 🗑️  Deleted BM25 model at: ${modelPath}`)
    }
    catch (error) {
      console.warn(`[QdrantDB] ⚠️  Failed to delete BM25 model:`, error)
    }
  }
}
