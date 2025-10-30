// Base class exports
export { BaseDatabaseConfig, BaseVectorDatabase } from './base/base-vector-database'

// Factory exports
export { VectorDatabaseFactory, VectorDatabaseType } from './factory'

export type { VectorDatabaseConfig } from './factory'
// Implementation class exports
export { FaissConfig, FaissVectorDatabase } from './faiss-vectordb'
export { MilvusRestfulConfig, MilvusRestfulVectorDatabase } from './milvus-restful-vectordb'
export { MilvusConfig, MilvusVectorDatabase } from './milvus-vectordb'

export { QdrantConfig, QdrantVectorDatabase } from './qdrant-vectordb'
// Sparse vector exports
export { BM25Config, SimpleBM25 } from './sparse/simple-bm25'
export { SparseVectorGenerator } from './sparse/sparse-vector-generator'

export { SparseVector, SparseVectorConfig } from './sparse/types'
// Re-export types and interfaces
export {
  COLLECTION_LIMIT_MESSAGE,
  HybridSearchOptions,
  HybridSearchRequest,
  HybridSearchResult,
  RerankStrategy,
  SearchOptions,
  VectorDatabase,
  VectorDocument,
  VectorSearchResult,
} from './types'

// Utility exports
export {
  Cluster,
  ClusterManager,
  CreateFreeClusterRequest,
  CreateFreeClusterResponse,
  CreateFreeClusterWithDetailsResponse,
  DescribeClusterResponse,
  Project,
  ZillizConfig,
} from './zilliz-utils'
