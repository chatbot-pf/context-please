// Re-export types and interfaces
export {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    VectorDatabase,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
    RerankStrategy,
    COLLECTION_LIMIT_MESSAGE
} from './types';

// Base class exports
export { BaseVectorDatabase, BaseDatabaseConfig } from './base/base-vector-database';

// Implementation class exports
export { MilvusRestfulVectorDatabase, MilvusRestfulConfig } from './milvus-restful-vectordb';
export { MilvusVectorDatabase, MilvusConfig } from './milvus-vectordb';
export { QdrantVectorDatabase, QdrantConfig } from './qdrant-vectordb';

// Sparse vector exports
export { SimpleBM25, BM25Config } from './sparse/simple-bm25';
export { SparseVectorGenerator } from './sparse/sparse-vector-generator';
export { SparseVector, SparseVectorConfig } from './sparse/types';

// Factory exports
export { VectorDatabaseFactory, VectorDatabaseType } from './factory';
export type { VectorDatabaseConfig } from './factory';

// Utility exports
export {
    ClusterManager,
    ZillizConfig,
    Project,
    Cluster,
    CreateFreeClusterRequest,
    CreateFreeClusterResponse,
    CreateFreeClusterWithDetailsResponse,
    DescribeClusterResponse
} from './zilliz-utils'; 