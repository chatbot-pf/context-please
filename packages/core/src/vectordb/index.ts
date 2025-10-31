// Base class exports
export { BaseDatabaseConfig, BaseVectorDatabase } from './base/base-vector-database'

// Factory exports
export { VectorDatabaseFactory, VectorDatabaseType } from './factory'

export type { VectorDatabaseConfig } from './factory'
// Implementation class exports
export type { FaissConfig } from './faiss-vectordb'
export { MilvusRestfulConfig, MilvusRestfulVectorDatabase } from './milvus-restful-vectordb'
export { MilvusConfig, MilvusVectorDatabase } from './milvus-vectordb'

export { QdrantConfig, QdrantVectorDatabase } from './qdrant-vectordb'

// FAISS is conditionally exported (may not be available without native bindings)
// Use VectorDatabaseFactory to check availability: VectorDatabaseFactory.isFaissAvailable()
try {
  const { FaissVectorDatabase: FaissDB } = require('./faiss-vectordb')
  // Re-export if successfully loaded
  module.exports.FaissVectorDatabase = FaissDB
}
catch (error: any) {
  const errorMsg = error.message || String(error)
  // Allow FAISS to be unavailable (bindings or module not found)
  if (errorMsg.includes('Could not locate the bindings file')
      || errorMsg.includes('faiss-node')
      || errorMsg.includes('Cannot find module')) {
    // FAISS not available, don't export it
    console.warn('[vectordb/index] FAISS not available - FaissVectorDatabase not exported')
  }
  else {
    throw error // Re-throw unexpected errors
  }
}
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
