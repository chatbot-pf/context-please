import type { Client } from '@libsql/client'
import * as os from 'node:os'
import * as path from 'node:path'
import { createClient } from '@libsql/client'
import * as fs from 'fs-extra'

import { BaseDatabaseConfig, BaseVectorDatabase } from './base/base-vector-database'
import { BM25Config, SimpleBM25 } from './sparse/simple-bm25'
import {
  HybridSearchOptions,
  HybridSearchRequest,
  HybridSearchResult,
  SearchOptions,
  VectorDocument,
  VectorSearchResult,
} from './types'

export interface LibSQLConfig extends BaseDatabaseConfig {
  /**
   * Storage directory for LibSQL databases
   * @default ~/.context/libsql-indexes
   */
  storageDir?: string

  /**
   * BM25 configuration for sparse vector generation
   */
  bm25Config?: BM25Config

  /**
   * Enable WAL mode for better concurrent read performance
   * @default true
   */
  walMode?: boolean

  /**
   * Cache size in pages (default page = 4KB)
   * @default 2000 (8MB cache)
   */
  cacheSize?: number
}

interface CollectionMetadata {
  dimension: number
  isHybrid: boolean
  documentCount: number
  createdAt: string
}

/**
 * LibSQL Vector Database implementation for local-only deployments
 *
 * Features:
 * - Pure JavaScript SDK (no native bindings required)
 * - Full document deletion support via SQL DELETE
 * - Query filtering support via SQL WHERE clauses
 * - Single SQLite file per collection
 * - Hybrid search with BM25 sparse vectors
 * - RRF (Reciprocal Rank Fusion) reranking
 *
 * Architecture:
 * - Dense vectors: Stored in F32_BLOB columns with DiskANN indexing
 * - Sparse vectors: Stored as JSON (indices/values) for BM25
 * - Hybrid search: Combines both using RRF fusion
 *
 * Storage structure:
 * ~/.context/libsql-indexes/
 *   └── {collection_name}.db    # SQLite database file
 *
 * Key advantages over FAISS:
 * - Document deletion IS supported (SQL DELETE)
 * - Query filters ARE supported (SQL WHERE)
 * - No native bindings required
 */
export class LibSQLVectorDatabase extends BaseVectorDatabase<LibSQLConfig> {
  private clients: Map<string, Client> = new Map()
  private bm25Generators: Map<string, SimpleBM25> = new Map()
  private metadataCache: Map<string, CollectionMetadata> = new Map()

  constructor(config: LibSQLConfig) {
    const configWithDefaults: LibSQLConfig = {
      ...config,
      storageDir: config.storageDir || path.join(os.homedir(), '.context', 'libsql-indexes'),
      walMode: config.walMode !== false,
      cacheSize: config.cacheSize || 2000,
    }
    super(configWithDefaults)
  }

  private get storageDir(): string {
    return this.config.storageDir!
  }

  /**
   * Initialize LibSQL storage directory
   */
  protected async initialize(): Promise<void> {
    try {
      console.log('[LibSQLDB] Initializing LibSQL storage at:', this.storageDir)
      await fs.ensureDir(this.storageDir)
      console.log('[LibSQLDB] LibSQL storage initialized')
    }
    catch (error: any) {
      const errorMsg = `Failed to initialize LibSQL storage at ${this.storageDir}: ${error.message}`
      console.error(`[LibSQLDB] ${errorMsg}`)

      if (error.code === 'EACCES') {
        throw new Error(`${errorMsg}\nPermission denied. Check directory permissions.`)
      }
      else if (error.code === 'ENOSPC') {
        throw new Error(`${errorMsg}\nDisk space exhausted. Free up disk space and try again.`)
      }
      throw new Error(errorMsg)
    }
  }

  /**
   * LibSQL collections are loaded on-demand when accessed
   */
  protected async ensureLoaded(collectionName: string): Promise<void> {
    if (this.clients.has(collectionName)) {
      return
    }

    const dbPath = this.getDbPath(collectionName)
    if (!(await fs.pathExists(dbPath))) {
      throw new Error(`Collection ${collectionName} does not exist`)
    }

    await this.loadCollection(collectionName)
  }

  /**
   * Get database file path for a collection
   */
  private getDbPath(collectionName: string): string {
    return path.join(this.storageDir, `${collectionName}.db`)
  }

  /**
   * Load collection from disk
   */
  private async loadCollection(collectionName: string): Promise<void> {
    const dbPath = this.getDbPath(collectionName)
    console.log('[LibSQLDB] Loading collection:', collectionName)

    try {
      const client = createClient({ url: `file:${dbPath}` })
      this.clients.set(collectionName, client)

      // Load metadata
      const result = await client.execute('SELECT key, value FROM _metadata')
      const metadata: Record<string, string> = {}
      for (const row of result.rows) {
        metadata[row.key as string] = row.value as string
      }

      const collectionMetadata: CollectionMetadata = {
        dimension: Number.parseInt(metadata.dimension, 10),
        isHybrid: metadata.isHybrid === 'true',
        documentCount: Number.parseInt(metadata.documentCount || '0', 10),
        createdAt: metadata.createdAt,
      }
      this.metadataCache.set(collectionName, collectionMetadata)

      // Load BM25 if hybrid collection
      if (collectionMetadata.isHybrid) {
        const bm25Path = path.join(this.storageDir, `${collectionName}_bm25.json`)
        if (await fs.pathExists(bm25Path)) {
          const bm25Json = await fs.readFile(bm25Path, 'utf-8')
          const bm25 = SimpleBM25.fromJSON(bm25Json)
          this.bm25Generators.set(collectionName, bm25)
        }
        else {
          this.bm25Generators.set(collectionName, new SimpleBM25(this.config.bm25Config))
        }
      }

      console.log('[LibSQLDB] Loaded collection:', collectionName)
    }
    catch (error: any) {
      console.error(`[LibSQLDB] Failed to load collection ${collectionName}:`, error.message)
      throw error
    }
  }

  /**
   * Get or create client for a collection
   */
  private async getClient(collectionName: string): Promise<Client> {
    await this.ensureLoaded(collectionName)
    return this.clients.get(collectionName)!
  }

  /**
   * Save BM25 model for a collection
   */
  private async saveBM25(collectionName: string): Promise<void> {
    const bm25 = this.bm25Generators.get(collectionName)
    if (bm25) {
      const bm25Path = path.join(this.storageDir, `${collectionName}_bm25.json`)
      await fs.writeFile(bm25Path, bm25.toJSON(), 'utf-8')
    }
  }

  /**
   * Update document count in metadata
   */
  private async updateDocumentCount(collectionName: string): Promise<void> {
    const client = this.clients.get(collectionName)
    if (!client)
      return

    const result = await client.execute('SELECT COUNT(*) as count FROM documents')
    const count = Number(result.rows[0].count)

    await client.execute({
      sql: 'INSERT OR REPLACE INTO _metadata (key, value) VALUES (?, ?)',
      args: ['documentCount', String(count)],
    })

    const metadata = this.metadataCache.get(collectionName)
    if (metadata) {
      metadata.documentCount = count
    }
  }

  /**
   * Create collection with dense vectors only
   */
  async createCollection(collectionName: string, dimension: number, _description?: string): Promise<void> {
    await this.ensureInitialized()

    const dbPath = this.getDbPath(collectionName)
    if (await fs.pathExists(dbPath)) {
      throw new Error(`Collection ${collectionName} already exists`)
    }

    console.log('[LibSQLDB] Creating collection:', collectionName)
    console.log('[LibSQLDB] Vector dimension:', dimension)

    const client = createClient({ url: `file:${dbPath}` })

    // Configure SQLite settings
    if (this.config.walMode) {
      await client.execute('PRAGMA journal_mode=WAL')
    }
    await client.execute(`PRAGMA cache_size=${this.config.cacheSize}`)

    // Create metadata table
    await client.execute(`
      CREATE TABLE _metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Create documents table with vector column
    await client.execute(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        file_extension TEXT NOT NULL,
        metadata TEXT NOT NULL,
        dense_vector F32_BLOB(${dimension})
      )
    `)

    // Create vector index
    await client.execute(
      'CREATE INDEX idx_dense ON documents(libsql_vector_idx(dense_vector))',
    )

    // Insert metadata
    await client.batch([
      { sql: 'INSERT INTO _metadata VALUES (?, ?)', args: ['dimension', String(dimension)] },
      { sql: 'INSERT INTO _metadata VALUES (?, ?)', args: ['isHybrid', 'false'] },
      { sql: 'INSERT INTO _metadata VALUES (?, ?)', args: ['createdAt', new Date().toISOString()] },
      { sql: 'INSERT INTO _metadata VALUES (?, ?)', args: ['documentCount', '0'] },
    ])

    this.clients.set(collectionName, client)
    this.metadataCache.set(collectionName, {
      dimension,
      isHybrid: false,
      documentCount: 0,
      createdAt: new Date().toISOString(),
    })

    console.log('[LibSQLDB] Collection created:', collectionName)
  }

  /**
   * Create collection with hybrid search support (dense + sparse vectors)
   */
  async createHybridCollection(collectionName: string, dimension: number, _description?: string): Promise<void> {
    await this.ensureInitialized()

    const dbPath = this.getDbPath(collectionName)
    if (await fs.pathExists(dbPath)) {
      throw new Error(`Collection ${collectionName} already exists`)
    }

    console.log('[LibSQLDB] Creating hybrid collection:', collectionName)
    console.log('[LibSQLDB] Vector dimension:', dimension)

    const client = createClient({ url: `file:${dbPath}` })

    // Configure SQLite settings
    if (this.config.walMode) {
      await client.execute('PRAGMA journal_mode=WAL')
    }
    await client.execute(`PRAGMA cache_size=${this.config.cacheSize}`)

    // Create metadata table
    await client.execute(`
      CREATE TABLE _metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Create documents table with vector and sparse columns
    await client.execute(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        file_extension TEXT NOT NULL,
        metadata TEXT NOT NULL,
        dense_vector F32_BLOB(${dimension}),
        sparse_indices TEXT,
        sparse_values TEXT
      )
    `)

    // Create vector index
    await client.execute(
      'CREATE INDEX idx_dense ON documents(libsql_vector_idx(dense_vector))',
    )

    // Insert metadata
    await client.batch([
      { sql: 'INSERT INTO _metadata VALUES (?, ?)', args: ['dimension', String(dimension)] },
      { sql: 'INSERT INTO _metadata VALUES (?, ?)', args: ['isHybrid', 'true'] },
      { sql: 'INSERT INTO _metadata VALUES (?, ?)', args: ['createdAt', new Date().toISOString()] },
      { sql: 'INSERT INTO _metadata VALUES (?, ?)', args: ['documentCount', '0'] },
    ])

    this.clients.set(collectionName, client)
    this.metadataCache.set(collectionName, {
      dimension,
      isHybrid: true,
      documentCount: 0,
      createdAt: new Date().toISOString(),
    })

    // Initialize BM25 generator
    this.bm25Generators.set(collectionName, new SimpleBM25(this.config.bm25Config))

    console.log('[LibSQLDB] Hybrid collection created:', collectionName)
  }

  /**
   * Drop collection
   */
  async dropCollection(collectionName: string): Promise<void> {
    await this.ensureInitialized()

    console.log('[LibSQLDB] Dropping collection:', collectionName)

    // Close client if exists
    const client = this.clients.get(collectionName)
    if (client) {
      client.close()
      this.clients.delete(collectionName)
    }

    // Remove from caches
    this.metadataCache.delete(collectionName)
    this.bm25Generators.delete(collectionName)

    // Remove database file
    const dbPath = this.getDbPath(collectionName)
    if (await fs.pathExists(dbPath)) {
      await fs.remove(dbPath)
    }

    // Remove BM25 file if exists
    const bm25Path = path.join(this.storageDir, `${collectionName}_bm25.json`)
    if (await fs.pathExists(bm25Path)) {
      await fs.remove(bm25Path)
    }

    // Remove WAL files if they exist
    const walPath = `${dbPath}-wal`
    const shmPath = `${dbPath}-shm`
    await fs.remove(walPath)
    await fs.remove(shmPath)

    console.log('[LibSQLDB] Collection dropped:', collectionName)
  }

  /**
   * Check if collection exists
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    await this.ensureInitialized()

    if (this.clients.has(collectionName)) {
      return true
    }

    const dbPath = this.getDbPath(collectionName)
    return await fs.pathExists(dbPath)
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    await this.ensureInitialized()

    const collections: string[] = []

    if (await fs.pathExists(this.storageDir)) {
      const entries = await fs.readdir(this.storageDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.db')) {
          collections.push(entry.name.replace('.db', ''))
        }
      }
    }

    return collections
  }

  /**
   * Insert vector documents (dense only)
   */
  async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized()
    const client = await this.getClient(collectionName)

    const metadata = this.metadataCache.get(collectionName)
    if (!metadata) {
      throw new Error(`Collection ${collectionName} metadata not found`)
    }

    console.log('[LibSQLDB] Inserting documents:', documents.length)

    // Validate vector dimensions
    for (const doc of documents) {
      if (doc.vector.length !== metadata.dimension) {
        throw new Error(
          `Vector dimension mismatch for document '${doc.id}': `
          + `expected ${metadata.dimension}, got ${doc.vector.length}`,
        )
      }
    }

    // Batch insert
    const statements = documents.map((doc) => ({
      sql: `INSERT OR REPLACE INTO documents
            (id, content, relative_path, start_line, end_line, file_extension, metadata, dense_vector)
            VALUES (?, ?, ?, ?, ?, ?, ?, vector32(?))`,
      args: [
        doc.id,
        doc.content,
        doc.relativePath,
        doc.startLine,
        doc.endLine,
        doc.fileExtension,
        JSON.stringify(doc.metadata),
        `[${doc.vector.join(',')}]`,
      ],
    }))

    await client.batch(statements)
    await this.updateDocumentCount(collectionName)

    console.log('[LibSQLDB] Inserted documents:', documents.length)
  }

  /**
   * Insert hybrid vector documents (dense + sparse)
   */
  async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized()
    const client = await this.getClient(collectionName)

    const metadata = this.metadataCache.get(collectionName)
    if (!metadata) {
      throw new Error(`Collection ${collectionName} metadata not found`)
    }

    if (!metadata.isHybrid) {
      throw new Error(`Collection ${collectionName} is not a hybrid collection`)
    }

    console.log('[LibSQLDB] Inserting hybrid documents:', documents.length)

    // Validate vector dimensions
    for (const doc of documents) {
      if (doc.vector.length !== metadata.dimension) {
        throw new Error(
          `Vector dimension mismatch for document '${doc.id}': `
          + `expected ${metadata.dimension}, got ${doc.vector.length}`,
        )
      }
    }

    // Get or create BM25 generator
    let bm25 = this.bm25Generators.get(collectionName)
    if (!bm25) {
      bm25 = new SimpleBM25(this.config.bm25Config)
      this.bm25Generators.set(collectionName, bm25)
    }

    // Train BM25 on all documents (existing + new)
    const existingResult = await client.execute('SELECT content FROM documents')
    const existingContents = existingResult.rows.map((r) => r.content as string)
    const allContents = [...existingContents, ...documents.map((d) => d.content)]
    bm25.learn(allContents)

    // Generate sparse vectors
    const sparseVectors = documents.map((doc) => bm25!.generate(doc.content))

    // Batch insert
    const statements = documents.map((doc, i) => ({
      sql: `INSERT OR REPLACE INTO documents
            (id, content, relative_path, start_line, end_line, file_extension, metadata,
             dense_vector, sparse_indices, sparse_values)
            VALUES (?, ?, ?, ?, ?, ?, ?, vector32(?), ?, ?)`,
      args: [
        doc.id,
        doc.content,
        doc.relativePath,
        doc.startLine,
        doc.endLine,
        doc.fileExtension,
        JSON.stringify(doc.metadata),
        `[${doc.vector.join(',')}]`,
        JSON.stringify(sparseVectors[i].indices),
        JSON.stringify(sparseVectors[i].values),
      ],
    }))

    await client.batch(statements)
    await this.updateDocumentCount(collectionName)
    await this.saveBM25(collectionName)

    console.log('[LibSQLDB] Inserted hybrid documents:', documents.length)
  }

  /**
   * Search similar vectors (dense search only)
   */
  async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
    await this.ensureInitialized()
    const client = await this.getClient(collectionName)

    const topK = options?.topK || 10
    const queryVectorStr = `[${queryVector.join(',')}]`

    console.log('[LibSQLDB] Searching vectors, topK:', topK)

    // Build query with vector_top_k
    // Note: vector_top_k returns 'id' (rowid), we calculate distance with vector_distance_cos
    let sql = `
      SELECT d.*, vector_distance_cos(d.dense_vector, vector32(?)) AS distance
      FROM vector_top_k('idx_dense', vector32(?), ?) AS vt
      JOIN documents d ON d.rowid = vt.id
    `
    const args: any[] = [queryVectorStr, queryVectorStr, topK * 2]

    // Apply filter if provided
    if (options?.filterExpr) {
      const whereClause = this.parseFilterExpression(options.filterExpr)
      sql += ` WHERE ${whereClause}`
    }

    sql += ' ORDER BY distance ASC LIMIT ?'
    args.push(topK)

    const result = await client.execute({ sql, args })

    const searchResults: VectorSearchResult[] = []
    for (const row of result.rows) {
      const score = 1 / (1 + (row.distance as number))

      // Apply threshold filter
      if (options?.threshold !== undefined && score < options.threshold) {
        continue
      }

      searchResults.push({
        document: this.rowToDocument(row),
        score,
      })
    }

    console.log('[LibSQLDB] Found results:', searchResults.length)
    return searchResults
  }

  /**
   * Hybrid search with multiple vector fields (dense + sparse)
   */
  async hybridSearch(
    collectionName: string,
    searchRequests: HybridSearchRequest[],
    options?: HybridSearchOptions,
  ): Promise<HybridSearchResult[]> {
    await this.ensureInitialized()
    const client = await this.getClient(collectionName)

    const metadata = this.metadataCache.get(collectionName)
    if (!metadata?.isHybrid) {
      throw new Error(`Collection ${collectionName} is not a hybrid collection`)
    }

    const limit = options?.limit || 10
    console.log('[LibSQLDB] Hybrid search, requests:', searchRequests.length)

    // Process search requests
    const denseResults = new Map<string, number>()
    const sparseResults = new Map<string, number>()

    for (const request of searchRequests) {
      if (request.anns_field === 'vector' || request.anns_field === 'dense') {
        await this.performDenseSearch(client, request.data as number[], limit, denseResults)
      }
      else if (request.anns_field === 'sparse' || request.anns_field === 'sparse_vector') {
        await this.performSparseSearch(client, collectionName, request.data as string, sparseResults)
      }
    }

    // Apply RRF reranking
    const k = options?.rerank?.params?.k || 60
    const rrfScores = this.applyRRF(denseResults, sparseResults, k)

    // Fetch full documents for top results
    const topIds = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id)

    if (topIds.length === 0) {
      return []
    }

    const placeholders = topIds.map(() => '?').join(',')
    const docsResult = await client.execute({
      sql: `SELECT * FROM documents WHERE id IN (${placeholders})`,
      args: topIds,
    })

    const results: HybridSearchResult[] = []
    const docMap = new Map(docsResult.rows.map((row) => [row.id as string, row]))

    for (const id of topIds) {
      const row = docMap.get(id)
      if (row) {
        results.push({
          document: this.rowToDocument(row),
          score: rrfScores.get(id) || 0,
        })
      }
    }

    console.log('[LibSQLDB] Hybrid search results:', results.length)
    return results
  }

  /**
   * Perform dense vector search
   */
  private async performDenseSearch(
    client: Client,
    queryVector: number[],
    limit: number,
    results: Map<string, number>,
  ): Promise<void> {
    const queryVectorStr = `[${queryVector.join(',')}]`
    const sql = `
      SELECT d.id, vector_distance_cos(d.dense_vector, vector32(?)) AS distance
      FROM vector_top_k('idx_dense', vector32(?), ?) AS vt
      JOIN documents d ON d.rowid = vt.id
    `
    const result = await client.execute({
      sql,
      args: [queryVectorStr, queryVectorStr, limit * 2],
    })

    for (const row of result.rows) {
      const score = 1 / (1 + (row.distance as number))
      results.set(row.id as string, score)
    }
  }

  /**
   * Perform sparse search using BM25
   */
  private async performSparseSearch(
    client: Client,
    collectionName: string,
    queryText: string,
    results: Map<string, number>,
  ): Promise<void> {
    const bm25 = this.bm25Generators.get(collectionName)
    if (!bm25 || !bm25.isTrained()) {
      return
    }

    const queryVector = bm25.generate(queryText)
    const queryMap = new Map<number, number>()
    for (let i = 0; i < queryVector.indices.length; i++) {
      queryMap.set(queryVector.indices[i], queryVector.values[i])
    }

    // Fetch all documents with sparse vectors and compute scores
    const result = await client.execute(`
      SELECT id, sparse_indices, sparse_values FROM documents
      WHERE sparse_indices IS NOT NULL
    `)

    for (const row of result.rows) {
      const indices = JSON.parse(row.sparse_indices as string) as number[]
      const values = JSON.parse(row.sparse_values as string) as number[]

      let score = 0
      for (let i = 0; i < indices.length; i++) {
        const queryVal = queryMap.get(indices[i])
        if (queryVal !== undefined) {
          score += values[i] * queryVal
        }
      }

      if (score > 0) {
        results.set(row.id as string, score)
      }
    }
  }

  /**
   * Apply Reciprocal Rank Fusion (RRF) reranking
   */
  private applyRRF(
    denseResults: Map<string, number>,
    sparseResults: Map<string, number>,
    k: number,
  ): Map<string, number> {
    const denseRanks = this.computeRanks(denseResults)
    const sparseRanks = this.computeRanks(sparseResults)

    const allIds = new Set([...denseResults.keys(), ...sparseResults.keys()])
    const rrfScores = new Map<string, number>()

    for (const id of allIds) {
      let score = 0
      const denseRank = denseRanks.get(id)
      const sparseRank = sparseRanks.get(id)

      if (denseRank !== undefined) {
        score += 1 / (k + denseRank)
      }
      if (sparseRank !== undefined) {
        score += 1 / (k + sparseRank)
      }

      rrfScores.set(id, score)
    }

    return rrfScores
  }

  /**
   * Compute ranks from scores
   */
  private computeRanks(scores: Map<string, number>): Map<string, number> {
    const ranks = new Map<string, number>()
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])
    sorted.forEach(([id], index) => ranks.set(id, index + 1))
    return ranks
  }

  /**
   * Convert database row to VectorDocument
   */
  private rowToDocument(row: Record<string, any>): VectorDocument {
    return {
      id: row.id as string,
      vector: [],
      content: row.content as string,
      relativePath: row.relative_path as string,
      startLine: row.start_line as number,
      endLine: row.end_line as number,
      fileExtension: row.file_extension as string,
      metadata: JSON.parse(row.metadata as string),
    }
  }

  /**
   * Parse filter expression to SQL WHERE clause
   */
  private parseFilterExpression(expr: string): string {
    // Convert Milvus-style filters to SQL WHERE clause
    // "fileExtension == '.ts'" -> "file_extension = '.ts'"
    // "fileExtension in ['.ts', '.js']" -> "file_extension IN ('.ts', '.js')"

    if (expr.includes(' in ')) {
      const match = expr.match(/(\w+)\s+in\s+\[(.*)\]/)
      if (match) {
        const field = this.mapFieldName(match[1])
        const values = match[2].split(',').map((v) => v.trim())
        return `${field} IN (${values.join(',')})`
      }
    }

    if (expr.includes('==')) {
      const match = expr.match(/(\w+)\s*==\s*(.+)/)
      if (match) {
        const field = this.mapFieldName(match[1])
        return `${field} = ${match[2].trim()}`
      }
    }

    // Return as-is if not recognized
    console.warn(`[LibSQLDB] Unrecognized filter expression: ${expr}`)
    return expr
  }

  /**
   * Map field names to database column names
   */
  private mapFieldName(field: string): string {
    const mapping: Record<string, string> = {
      relativePath: 'relative_path',
      startLine: 'start_line',
      endLine: 'end_line',
      fileExtension: 'file_extension',
    }
    return mapping[field] || field
  }

  /**
   * Delete documents by IDs
   *
   * Key advantage over FAISS: LibSQL supports document deletion via SQL DELETE
   */
  async delete(collectionName: string, ids: string[]): Promise<void> {
    await this.ensureInitialized()
    const client = await this.getClient(collectionName)

    console.log(`[LibSQLDB] Deleting ${ids.length} documents from ${collectionName}`)

    const placeholders = ids.map(() => '?').join(',')
    await client.execute({
      sql: `DELETE FROM documents WHERE id IN (${placeholders})`,
      args: ids,
    })

    await this.updateDocumentCount(collectionName)

    // Re-train BM25 if hybrid collection
    const metadata = this.metadataCache.get(collectionName)
    if (metadata?.isHybrid) {
      const bm25 = this.bm25Generators.get(collectionName)
      if (bm25) {
        const result = await client.execute('SELECT content FROM documents')
        const contents = result.rows.map((r) => r.content as string)
        if (contents.length > 0) {
          bm25.learn(contents)
          await this.saveBM25(collectionName)
        }
      }
    }

    console.log(`[LibSQLDB] Deleted ${ids.length} documents`)
  }

  /**
   * Query documents with filter conditions
   *
   * Key advantage over FAISS: LibSQL supports SQL WHERE clauses
   */
  async query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number,
  ): Promise<Record<string, any>[]> {
    await this.ensureInitialized()
    const client = await this.getClient(collectionName)

    console.log('[LibSQLDB] Querying documents')

    // Build SELECT clause
    const fields = outputFields.length > 0
      ? outputFields.map((f) => this.mapFieldName(f)).join(', ')
      : '*'

    let sql = `SELECT ${fields} FROM documents`
    const args: any[] = []

    // Apply filter
    if (filter && filter.trim()) {
      const whereClause = this.parseFilterExpression(filter)
      sql += ` WHERE ${whereClause}`
    }

    sql += ' LIMIT ?'
    args.push(limit || 100)

    const result = await client.execute({ sql, args })

    return result.rows.map((row) => this.rowToResult(row, outputFields))
  }

  /**
   * Convert row to result object
   */
  private rowToResult(row: Record<string, any>, outputFields: string[]): Record<string, any> {
    const result: Record<string, any> = {}

    for (const field of outputFields) {
      const dbField = this.mapFieldName(field)
      if (row[dbField] !== undefined) {
        result[field] = row[dbField]
      }
      else if (row[field] !== undefined) {
        result[field] = row[field]
      }
    }

    return result
  }

  /**
   * Check collection limit
   * LibSQL has no inherent collection limit (only limited by disk space)
   */
  async checkCollectionLimit(): Promise<boolean> {
    return true
  }
}
