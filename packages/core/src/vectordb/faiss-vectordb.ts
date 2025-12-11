import { IndexFlatL2 } from 'faiss-node'
import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'

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

export interface FaissConfig extends BaseDatabaseConfig {
  /**
   * Storage directory for FAISS indexes
   * @default ~/.context/faiss-indexes
   */
  storageDir?: string

  /**
   * BM25 configuration for sparse vector generation
   */
  bm25Config?: BM25Config
}

interface CollectionMetadata {
  name: string
  dimension: number
  isHybrid: boolean
  documentCount: number
  createdAt: string
}

interface DocumentMetadata {
  id: string
  content: string
  relativePath: string
  startLine: number
  endLine: number
  fileExtension: string
  metadata: Record<string, any>
}

/**
 * FAISS Vector Database implementation for local-only deployments
 *
 * Features:
 * - Zero-configuration file-based storage
 * - Hybrid search with BM25 sparse vectors
 * - RRF (Reciprocal Rank Fusion) reranking
 * - Perfect for local development and small-to-medium codebases
 *
 * Architecture:
 * - Dense vectors: Stored in FAISS IndexFlatL2 (L2 distance)
 * - Sparse vectors: Generated using SimpleBM25 for keyword matching
 * - Hybrid search: Combines both using RRF fusion
 *
 * Storage structure:
 * ~/.context/faiss-indexes/
 *   └── {collection_name}/
 *       ├── dense.index        # FAISS index file
 *       ├── sparse.json        # BM25 model (vocabulary, IDF)
 *       └── metadata.json      # Document metadata
 *
 * Limitations:
 * - Document deletion is NOT supported (FAISS IndexFlatL2 limitation)
 * - Query filters are NOT supported (returns all documents)
 * - To remove documents, you must drop and recreate the collection
 */
export class FaissVectorDatabase extends BaseVectorDatabase<FaissConfig> {
  private collections: Map<string, {
    index: IndexFlatL2
    metadata: CollectionMetadata
    documents: Map<string, DocumentMetadata>
    bm25?: SimpleBM25
  }> = new Map()

  constructor(config: FaissConfig) {
    // Set storageDir default before calling super(), which triggers initialize()
    const configWithDefaults: FaissConfig = {
      ...config,
      storageDir: config.storageDir || path.join(os.homedir(), '.context', 'faiss-indexes'),
    }
    super(configWithDefaults)
  }

  /**
   * Get storage directory (lazily computed from config)
   */
  private get storageDir(): string {
    return this.config.storageDir!
  }

  /**
   * Initialize FAISS storage directory
   */
  protected async initialize(): Promise<void> {
    try {
      console.log('[FaissDB] 🔧 Initializing FAISS storage at:', this.storageDir)
      await fs.ensureDir(this.storageDir)
      console.log('[FaissDB] ✅ FAISS storage initialized')
    }
    catch (error: any) {
      const errorMsg = `Failed to initialize FAISS storage at ${this.storageDir}: ${error.message}`
      console.error(`[FaissDB] ❌ ${errorMsg}`)
      console.error(`[FaissDB] Error code: ${error.code || 'UNKNOWN'}`)

      if (error.code === 'EACCES') {
        throw new Error(`${errorMsg}\nPermission denied. Check directory permissions.`)
      }
      else if (error.code === 'ENOSPC') {
        throw new Error(`${errorMsg}\nDisk space exhausted. Free up disk space and try again.`)
      }
      else if (error.code === 'ENOENT') {
        throw new Error(`${errorMsg}\nParent directory does not exist.`)
      }
      else {
        throw new Error(errorMsg)
      }
    }
  }

  /**
   * FAISS indexes are loaded on-demand when accessed
   */
  protected async ensureLoaded(collectionName: string): Promise<void> {
    if (this.collections.has(collectionName)) {
      return
    }

    const collectionPath = this.getCollectionPath(collectionName)
    if (!(await fs.pathExists(collectionPath))) {
      throw new Error(`Collection ${collectionName} does not exist`)
    }

    await this.loadCollection(collectionName)
  }

  /**
   * Get collection storage path
   */
  private getCollectionPath(collectionName: string): string {
    return path.join(this.storageDir, collectionName)
  }

  /**
   * Load collection from disk
   */
  private async loadCollection(collectionName: string): Promise<void> {
    const collectionPath = this.getCollectionPath(collectionName)

    console.log('[FaissDB] 📂 Loading collection:', collectionName)

    try {
      // Load metadata
      const metadataPath = path.join(collectionPath, 'metadata.json')
      let metadata: CollectionMetadata
      try {
        metadata = await fs.readJson(metadataPath)
      }
      catch (error: any) {
        throw new Error(
          `Failed to load collection metadata from ${metadataPath}: ${error.message}. `
          + `The metadata file may be corrupted. Try re-indexing the collection.`,
        )
      }

      // Load FAISS index
      const indexPath = path.join(collectionPath, 'dense.index')
      let index: IndexFlatL2
      try {
        index = IndexFlatL2.read(indexPath)
      }
      catch (error: any) {
        throw new Error(
          `Failed to load FAISS index from ${indexPath}: ${error.message}. `
          + `The index file may be corrupted. Try re-indexing the collection.`,
        )
      }

      // Load documents
      const documentsPath = path.join(collectionPath, 'documents.json')
      let documentsArray: DocumentMetadata[]
      try {
        documentsArray = await fs.readJson(documentsPath)
      }
      catch (error: any) {
        throw new Error(
          `Failed to load documents metadata from ${documentsPath}: ${error.message}. `
          + `The documents file may be corrupted. Try re-indexing the collection.`,
        )
      }
      const documents = new Map(documentsArray.map((doc) => [doc.id, doc]))

      // Load BM25 model if hybrid collection
      let bm25: SimpleBM25 | undefined
      if (metadata.isHybrid) {
        const bm25Path = path.join(collectionPath, 'sparse.json')
        try {
          const bm25Json = await fs.readFile(bm25Path, 'utf-8')
          bm25 = SimpleBM25.fromJSON(bm25Json)
        }
        catch (error: any) {
          throw new Error(
            `Failed to load BM25 model from ${bm25Path}: ${error.message}. `
            + `The BM25 file may be corrupted. Try re-indexing the collection.`,
          )
        }
      }

      this.collections.set(collectionName, {
        index,
        metadata,
        documents,
        bm25,
      })

      console.log('[FaissDB] ✅ Loaded collection:', collectionName)
      console.log('[FaissDB] 📊 Document count:', documents.size)
    }
    catch (error: any) {
      console.error(`[FaissDB] ❌ Failed to load collection ${collectionName}:`, error.message)
      throw error
    }
  }

  /**
   * Save collection to disk
   */
  private async saveCollection(collectionName: string): Promise<void> {
    const collection = this.collections.get(collectionName)
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found in memory`)
    }

    const collectionPath = this.getCollectionPath(collectionName)

    try {
      await fs.ensureDir(collectionPath)
    }
    catch (error: any) {
      const errorMsg = `Failed to create collection directory ${collectionPath}: ${error.message}`
      console.error(`[FaissDB] ❌ ${errorMsg}`)
      throw new Error(errorMsg)
    }

    try {
      // Save FAISS index
      const indexPath = path.join(collectionPath, 'dense.index')
      try {
        collection.index.write(indexPath)
      }
      catch (error: any) {
        throw new Error(`Failed to write FAISS index to ${indexPath}: ${error.message}`)
      }

      // Save metadata
      const metadataPath = path.join(collectionPath, 'metadata.json')
      try {
        await fs.writeJson(metadataPath, collection.metadata, { spaces: 2 })
      }
      catch (error: any) {
        throw new Error(`Failed to write metadata to ${metadataPath}: ${error.message}`)
      }

      // Save documents
      const documentsPath = path.join(collectionPath, 'documents.json')
      const documentsArray = Array.from(collection.documents.values())
      try {
        await fs.writeJson(documentsPath, documentsArray, { spaces: 2 })
      }
      catch (error: any) {
        throw new Error(`Failed to write documents to ${documentsPath}: ${error.message}`)
      }

      // Save BM25 model if hybrid collection
      if (collection.bm25 && collection.metadata.isHybrid) {
        const bm25Path = path.join(collectionPath, 'sparse.json')
        try {
          const bm25Json = collection.bm25.toJSON()
          await fs.writeFile(bm25Path, bm25Json, 'utf-8')
        }
        catch (error: any) {
          throw new Error(`Failed to write BM25 model to ${bm25Path}: ${error.message}`)
        }
      }

      console.log('[FaissDB] 💾 Saved collection:', collectionName)
    }
    catch (error: any) {
      console.error(`[FaissDB] ❌ Failed to save collection ${collectionName}:`, error.message)
      console.error(`[FaissDB] Collection may be in an inconsistent state. Consider re-indexing.`)
      throw error
    }
  }

  /**
   * Create collection with dense vectors only
   */
  async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
    await this.ensureInitialized()

    if (this.collections.has(collectionName)) {
      throw new Error(`Collection ${collectionName} already exists`)
    }

    const collectionPath = this.getCollectionPath(collectionName)
    if (await fs.pathExists(collectionPath)) {
      throw new Error(`Collection ${collectionName} already exists on disk`)
    }

    console.log('[FaissDB] 🔧 Creating collection:', collectionName)
    console.log('[FaissDB] 📏 Vector dimension:', dimension)

    // Create FAISS index
    const index = new IndexFlatL2(dimension)

    // Create metadata
    const metadata: CollectionMetadata = {
      name: collectionName,
      dimension,
      isHybrid: false,
      documentCount: 0,
      createdAt: new Date().toISOString(),
    }

    this.collections.set(collectionName, {
      index,
      metadata,
      documents: new Map(),
    })

    await this.saveCollection(collectionName)
    console.log('[FaissDB] ✅ Collection created:', collectionName)
  }

  /**
   * Create collection with hybrid search support (dense + sparse vectors)
   */
  async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
    await this.ensureInitialized()

    if (this.collections.has(collectionName)) {
      throw new Error(`Collection ${collectionName} already exists`)
    }

    const collectionPath = this.getCollectionPath(collectionName)
    if (await fs.pathExists(collectionPath)) {
      throw new Error(`Collection ${collectionName} already exists on disk`)
    }

    console.log('[FaissDB] 🔧 Creating hybrid collection:', collectionName)
    console.log('[FaissDB] 📏 Vector dimension:', dimension)

    // Create FAISS index
    const index = new IndexFlatL2(dimension)

    // Create BM25 generator
    const bm25 = new SimpleBM25(this.config.bm25Config)

    // Create metadata
    const metadata: CollectionMetadata = {
      name: collectionName,
      dimension,
      isHybrid: true,
      documentCount: 0,
      createdAt: new Date().toISOString(),
    }

    this.collections.set(collectionName, {
      index,
      metadata,
      documents: new Map(),
      bm25,
    })

    await this.saveCollection(collectionName)
    console.log('[FaissDB] ✅ Hybrid collection created:', collectionName)
  }

  /**
   * Drop collection
   */
  async dropCollection(collectionName: string): Promise<void> {
    await this.ensureInitialized()

    console.log('[FaissDB] 🗑️  Dropping collection:', collectionName)

    // Store reference in case we need to restore on disk error
    const collectionBackup = this.collections.get(collectionName)

    // Remove from memory first
    this.collections.delete(collectionName)

    // Remove from disk
    const collectionPath = this.getCollectionPath(collectionName)
    try {
      if (await fs.pathExists(collectionPath)) {
        await fs.remove(collectionPath)
      }
    }
    catch (error: any) {
      // Restore in-memory state to maintain consistency
      if (collectionBackup) {
        this.collections.set(collectionName, collectionBackup)
      }

      const errorMsg = `Failed to remove collection '${collectionName}' from disk: ${error.message}`
      console.error(`[FaissDB] ❌ ${errorMsg}`)

      if (error.code === 'EACCES') {
        throw new Error(`${errorMsg}\nPermission denied. Check file permissions.`)
      }
      else if (error.code === 'EBUSY') {
        throw new Error(`${errorMsg}\nFiles are in use by another process.`)
      }
      throw new Error(errorMsg)
    }

    console.log('[FaissDB] ✅ Collection dropped:', collectionName)
  }

  /**
   * Check if collection exists
   */
  async hasCollection(collectionName: string): Promise<boolean> {
    await this.ensureInitialized()

    // Check memory first
    if (this.collections.has(collectionName)) {
      return true
    }

    // Check disk
    const collectionPath = this.getCollectionPath(collectionName)
    return await fs.pathExists(collectionPath)
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    await this.ensureInitialized()

    const collections: string[] = []

    // Read from storage directory
    if (await fs.pathExists(this.storageDir)) {
      const entries = await fs.readdir(this.storageDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          collections.push(entry.name)
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
    await this.ensureLoaded(collectionName)

    const collection = this.collections.get(collectionName)
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`)
    }

    console.log('[FaissDB] 📝 Inserting documents:', documents.length)

    // Validate vector dimensions
    const expectedDim = collection.metadata.dimension
    for (const doc of documents) {
      if (doc.vector.length !== expectedDim) {
        throw new Error(
          `Vector dimension mismatch for document '${doc.id}': `
          + `expected ${expectedDim}, got ${doc.vector.length}`,
        )
      }
    }

    // Add vectors to FAISS index one at a time
    documents.forEach((doc) => {
      collection.index.add(doc.vector)
    })

    // Store document metadata
    documents.forEach((doc) => {
      collection.documents.set(doc.id, {
        id: doc.id,
        content: doc.content,
        relativePath: doc.relativePath,
        startLine: doc.startLine,
        endLine: doc.endLine,
        fileExtension: doc.fileExtension,
        metadata: doc.metadata,
      })
    })

    // Update metadata
    collection.metadata.documentCount = collection.documents.size

    await this.saveCollection(collectionName)
    console.log('[FaissDB] ✅ Inserted documents:', documents.length)
  }

  /**
   * Insert hybrid vector documents (dense + sparse)
   */
  async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    const collection = this.collections.get(collectionName)
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`)
    }

    if (!collection.metadata.isHybrid || !collection.bm25) {
      throw new Error(`Collection ${collectionName} is not a hybrid collection`)
    }

    console.log('[FaissDB] 📝 Inserting hybrid documents:', documents.length)

    // Validate vector dimensions
    const expectedDim = collection.metadata.dimension
    for (const doc of documents) {
      if (doc.vector.length !== expectedDim) {
        throw new Error(
          `Vector dimension mismatch for document '${doc.id}': `
          + `expected ${expectedDim}, got ${doc.vector.length}`,
        )
      }
    }

    // Train BM25 on all documents (including new ones)
    const allDocuments = [...collection.documents.values(), ...documents]
    const allContents = allDocuments.map((doc) => doc.content)
    collection.bm25.learn(allContents)

    // Add vectors to FAISS index one at a time
    documents.forEach((doc) => {
      collection.index.add(doc.vector)
    })

    // Store document metadata
    documents.forEach((doc) => {
      collection.documents.set(doc.id, {
        id: doc.id,
        content: doc.content,
        relativePath: doc.relativePath,
        startLine: doc.startLine,
        endLine: doc.endLine,
        fileExtension: doc.fileExtension,
        metadata: doc.metadata,
      })
    })

    // Update metadata
    collection.metadata.documentCount = collection.documents.size

    await this.saveCollection(collectionName)
    console.log('[FaissDB] ✅ Inserted hybrid documents:', documents.length)
  }

  /**
   * Search similar vectors (dense search only)
   */
  async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    const collection = this.collections.get(collectionName)
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`)
    }

    // FAISS requires topK <= ntotal (number of vectors in index)
    const ntotal = collection.index.ntotal()
    if (ntotal === 0) {
      console.log('[FaissDB] 🔍 Empty collection, returning no results')
      return []
    }

    const requestedTopK = options?.topK || 10
    const topK = Math.min(requestedTopK, ntotal)

    console.log('[FaissDB] 🔍 Searching vectors, topK:', topK, '(requested:', requestedTopK, ', ntotal:', ntotal, ')')

    // Search FAISS index
    const results = collection.index.search(queryVector, topK)

    // Convert to VectorSearchResult
    const searchResults: VectorSearchResult[] = []
    const documentsArray = Array.from(collection.documents.values())

    for (let i = 0; i < results.labels.length; i++) {
      const idx = results.labels[i]
      const distance = results.distances[i]

      if (idx >= 0 && idx < documentsArray.length) {
        const doc = documentsArray[idx]

        // Convert L2 distance to cosine similarity score
        // Lower distance = higher similarity
        const score = 1 / (1 + distance)

        // Apply threshold filter if specified
        if (options?.threshold !== undefined && score < options.threshold) {
          continue
        }

        searchResults.push({
          document: {
            id: doc.id,
            vector: [], // Vector not needed in results
            content: doc.content,
            relativePath: doc.relativePath,
            startLine: doc.startLine,
            endLine: doc.endLine,
            fileExtension: doc.fileExtension,
            metadata: doc.metadata,
          },
          score,
        })
      }
    }

    console.log('[FaissDB] ✅ Found results:', searchResults.length)
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
    await this.ensureLoaded(collectionName)

    const collection = this.collections.get(collectionName)
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`)
    }

    if (!collection.metadata.isHybrid || !collection.bm25) {
      throw new Error(`Collection ${collectionName} is not a hybrid collection`)
    }

    const limit = options?.limit || 10
    console.log('[FaissDB] 🔍 Hybrid search, requests:', searchRequests.length)

    // Process search requests and collect results
    const denseResults = new Map<string, number>()
    const sparseResults = new Map<string, number>()

    for (const request of searchRequests) {
      if (request.anns_field === 'vector' || request.anns_field === 'dense') {
        this.performDenseSearch(collection, request.data as number[], limit, denseResults)
      }
      else if (request.anns_field === 'sparse' || request.anns_field === 'sparse_vector') {
        this.performSparseSearch(collection, request.data as string, sparseResults)
      }
    }

    // Apply RRF reranking
    const rrfResults = this.applyRRF(collection, denseResults, sparseResults, options)

    console.log('[FaissDB] ✅ Hybrid search results:', rrfResults.length)
    return rrfResults.slice(0, limit)
  }

  /**
   * Perform dense vector search using FAISS index
   */
  private performDenseSearch(
    collection: { index: IndexFlatL2, documents: Map<string, DocumentMetadata> },
    queryVector: number[],
    limit: number,
    results: Map<string, number>,
  ): void {
    const ntotal = collection.index.ntotal()
    if (ntotal === 0) return

    const topK = Math.min(limit * 2, ntotal)
    const searchResults = collection.index.search(queryVector, topK)
    const documentsArray = Array.from(collection.documents.values())

    for (let i = 0; i < searchResults.labels.length; i++) {
      const idx = searchResults.labels[i]
      const distance = searchResults.distances[i]

      if (idx >= 0 && idx < documentsArray.length) {
        const doc = documentsArray[idx]
        const score = 1 / (1 + distance)
        results.set(doc.id, score)
      }
    }
  }

  /**
   * Perform sparse search using BM25
   */
  private performSparseSearch(
    collection: { bm25?: SimpleBM25, documents: Map<string, DocumentMetadata> },
    queryText: string,
    results: Map<string, number>,
  ): void {
    if (!collection.bm25) return

    // Generate query vector once (outside the loop)
    const queryVector = collection.bm25.generate(queryText)
    const queryMap = new Map<number, number>()
    for (let i = 0; i < queryVector.indices.length; i++) {
      queryMap.set(queryVector.indices[i], queryVector.values[i])
    }

    // Score all documents
    for (const doc of collection.documents.values()) {
      const score = this.calculateSparseScore(collection.bm25, doc.content, queryMap)
      if (score > 0) {
        results.set(doc.id, score)
      }
    }
  }

  /**
   * Calculate sparse vector dot product score
   */
  private calculateSparseScore(
    bm25: SimpleBM25,
    content: string,
    queryMap: Map<number, number>,
  ): number {
    const sparseVector = bm25.generate(content)
    let score = 0

    for (let i = 0; i < sparseVector.indices.length; i++) {
      const idx = sparseVector.indices[i]
      const val = sparseVector.values[i]
      const queryVal = queryMap.get(idx)
      if (queryVal !== undefined) {
        score += val * queryVal
      }
    }

    return score
  }

  /**
   * Pre-compute ranks from scores (O(n log n) instead of O(n²))
   */
  private computeRanks(scores: Map<string, number>): Map<string, number> {
    const ranks = new Map<string, number>()
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])
    sorted.forEach(([id], index) => ranks.set(id, index + 1))
    return ranks
  }

  /**
   * Apply Reciprocal Rank Fusion (RRF) reranking
   */
  private applyRRF(
    collection: { documents: Map<string, DocumentMetadata> },
    denseResults: Map<string, number>,
    sparseResults: Map<string, number>,
    options?: HybridSearchOptions,
  ): HybridSearchResult[] {
    const k = options?.rerank?.params?.k || 60

    // Pre-compute ranks once (O(n log n) total instead of O(n²))
    const denseRanks = this.computeRanks(denseResults)
    const sparseRanks = this.computeRanks(sparseResults)

    // Combine all document IDs and calculate RRF scores
    const allDocIds = new Set([...denseResults.keys(), ...sparseResults.keys()])
    const rrfScores: Array<[string, number]> = []

    for (const docId of allDocIds) {
      let rrfScore = 0
      const denseRank = denseRanks.get(docId)
      const sparseRank = sparseRanks.get(docId)

      if (denseRank !== undefined) {
        rrfScore += 1 / (k + denseRank)
      }
      if (sparseRank !== undefined) {
        rrfScore += 1 / (k + sparseRank)
      }

      rrfScores.push([docId, rrfScore])
    }

    // Sort by RRF score and convert to results
    rrfScores.sort((a, b) => b[1] - a[1])

    const results: HybridSearchResult[] = []
    for (const [docId, score] of rrfScores) {
      const doc = collection.documents.get(docId)
      if (doc) {
        results.push({
          document: {
            id: doc.id,
            vector: [],
            content: doc.content,
            relativePath: doc.relativePath,
            startLine: doc.startLine,
            endLine: doc.endLine,
            fileExtension: doc.fileExtension,
            metadata: doc.metadata,
          },
          score,
        })
      }
    }
    return results
  }

  /**
   * Delete documents by IDs
   *
   * ⚠️ NOT IMPLEMENTED: FAISS does not support document deletion
   *
   * The FAISS IndexFlatL2 library does not provide a way to remove vectors
   * from an existing index. To fully remove documents, you must:
   *
   * 1. Drop the collection using dropCollection()
   * 2. Recreate it using createCollection() or createHybridCollection()
   * 3. Re-insert all documents except the ones you want to delete
   *
   * @throws Error Always throws - deletion is not supported
   * @param collectionName Collection name
   * @param ids Document IDs to delete (not used)
   */
  async delete(collectionName: string, ids: string[]): Promise<void> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    console.error(`[FaissDB] ❌ FAISS does not support document deletion`)
    console.error(`[FaissDB] ❌ Attempted to delete ${ids.length} document(s) from collection '${collectionName}'`)

    throw new Error(
      `FAISS does not support document deletion. `
      + `To remove documents from collection '${collectionName}', you must:\n`
      + `  1. Drop the collection using dropCollection()\n`
      + `  2. Recreate it using createCollection() or createHybridCollection()\n`
      + `  3. Re-insert all documents except the ones you want to delete\n\n`
      + `Attempted to delete document IDs: ${ids.join(', ')}`,
    )
  }

  /**
   * Query documents with filter conditions
   *
   * ⚠️ LIMITATION: Filter parameter is currently ignored
   *
   * This method returns ALL documents in the collection (up to limit),
   * not filtered results. Filter parsing is not yet implemented for FAISS.
   *
   * @param collectionName Collection name
   * @param filter Filter expression (currently ignored - returns all documents)
   * @param outputFields Fields to return in results
   * @param limit Maximum number of results (only limit is enforced)
   * @returns All documents with specified fields (up to limit)
   */
  async query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number,
  ): Promise<Record<string, any>[]> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)

    const collection = this.collections.get(collectionName)
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`)
    }

    if (filter && filter.trim() !== '') {
      console.warn(`[FaissDB] ⚠️  Query filters are not implemented. Filter '${filter}' will be ignored.`)
      console.warn(`[FaissDB] ⚠️  All documents will be returned (up to limit). Consider using another vector database if filtering is required.`)
    }

    console.log('[FaissDB] 🔍 Querying documents (no filter support)')

    const results: Record<string, any>[] = []

    for (const doc of collection.documents.values()) {
      const result: Record<string, any> = {}
      for (const field of outputFields) {
        if (field === 'id') result.id = doc.id
        else if (field === 'content') result.content = doc.content
        else if (field === 'relativePath') result.relativePath = doc.relativePath
        else if (field === 'startLine') result.startLine = doc.startLine
        else if (field === 'endLine') result.endLine = doc.endLine
        else if (field === 'fileExtension') result.fileExtension = doc.fileExtension
        else if (doc.metadata[field] !== undefined) {
          result[field] = doc.metadata[field]
        }
      }
      results.push(result)

      if (limit && results.length >= limit) {
        break
      }
    }

    return results
  }

  /**
   * Check collection limit
   * FAISS has no inherent collection limit (only limited by disk space)
   */
  async checkCollectionLimit(): Promise<boolean> {
    return true
  }
}
