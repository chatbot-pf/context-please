import {
    QdrantClient,
    Modifier,
    PointStruct,
    PointId,
    NamedVectors,
    Vector,
    Vectors,
    Value
} from '@qdrant/js-client-grpc';
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

export interface QdrantConfig extends BaseDatabaseConfig {
    /**
     * API key for Qdrant Cloud
     * Optional for self-hosted instances
     */
    apiKey?: string;

    /**
     * Connection timeout in milliseconds
     * @default 10000
     */
    timeout?: number;

    /**
     * BM25 configuration for sparse vector generation
     */
    bm25Config?: BM25Config;
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
    private client: QdrantClient | null = null;
    private bm25Generator: SimpleBM25;

    // Named vector configurations
    private readonly DENSE_VECTOR_NAME = 'dense';
    private readonly SPARSE_VECTOR_NAME = 'sparse';

    constructor(config: QdrantConfig) {
        super(config);
        this.bm25Generator = new SimpleBM25(config.bm25Config);
    }

    /**
     * Initialize Qdrant client connection
     */
    protected async initialize(): Promise<void> {
        const resolvedAddress = await this.resolveAddress();
        await this.initializeClient(resolvedAddress);
    }

    /**
     * Create Qdrant client instance
     */
    private async initializeClient(address: string): Promise<void> {
        console.log('[QdrantDB] 🔌 Connecting to Qdrant at:', address);

        // Parse address to extract host and port
        const url = new URL(address.startsWith('http') ? address : `http://${address}`);
        const host = url.hostname;
        const port = url.port ? parseInt(url.port) : 6334;

        this.client = new QdrantClient({
            host,
            port,
            apiKey: this.config.apiKey,
            timeout: this.config.timeout || 10000,
        });

        console.log('[QdrantDB] ✅ Connected to Qdrant successfully');
    }

    /**
     * Resolve address from config
     * Unlike Milvus, Qdrant doesn't have auto-provisioning
     */
    protected async resolveAddress(): Promise<string> {
        if (!this.config.address) {
            throw new Error('Qdrant address is required. Set QDRANT_URL environment variable.');
        }
        return this.config.address;
    }

    /**
     * Override to add client null check
     */
    protected override async ensureInitialized(): Promise<void> {
        await super.ensureInitialized();
        if (!this.client) {
            throw new Error('QdrantClient is not initialized');
        }
    }

    /**
     * Qdrant doesn't require explicit collection loading
     * Collections are loaded on-demand automatically
     */
    protected async ensureLoaded(collectionName: string): Promise<void> {
        // No-op for Qdrant - collections are loaded automatically
        return Promise.resolve();
    }

    /**
     * Create collection with dense vectors only
     */
    async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.ensureInitialized();

        console.log('[QdrantDB] 🔧 Creating collection:', collectionName);
        console.log('[QdrantDB] 📏 Vector dimension:', dimension);

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
        });

        console.log('[QdrantDB] ✅ Collection created successfully');
    }

    /**
     * Create collection with hybrid search support (dense + sparse vectors)
     */
    async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        await this.ensureInitialized();

        console.log('[QdrantDB] 🔧 Creating hybrid collection:', collectionName);
        console.log('[QdrantDB] 📏 Dense vector dimension:', dimension);

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
        });

        console.log('[QdrantDB] ✅ Hybrid collection created successfully');
    }

    /**
     * Drop collection
     */
    async dropCollection(collectionName: string): Promise<void> {
        await this.ensureInitialized();

        console.log('[QdrantDB] 🗑️  Dropping collection:', collectionName);
        await this.client!.api('collections').delete({
            collectionName,
        });
        console.log('[QdrantDB] ✅ Collection dropped successfully');
    }

    /**
     * Check if collection exists
     */
    async hasCollection(collectionName: string): Promise<boolean> {
        await this.ensureInitialized();

        try {
            const response = await this.client!.api('collections').get({
                collectionName,
            });
            return response.result !== undefined;
        } catch (error: any) {
            if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
                return false;
            }
            throw error;
        }
    }

    /**
     * List all collections
     */
    async listCollections(): Promise<string[]> {
        await this.ensureInitialized();

        const response = await this.client!.api('collections').list({});
        return response.collections.map((c: { name: string }) => c.name);
    }

    /**
     * Insert documents with dense vectors only
     */
    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        console.log('[QdrantDB] 📝 Inserting', documents.length, 'documents into:', collectionName);

        const points = documents.map(doc => ({
            id: {
                pointIdOptions: {
                    case: 'uuid' as const,
                    value: doc.id,
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
        }));

        await this.client!.api('points').upsert({
            collectionName,
            wait: true,
            points,
        });

        console.log('[QdrantDB] ✅ Documents inserted successfully');
    }

    /**
     * Insert documents with hybrid vectors (dense + sparse)
     */
    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        console.log('[QdrantDB] 📝 Inserting', documents.length, 'hybrid documents into:', collectionName);

        // Ensure BM25 is trained before insertion
        if (!this.bm25Generator.isTrained()) {
            // The BM25 model must be trained on the full corpus before insertion for accurate sparse vectors.
            // Training on a single batch leads to incorrect IDF scores and poor search quality.
            throw new Error('BM25 generator is not trained. The caller must explicitly train it via `getBM25Generator().learn(corpus)` before calling `insertHybrid`.');
        }

        // Generate sparse vectors for all documents
        const sparseVectors = documents.map(doc =>
            this.bm25Generator.generate(doc.content)
        );

        const points = documents.map((doc, index) => ({
            id: {
                pointIdOptions: {
                    case: 'uuid' as const,
                    value: doc.id,
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
        }));

        await this.client!.api('points').upsert({
            collectionName,
            wait: true,
            points,
        });

        console.log('[QdrantDB] ✅ Hybrid documents inserted successfully');
    }

    /**
     * Search with dense vectors only
     */
    async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        console.log('[QdrantDB] 🔍 Searching in collection:', collectionName);

        const searchParams: any = {
            collectionName,
            vector: {
                name: this.DENSE_VECTOR_NAME,
                data: queryVector,
            },
            limit: BigInt(options?.topK || 10),
            withPayload: { enable: true },
        };

        // Apply filter if provided
        if (options?.filterExpr && options.filterExpr.trim().length > 0) {
            searchParams.filter = this.parseFilterExpression(options.filterExpr);
        }

        const results = await this.client!.api('points').search(searchParams);

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
        }));
    }

    /**
     * Hybrid search with dense + sparse vectors using RRF fusion
     */
    async hybridSearch(
        collectionName: string,
        searchRequests: HybridSearchRequest[],
        options?: HybridSearchOptions
    ): Promise<HybridSearchResult[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        console.log('[QdrantDB] 🔍 Performing hybrid search in collection:', collectionName);

        // Extract dense vector and query text from search requests by inspecting data types
        const denseQueryReq = searchRequests.find(req => Array.isArray(req.data));
        const textQueryReq = searchRequests.find(req => typeof req.data === 'string');

        if (!denseQueryReq || !textQueryReq) {
            throw new Error('Hybrid search requires one dense vector request (number[] data) and one text request (string data).');
        }

        const denseQuery = denseQueryReq.data as number[];
        const textQuery = textQueryReq.data as string;

        // Generate sparse vector using BM25
        if (!this.bm25Generator.isTrained()) {
            console.warn('[QdrantDB] ⚠️  BM25 generator not trained. Hybrid search may have reduced quality.');
        }

        const sparseQuery = this.bm25Generator.isTrained()
            ? this.bm25Generator.generate(textQuery)
            : { indices: [], values: [] };

        console.log('[QdrantDB] 🔍 Dense query vector length:', denseQuery.length);
        console.log('[QdrantDB] 🔍 Sparse query terms:', sparseQuery.indices.length);

        // Qdrant query API with prefetch for hybrid search
        const queryParams: any = {
            collectionName,
            prefetch: [
                {
                    query: {
                        query: {
                            case: 'sparseIndices' as const,
                            value: {
                                indices: {
                                    data: sparseQuery.indices.map(i => BigInt(i)),
                                },
                                values: {
                                    data: sparseQuery.values,
                                },
                            },
                        },
                    },
                    using: this.SPARSE_VECTOR_NAME,
                    limit: BigInt(textQueryReq.limit || 20),
                },
                {
                    query: {
                        query: {
                            case: 'nearest' as const,
                            value: {
                                vector: {
                                    data: denseQuery,
                                },
                            },
                        },
                    },
                    using: this.DENSE_VECTOR_NAME,
                    limit: BigInt(denseQueryReq.limit || 20),
                },
            ],
            query: {
                query: {
                    case: 'fusion' as const,
                    value: 1, // RRF = 1
                },
            },
            limit: BigInt(options?.limit || 10),
            withPayload: { enable: true },
        };

        // Apply filter if provided
        if (options?.filterExpr && options.filterExpr.trim().length > 0) {
            queryParams.filter = this.parseFilterExpression(options.filterExpr);
        }

        const results = await this.client!.api('points').query(queryParams);

        console.log('[QdrantDB] ✅ Found', results.result.length, 'results from hybrid search');

        return results.result.map((result: any) => ({
            document: {
                id: result.id?.str || result.id?.num?.toString() || '',
                content: result.payload?.content?.stringValue || '',
                vector: [],
                relativePath: result.payload?.relativePath?.stringValue || '',
                startLine: Number(result.payload?.startLine?.integerValue || 0),
                endLine: Number(result.payload?.endLine?.integerValue || 0),
                fileExtension: result.payload?.fileExtension?.stringValue || '',
                metadata: JSON.parse(result.payload?.metadata?.stringValue || '{}'),
            },
            score: result.score,
        }));
    }

    /**
     * Delete documents by IDs
     */
    async delete(collectionName: string, ids: string[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);

        console.log('[QdrantDB] 🗑️  Deleting', ids.length, 'documents from:', collectionName);

        await this.client!.api('points').delete({
            collectionName,
            wait: true,
            points: {
                pointsSelectorOneOf: {
                    case: 'points' as const,
                    value: {
                        ids: ids.map(id => ({
                            pointIdOptions: {
                                case: 'uuid' as const,
                                value: id,
                            },
                        })),
                    },
                },
            },
        });

        console.log('[QdrantDB] ✅ Documents deleted successfully');
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

        console.log('[QdrantDB] 📋 Querying collection:', collectionName);

        const scrollParams: any = {
            collectionName,
            limit: limit || 100,
            withPayload: { enable: true },
            withVectors: { enable: false },
        };

        // Parse filter expression if provided
        if (filter && filter.trim().length > 0) {
            scrollParams.filter = this.parseFilterExpression(filter);
        }

        const results = await this.client!.api('points').scroll(scrollParams);

        return results.result.map((point: any) => ({
            id: point.id?.str || point.id?.num?.toString() || '',
            content: point.payload?.content?.stringValue,
            relativePath: point.payload?.relativePath?.stringValue,
            startLine: Number(point.payload?.startLine?.integerValue || 0),
            endLine: Number(point.payload?.endLine?.integerValue || 0),
            fileExtension: point.payload?.fileExtension?.stringValue,
            metadata: JSON.parse(point.payload?.metadata?.stringValue || '{}'),
        }));
    }

    /**
     * Check collection limit
     * Qdrant doesn't have hard collection limits like Zilliz Cloud
     */
    async checkCollectionLimit(): Promise<boolean> {
        // Qdrant (self-hosted or cloud) doesn't have hard collection limits
        return Promise.resolve(true);
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
            const match = expr.match(/(\w+)\s+in\s+\[(.*)\]/);
            if (match) {
                const field = match[1];
                const values = match[2]
                    .split(',')
                    .map(v => v.trim().replace(/['"]/g, ''));

                // For "IN" operator, use a "must" clause with "any" match for better performance
                return {
                    must: [{
                        field: {
                            key: field,
                            match: {
                                matchValue: {
                                    case: 'any' as const,
                                    value: {
                                        values: values.map(value => ({ kind: { case: 'stringValue' as const, value } }))
                                    }
                                }
                            }
                        }
                    }]
                };
            }
        } else if (expr.includes('==')) {
            // Handle "field == value" pattern
            const match = expr.match(/(\w+)\s*==\s*['"]?([^'"]+)['"]?/);
            if (match) {
                const field = match[1];
                const value = match[2].trim();

                return {
                    must: [
                        {
                            field: {
                                key: field,
                                match: {
                                    matchValue: {
                                        case: 'keyword' as const,
                                        value: value
                                    }
                                }
                            }
                        },
                    ],
                };
            }
        }

        // If parsing fails, return undefined (no filtering)
        console.warn('[QdrantDB] ⚠️  Could not parse filter expression:', expr);
        return undefined;
    }

    /**
     * Get BM25 generator (for testing/debugging)
     */
    public getBM25Generator(): SimpleBM25 {
        return this.bm25Generator;
    }
}
