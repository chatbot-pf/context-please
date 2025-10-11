import { BaseVectorDatabase, BaseDatabaseConfig } from '../../src/vectordb/base/base-vector-database';
import {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
} from '../../src/vectordb/types';

/**
 * Fake in-memory vector database for integration testing.
 *
 * Features:
 * - In-memory storage using Map
 * - Basic cosine similarity search
 * - Hybrid search simulation with BM25-like scoring
 * - State inspection for test assertions
 * - Error injection capabilities
 */
export class FakeVectorDatabase extends BaseVectorDatabase<BaseDatabaseConfig> {
    private collections: Map<string, FakeCollection> = new Map();
    private shouldFailNextOperation = false;
    private operationDelay = 0;

    protected async initialize(): Promise<void> {
        // Simulate async initialization with minimal delay
        await new Promise(resolve => setTimeout(resolve, 1));
    }

    protected async ensureLoaded(collectionName: string): Promise<void> {
        if (!this.collections.has(collectionName)) {
            throw new Error(`Collection '${collectionName}' not found`);
        }
    }

    async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.ensureInitialized();
        await this.simulateDelay();
        this.throwIfFailureInjected();

        if (this.collections.has(collectionName)) {
            throw new Error(`Collection '${collectionName}' already exists`);
        }

        this.collections.set(collectionName, {
            name: collectionName,
            dimension,
            isHybrid: false,
            documents: [],
        });
    }

    async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.ensureInitialized();
        await this.simulateDelay();
        this.throwIfFailureInjected();

        if (this.collections.has(collectionName)) {
            throw new Error(`Collection '${collectionName}' already exists`);
        }

        this.collections.set(collectionName, {
            name: collectionName,
            dimension,
            isHybrid: true,
            documents: [],
        });
    }

    async dropCollection(collectionName: string): Promise<void> {
        await this.ensureInitialized();
        await this.simulateDelay();
        this.throwIfFailureInjected();

        this.collections.delete(collectionName);
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        await this.ensureInitialized();
        return this.collections.has(collectionName);
    }

    async listCollections(): Promise<string[]> {
        await this.ensureInitialized();
        return Array.from(this.collections.keys());
    }

    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        await this.simulateDelay();
        this.throwIfFailureInjected();

        const collection = this.collections.get(collectionName)!;

        // Validate vector dimensions
        for (const doc of documents) {
            if (doc.vector.length !== collection.dimension) {
                throw new Error(
                    `Vector dimension mismatch: expected ${collection.dimension}, got ${doc.vector.length}`
                );
            }
        }

        collection.documents.push(...documents);
    }

    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        await this.simulateDelay();
        this.throwIfFailureInjected();

        const collection = this.collections.get(collectionName)!;

        if (!collection.isHybrid) {
            throw new Error(`Collection '${collectionName}' is not a hybrid collection`);
        }

        // Validate vector dimensions
        for (const doc of documents) {
            if (doc.vector.length !== collection.dimension) {
                throw new Error(
                    `Vector dimension mismatch: expected ${collection.dimension}, got ${doc.vector.length}`
                );
            }
        }

        collection.documents.push(...documents);
    }

    async search(
        collectionName: string,
        queryVector: number[],
        options?: SearchOptions
    ): Promise<VectorSearchResult[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        await this.simulateDelay();
        this.throwIfFailureInjected();

        const collection = this.collections.get(collectionName)!;
        const limit = options?.topK || 10;
        const threshold = options?.threshold || 0;

        // Compute cosine similarity for all documents
        const results = collection.documents.map(doc => ({
            document: doc,
            score: this.cosineSimilarity(queryVector, doc.vector),
        }));

        // Filter by threshold, sort by score descending, and apply limit
        return results
            .filter(r => r.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    async hybridSearch(
        collectionName: string,
        searchRequests: HybridSearchRequest[],
        options?: HybridSearchOptions
    ): Promise<HybridSearchResult[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        await this.simulateDelay();
        this.throwIfFailureInjected();

        const collection = this.collections.get(collectionName)!;

        if (!collection.isHybrid) {
            throw new Error(`Collection '${collectionName}' is not a hybrid collection`);
        }

        // Simulate hybrid search by combining results from multiple requests
        // This is a simplified version - real implementation would use RRF (Reciprocal Rank Fusion)
        const allResults = new Map<string, { document: VectorDocument; scores: number[] }>();

        for (const request of searchRequests) {
            let requestResults: VectorSearchResult[];

            if (Array.isArray(request.data)) {
                // Dense vector search
                requestResults = await this.search(collectionName, request.data, {
                    topK: request.limit,
                });
            } else {
                // Sparse/BM25 search (simulate with simple keyword matching)
                requestResults = this.simulateBM25Search(collection, request.data as string, request.limit);
            }

            // Accumulate scores for RRF
            requestResults.forEach((result, rank) => {
                const existing = allResults.get(result.document.id);
                if (existing) {
                    existing.scores.push(result.score);
                } else {
                    allResults.set(result.document.id, {
                        document: result.document,
                        scores: [result.score],
                    });
                }
            });
        }

        // Compute RRF scores (simplified: average of scores)
        const limit = options?.limit || 10;
        const hybridResults: HybridSearchResult[] = Array.from(allResults.values()).map(entry => ({
            document: entry.document,
            score: entry.scores.reduce((sum, s) => sum + s, 0) / entry.scores.length,
        }));

        // Sort by RRF score and apply limit
        return hybridResults
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    async delete(collectionName: string, ids: string[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        await this.simulateDelay();
        this.throwIfFailureInjected();

        const collection = this.collections.get(collectionName)!;
        const idSet = new Set(ids);

        collection.documents = collection.documents.filter(doc => !idSet.has(doc.id));
    }

    async query(
        collectionName: string,
        filter: string,
        outputFields: string[],
        limit?: number
    ): Promise<Record<string, any>[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        await this.simulateDelay();
        this.throwIfFailureInjected();

        const collection = this.collections.get(collectionName)!;

        // Simplified filter evaluation (only supports basic expressions)
        const filtered = this.applyFilter(collection.documents, filter);
        const limited = limit ? filtered.slice(0, limit) : filtered;

        // Project only requested fields
        return limited.map(doc => {
            const result: Record<string, any> = {};
            for (const field of outputFields) {
                if (field in doc) {
                    // Special handling for metadata field: stringify if it's an object
                    if (field === 'metadata' && typeof (doc as any)[field] === 'object') {
                        result[field] = JSON.stringify((doc as any)[field]);
                    } else {
                        result[field] = (doc as any)[field];
                    }
                }
            }
            return result;
        });
    }

    async checkCollectionLimit(): Promise<boolean> {
        await this.ensureInitialized();
        // Fake implementation always returns true (no limit)
        return true;
    }

    // ============================================
    // Test Helper Methods (not part of interface)
    // ============================================

    /**
     * Get document count in a collection (for test assertions)
     */
    getCollectionDocumentCount(collectionName: string): number {
        const collection = this.collections.get(collectionName);
        return collection ? collection.documents.length : 0;
    }

    /**
     * Get all documents in a collection (for test assertions)
     */
    getStoredDocuments(collectionName: string): VectorDocument[] {
        const collection = this.collections.get(collectionName);
        return collection ? [...collection.documents] : [];
    }

    /**
     * Check if a collection is hybrid (for test assertions)
     */
    isHybridCollection(collectionName: string): boolean {
        const collection = this.collections.get(collectionName);
        return collection?.isHybrid || false;
    }

    /**
     * Inject a failure for the next operation (for error testing)
     */
    injectFailure(): void {
        this.shouldFailNextOperation = true;
    }

    /**
     * Set operation delay in milliseconds (for async testing)
     */
    setOperationDelay(ms: number): void {
        this.operationDelay = ms;
    }

    /**
     * Reset the database to initial state (for test cleanup)
     */
    reset(): void {
        this.collections.clear();
        this.shouldFailNextOperation = false;
        this.operationDelay = 0;
    }

    // ============================================
    // Private Helper Methods
    // ============================================

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vector dimensions must match for similarity computation');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        return denominator === 0 ? 0 : dotProduct / denominator;
    }

    private simulateBM25Search(
        collection: FakeCollection,
        queryText: string,
        limit: number
    ): VectorSearchResult[] {
        // Simple keyword-based scoring (BM25 simulation)
        const queryTerms = queryText.toLowerCase().split(/\s+/);

        const scored = collection.documents.map(doc => {
            const content = doc.content.toLowerCase();
            let score = 0;

            for (const term of queryTerms) {
                // Count term frequency
                const termCount = (content.match(new RegExp(term, 'g')) || []).length;
                score += termCount;
            }

            // Normalize by document length
            score = score / Math.sqrt(content.length + 1);

            return { document: doc, score };
        });

        return scored
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    private applyFilter(documents: VectorDocument[], filter: string): VectorDocument[] {
        // Very simplified filter evaluation
        // Only supports basic "field == value" or "id in [...]" expressions

        if (filter.includes(' in ')) {
            // Handle "id in ['id1', 'id2']" pattern
            const match = filter.match(/id in \[(.*?)\]/);
            if (match) {
                const ids = match[1]
                    .split(',')
                    .map(s => s.trim().replace(/['"]/g, ''));
                const idSet = new Set(ids);
                return documents.filter(doc => idSet.has(doc.id));
            }
        }

        // Default: return all documents
        return documents;
    }

    private async simulateDelay(): Promise<void> {
        if (this.operationDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.operationDelay));
        }
    }

    private throwIfFailureInjected(): void {
        if (this.shouldFailNextOperation) {
            this.shouldFailNextOperation = false;
            throw new Error('Injected failure for testing');
        }
    }
}

interface FakeCollection {
    name: string;
    dimension: number;
    isHybrid: boolean;
    documents: VectorDocument[];
}
