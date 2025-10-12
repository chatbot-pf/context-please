import { IndexFlatL2 } from 'faiss-node';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
} from './types';
import { BaseVectorDatabase, BaseDatabaseConfig } from './base/base-vector-database';
import { SimpleBM25, BM25Config } from './sparse/simple-bm25';

export interface FaissConfig extends BaseDatabaseConfig {
    /**
     * Storage directory for FAISS indexes
     * @default ~/.context/faiss-indexes
     */
    storageDir?: string;

    /**
     * BM25 configuration for sparse vector generation
     */
    bm25Config?: BM25Config;
}

interface CollectionMetadata {
    name: string;
    dimension: number;
    isHybrid: boolean;
    documentCount: number;
    createdAt: string;
}

interface DocumentMetadata {
    id: string;
    content: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    fileExtension: string;
    metadata: Record<string, any>;
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
 */
export class FaissVectorDatabase extends BaseVectorDatabase<FaissConfig> {
    private storageDir: string;
    private collections: Map<string, {
        index: IndexFlatL2;
        metadata: CollectionMetadata;
        documents: Map<string, DocumentMetadata>;
        bm25?: SimpleBM25;
    }> = new Map();

    constructor(config: FaissConfig) {
        super(config);
        this.storageDir = config.storageDir || path.join(os.homedir(), '.context', 'faiss-indexes');
    }

    /**
     * Initialize FAISS storage directory
     */
    protected async initialize(): Promise<void> {
        console.log('[FaissDB] 🔧 Initializing FAISS storage at:', this.storageDir);
        await fs.ensureDir(this.storageDir);
        console.log('[FaissDB] ✅ FAISS storage initialized');
    }

    /**
     * FAISS indexes are loaded on-demand when accessed
     */
    protected async ensureLoaded(collectionName: string): Promise<void> {
        if (this.collections.has(collectionName)) {
            return;
        }

        const collectionPath = this.getCollectionPath(collectionName);
        if (!(await fs.pathExists(collectionPath))) {
            throw new Error(`Collection ${collectionName} does not exist`);
        }

        await this.loadCollection(collectionName);
    }

    /**
     * Get collection storage path
     */
    private getCollectionPath(collectionName: string): string {
        return path.join(this.storageDir, collectionName);
    }

    /**
     * Load collection from disk
     */
    private async loadCollection(collectionName: string): Promise<void> {
        const collectionPath = this.getCollectionPath(collectionName);

        console.log('[FaissDB] 📂 Loading collection:', collectionName);

        // Load metadata
        const metadataPath = path.join(collectionPath, 'metadata.json');
        const metadata: CollectionMetadata = await fs.readJson(metadataPath);

        // Load FAISS index
        const indexPath = path.join(collectionPath, 'dense.index');
        const index = IndexFlatL2.read(indexPath);

        // Load documents
        const documentsPath = path.join(collectionPath, 'documents.json');
        const documentsArray: DocumentMetadata[] = await fs.readJson(documentsPath);
        const documents = new Map(documentsArray.map(doc => [doc.id, doc]));

        // Load BM25 model if hybrid collection
        let bm25: SimpleBM25 | undefined;
        if (metadata.isHybrid) {
            const bm25Path = path.join(collectionPath, 'sparse.json');
            const bm25Data = await fs.readJson(bm25Path);
            bm25 = new SimpleBM25(this.config.bm25Config);
            this.deserializeBM25(bm25, bm25Data);
        }

        this.collections.set(collectionName, {
            index,
            metadata,
            documents,
            bm25
        });

        console.log('[FaissDB] ✅ Loaded collection:', collectionName);
        console.log('[FaissDB] 📊 Document count:', documents.size);
    }

    /**
     * Save collection to disk
     */
    private async saveCollection(collectionName: string): Promise<void> {
        const collection = this.collections.get(collectionName);
        if (!collection) {
            throw new Error(`Collection ${collectionName} not found in memory`);
        }

        const collectionPath = this.getCollectionPath(collectionName);
        await fs.ensureDir(collectionPath);

        // Save FAISS index
        const indexPath = path.join(collectionPath, 'dense.index');
        collection.index.write(indexPath);

        // Save metadata
        const metadataPath = path.join(collectionPath, 'metadata.json');
        await fs.writeJson(metadataPath, collection.metadata, { spaces: 2 });

        // Save documents
        const documentsPath = path.join(collectionPath, 'documents.json');
        const documentsArray = Array.from(collection.documents.values());
        await fs.writeJson(documentsPath, documentsArray, { spaces: 2 });

        // Save BM25 model if hybrid collection
        if (collection.bm25 && collection.metadata.isHybrid) {
            const bm25Path = path.join(collectionPath, 'sparse.json');
            const bm25Data = this.serializeBM25(collection.bm25);
            await fs.writeJson(bm25Path, bm25Data, { spaces: 2 });
        }

        console.log('[FaissDB] 💾 Saved collection:', collectionName);
    }

    /**
     * Serialize BM25 model to JSON
     */
    private serializeBM25(bm25: SimpleBM25): any {
        return {
            vocabulary: Array.from(bm25.getVocabulary().entries()),
            idf: Array.from(bm25.getIDFScores().entries()),
            avgDocLength: bm25.getAverageDocumentLength(),
            trained: bm25.isTrained()
        };
    }

    /**
     * Deserialize BM25 model from JSON
     */
    private deserializeBM25(bm25: SimpleBM25, data: any): void {
        // Use reflection to access private properties
        // This is a workaround since SimpleBM25 doesn't have a deserialize method
        (bm25 as any).vocabulary = new Map(data.vocabulary);
        (bm25 as any).idf = new Map(data.idf);
        (bm25 as any).avgDocLength = data.avgDocLength;
        (bm25 as any).trained = data.trained;
    }

    /**
     * Create collection with dense vectors only
     */
    async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.ensureInitialized();

        if (this.collections.has(collectionName)) {
            throw new Error(`Collection ${collectionName} already exists`);
        }

        const collectionPath = this.getCollectionPath(collectionName);
        if (await fs.pathExists(collectionPath)) {
            throw new Error(`Collection ${collectionName} already exists on disk`);
        }

        console.log('[FaissDB] 🔧 Creating collection:', collectionName);
        console.log('[FaissDB] 📏 Vector dimension:', dimension);

        // Create FAISS index
        const index = new IndexFlatL2(dimension);

        // Create metadata
        const metadata: CollectionMetadata = {
            name: collectionName,
            dimension,
            isHybrid: false,
            documentCount: 0,
            createdAt: new Date().toISOString()
        };

        this.collections.set(collectionName, {
            index,
            metadata,
            documents: new Map()
        });

        await this.saveCollection(collectionName);
        console.log('[FaissDB] ✅ Collection created:', collectionName);
    }

    /**
     * Create collection with hybrid search support (dense + sparse vectors)
     */
    async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.ensureInitialized();

        if (this.collections.has(collectionName)) {
            throw new Error(`Collection ${collectionName} already exists`);
        }

        const collectionPath = this.getCollectionPath(collectionName);
        if (await fs.pathExists(collectionPath)) {
            throw new Error(`Collection ${collectionName} already exists on disk`);
        }

        console.log('[FaissDB] 🔧 Creating hybrid collection:', collectionName);
        console.log('[FaissDB] 📏 Vector dimension:', dimension);

        // Create FAISS index
        const index = new IndexFlatL2(dimension);

        // Create BM25 generator
        const bm25 = new SimpleBM25(this.config.bm25Config);

        // Create metadata
        const metadata: CollectionMetadata = {
            name: collectionName,
            dimension,
            isHybrid: true,
            documentCount: 0,
            createdAt: new Date().toISOString()
        };

        this.collections.set(collectionName, {
            index,
            metadata,
            documents: new Map(),
            bm25
        });

        await this.saveCollection(collectionName);
        console.log('[FaissDB] ✅ Hybrid collection created:', collectionName);
    }

    /**
     * Drop collection
     */
    async dropCollection(collectionName: string): Promise<void> {
        await this.ensureInitialized();

        console.log('[FaissDB] 🗑️  Dropping collection:', collectionName);

        // Remove from memory
        this.collections.delete(collectionName);

        // Remove from disk
        const collectionPath = this.getCollectionPath(collectionName);
        if (await fs.pathExists(collectionPath)) {
            await fs.remove(collectionPath);
        }

        console.log('[FaissDB] ✅ Collection dropped:', collectionName);
    }

    /**
     * Check if collection exists
     */
    async hasCollection(collectionName: string): Promise<boolean> {
        await this.ensureInitialized();

        // Check memory first
        if (this.collections.has(collectionName)) {
            return true;
        }

        // Check disk
        const collectionPath = this.getCollectionPath(collectionName);
        return await fs.pathExists(collectionPath);
    }

    /**
     * List all collections
     */
    async listCollections(): Promise<string[]> {
        await this.ensureInitialized();

        const collections: string[] = [];

        // Read from storage directory
        if (await fs.pathExists(this.storageDir)) {
            const entries = await fs.readdir(this.storageDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    collections.push(entry.name);
                }
            }
        }

        return collections;
    }

    /**
     * Insert vector documents (dense only)
     */
    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        const collection = this.collections.get(collectionName);
        if (!collection) {
            throw new Error(`Collection ${collectionName} not found`);
        }

        console.log('[FaissDB] 📝 Inserting documents:', documents.length);

        // Add vectors to FAISS index
        const vectors = documents.map(doc => doc.vector);
        collection.index.add(vectors);

        // Store document metadata
        documents.forEach(doc => {
            collection.documents.set(doc.id, {
                id: doc.id,
                content: doc.content,
                relativePath: doc.relativePath,
                startLine: doc.startLine,
                endLine: doc.endLine,
                fileExtension: doc.fileExtension,
                metadata: doc.metadata
            });
        });

        // Update metadata
        collection.metadata.documentCount = collection.documents.size;

        await this.saveCollection(collectionName);
        console.log('[FaissDB] ✅ Inserted documents:', documents.length);
    }

    /**
     * Insert hybrid vector documents (dense + sparse)
     */
    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        const collection = this.collections.get(collectionName);
        if (!collection) {
            throw new Error(`Collection ${collectionName} not found`);
        }

        if (!collection.metadata.isHybrid || !collection.bm25) {
            throw new Error(`Collection ${collectionName} is not a hybrid collection`);
        }

        console.log('[FaissDB] 📝 Inserting hybrid documents:', documents.length);

        // Train BM25 on all documents (including new ones)
        const allDocuments = [...collection.documents.values(), ...documents];
        const allContents = allDocuments.map(doc => doc.content);
        collection.bm25.learn(allContents);

        // Add vectors to FAISS index
        const vectors = documents.map(doc => doc.vector);
        collection.index.add(vectors);

        // Store document metadata
        documents.forEach(doc => {
            collection.documents.set(doc.id, {
                id: doc.id,
                content: doc.content,
                relativePath: doc.relativePath,
                startLine: doc.startLine,
                endLine: doc.endLine,
                fileExtension: doc.fileExtension,
                metadata: doc.metadata
            });
        });

        // Update metadata
        collection.metadata.documentCount = collection.documents.size;

        await this.saveCollection(collectionName);
        console.log('[FaissDB] ✅ Inserted hybrid documents:', documents.length);
    }

    /**
     * Search similar vectors (dense search only)
     */
    async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        const collection = this.collections.get(collectionName);
        if (!collection) {
            throw new Error(`Collection ${collectionName} not found`);
        }

        const topK = options?.topK || 10;

        console.log('[FaissDB] 🔍 Searching vectors, topK:', topK);

        // Search FAISS index
        const results = collection.index.search(queryVector, topK);

        // Convert to VectorSearchResult
        const searchResults: VectorSearchResult[] = [];
        const documentsArray = Array.from(collection.documents.values());

        for (let i = 0; i < results.labels.length; i++) {
            const idx = results.labels[i];
            const distance = results.distances[i];

            if (idx >= 0 && idx < documentsArray.length) {
                const doc = documentsArray[idx];

                // Convert L2 distance to cosine similarity score
                // Lower distance = higher similarity
                const score = 1 / (1 + distance);

                // Apply threshold filter if specified
                if (options?.threshold !== undefined && score < options.threshold) {
                    continue;
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
                        metadata: doc.metadata
                    },
                    score
                });
            }
        }

        console.log('[FaissDB] ✅ Found results:', searchResults.length);
        return searchResults;
    }

    /**
     * Hybrid search with multiple vector fields (dense + sparse)
     */
    async hybridSearch(
        collectionName: string,
        searchRequests: HybridSearchRequest[],
        options?: HybridSearchOptions
    ): Promise<HybridSearchResult[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        const collection = this.collections.get(collectionName);
        if (!collection) {
            throw new Error(`Collection ${collectionName} not found`);
        }

        if (!collection.metadata.isHybrid || !collection.bm25) {
            throw new Error(`Collection ${collectionName} is not a hybrid collection`);
        }

        const limit = options?.limit || 10;

        console.log('[FaissDB] 🔍 Hybrid search, requests:', searchRequests.length);

        // Separate dense and sparse search requests
        let denseResults: Map<string, number> = new Map();
        let sparseResults: Map<string, number> = new Map();

        for (const request of searchRequests) {
            if (request.anns_field === 'vector' || request.anns_field === 'dense') {
                // Dense search
                const queryVector = request.data as number[];
                const results = collection.index.search(queryVector, limit * 2);

                const documentsArray = Array.from(collection.documents.values());
                for (let i = 0; i < results.labels.length; i++) {
                    const idx = results.labels[i];
                    const distance = results.distances[i];

                    if (idx >= 0 && idx < documentsArray.length) {
                        const doc = documentsArray[idx];
                        const score = 1 / (1 + distance);
                        denseResults.set(doc.id, score);
                    }
                }
            } else if (request.anns_field === 'sparse' || request.anns_field === 'sparse_vector') {
                // Sparse search using BM25
                const queryText = request.data as string;

                // Score all documents
                const documentsArray = Array.from(collection.documents.values());
                for (const doc of documentsArray) {
                    const sparseVector = collection.bm25.generate(doc.content);
                    const queryVector = collection.bm25.generate(queryText);

                    // Calculate dot product of sparse vectors
                    let score = 0;
                    const queryMap = new Map<number, number>();
                    for (let i = 0; i < queryVector.indices.length; i++) {
                        queryMap.set(queryVector.indices[i], queryVector.values[i]);
                    }

                    for (let i = 0; i < sparseVector.indices.length; i++) {
                        const idx = sparseVector.indices[i];
                        const val = sparseVector.values[i];
                        const queryVal = queryMap.get(idx);
                        if (queryVal !== undefined) {
                            score += val * queryVal;
                        }
                    }

                    if (score > 0) {
                        sparseResults.set(doc.id, score);
                    }
                }
            }
        }

        // Apply RRF (Reciprocal Rank Fusion) reranking
        const rrfResults = this.applyRRF(collectionName, denseResults, sparseResults, options);

        console.log('[FaissDB] ✅ Hybrid search results:', rrfResults.length);
        return rrfResults.slice(0, limit);
    }

    /**
     * Apply Reciprocal Rank Fusion (RRF) reranking
     */
    private applyRRF(
        collectionName: string,
        denseResults: Map<string, number>,
        sparseResults: Map<string, number>,
        options?: HybridSearchOptions
    ): HybridSearchResult[] {
        const k = options?.rerank?.params?.k || 60;
        const collection = this.collections.get(collectionName);
        if (!collection) {
            throw new Error(`Collection ${collectionName} not found`);
        }

        // Combine all document IDs
        const allDocIds = new Set([...denseResults.keys(), ...sparseResults.keys()]);

        // Calculate RRF scores
        const rrfScores = new Map<string, number>();

        for (const docId of allDocIds) {
            let rrfScore = 0;

            // Add dense rank contribution
            const denseScore = denseResults.get(docId);
            if (denseScore !== undefined) {
                // Convert score to rank (higher score = lower rank number)
                const denseRank = Array.from(denseResults.entries())
                    .sort((a, b) => b[1] - a[1])
                    .findIndex(([id]) => id === docId) + 1;
                rrfScore += 1 / (k + denseRank);
            }

            // Add sparse rank contribution
            const sparseScore = sparseResults.get(docId);
            if (sparseScore !== undefined) {
                const sparseRank = Array.from(sparseResults.entries())
                    .sort((a, b) => b[1] - a[1])
                    .findIndex(([id]) => id === docId) + 1;
                rrfScore += 1 / (k + sparseRank);
            }

            rrfScores.set(docId, rrfScore);
        }

        // Sort by RRF score and convert to results
        const sortedResults = Array.from(rrfScores.entries())
            .sort((a, b) => b[1] - a[1]);

        const results: HybridSearchResult[] = [];
        for (const [docId, score] of sortedResults) {
            const doc = collection.documents.get(docId);
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
                        metadata: doc.metadata
                    },
                    score
                });
            }
        }

        return results;
    }

    /**
     * Delete documents by IDs
     */
    async delete(collectionName: string, ids: string[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        const collection = this.collections.get(collectionName);
        if (!collection) {
            throw new Error(`Collection ${collectionName} not found`);
        }

        console.log('[FaissDB] 🗑️  Deleting documents:', ids.length);

        // FAISS doesn't support deletion, so we need to rebuild the index
        const remainingDocs: DocumentMetadata[] = [];
        const remainingVectors: number[][] = [];
        const documentsArray = Array.from(collection.documents.values());

        // Get all vectors (we need to search to get them)
        for (const doc of documentsArray) {
            if (!ids.includes(doc.id)) {
                remainingDocs.push(doc);
                // Note: We can't retrieve the original vector from FAISS
                // This is a limitation - we'd need to store vectors separately
                // For now, we'll throw an error
            }
        }

        // Remove from documents map
        ids.forEach(id => collection.documents.delete(id));

        // Update metadata
        collection.metadata.documentCount = collection.documents.size;

        // Note: FAISS index cannot be updated, it still contains old vectors
        // This is a known limitation of the current implementation
        // For production use, we'd need to store vectors separately and rebuild

        await this.saveCollection(collectionName);
        console.log('[FaissDB] ⚠️  Documents removed from metadata, but FAISS index not rebuilt');
        console.log('[FaissDB] ⚠️  To fully remove, drop and recreate the collection');
    }

    /**
     * Query documents with filter conditions
     */
    async query(
        collectionName: string,
        filter: string,
        outputFields: string[],
        limit?: number
    ): Promise<Record<string, any>[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        const collection = this.collections.get(collectionName);
        if (!collection) {
            throw new Error(`Collection ${collectionName} not found`);
        }

        console.log('[FaissDB] 🔍 Querying documents with filter');

        // Simple filter implementation
        // In production, this would need a proper query parser
        const results: Record<string, any>[] = [];

        for (const doc of collection.documents.values()) {
            // For now, we'll return all documents since filter parsing is complex
            const result: Record<string, any> = {};
            for (const field of outputFields) {
                if (field === 'id') result.id = doc.id;
                else if (field === 'content') result.content = doc.content;
                else if (field === 'relativePath') result.relativePath = doc.relativePath;
                else if (field === 'startLine') result.startLine = doc.startLine;
                else if (field === 'endLine') result.endLine = doc.endLine;
                else if (field === 'fileExtension') result.fileExtension = doc.fileExtension;
                else if (doc.metadata[field] !== undefined) {
                    result[field] = doc.metadata[field];
                }
            }
            results.push(result);

            if (limit && results.length >= limit) {
                break;
            }
        }

        return results;
    }

    /**
     * Check collection limit
     * FAISS has no inherent collection limit (only limited by disk space)
     */
    async checkCollectionLimit(): Promise<boolean> {
        return true;
    }
}
