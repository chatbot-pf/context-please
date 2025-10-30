import type { FaissConfig } from './faiss-vectordb'
import type { MilvusRestfulConfig } from './milvus-restful-vectordb'
import type { MilvusConfig } from './milvus-vectordb'
import type { QdrantConfig } from './qdrant-vectordb'
import type { VectorDatabase } from './types'
import { FaissVectorDatabase } from './faiss-vectordb'
import { MilvusRestfulVectorDatabase } from './milvus-restful-vectordb'
import { MilvusVectorDatabase } from './milvus-vectordb'
import { QdrantVectorDatabase } from './qdrant-vectordb'

/**
 * Supported vector database types
 */
export enum VectorDatabaseType {
  /**
   * Milvus with gRPC protocol
   * Use for Node.js environments with full gRPC support
   */
  MILVUS_GRPC = 'milvus-grpc',

  /**
   * Milvus with RESTful API
   * Use for browser/VSCode extension environments where gRPC is not available
   */
  MILVUS_RESTFUL = 'milvus-restful',

  /**
   * Qdrant with gRPC protocol
   * Use for Node.js environments with native hybrid search support
   * Supports both self-hosted and Qdrant Cloud
   */
  QDRANT_GRPC = 'qdrant-grpc',

  /**
   * FAISS local file-based vector database
   * Use for local-only deployments with zero configuration
   * Ideal for development and small-to-medium codebases
   */
  FAISS_LOCAL = 'faiss-local',
}

/**
 * Configuration type for each database type
 */
export interface VectorDatabaseConfig {
  [VectorDatabaseType.MILVUS_GRPC]: MilvusConfig
  [VectorDatabaseType.MILVUS_RESTFUL]: MilvusRestfulConfig
  [VectorDatabaseType.QDRANT_GRPC]: QdrantConfig
  [VectorDatabaseType.FAISS_LOCAL]: FaissConfig
}

/**
 * Factory class for creating vector database instances
 *
 * Usage:
 * ```typescript
 * const db = VectorDatabaseFactory.create(
 *     VectorDatabaseType.MILVUS_GRPC,
 *     { address: 'localhost:19530', token: 'xxx' }
 * );
 * ```
 */
export class VectorDatabaseFactory {
  /**
   * Create a vector database instance
   *
   * @param type - The type of vector database to create
   * @param config - Configuration for the database
   * @returns A VectorDatabase instance
   *
   * @example
   * ```typescript
   * // Create Milvus gRPC database
   * const db = VectorDatabaseFactory.create(
   *     VectorDatabaseType.MILVUS_GRPC,
   *     { address: 'localhost:19530' }
   * );
   *
   * // Create Milvus RESTful database
   * const restDb = VectorDatabaseFactory.create(
   *     VectorDatabaseType.MILVUS_RESTFUL,
   *     { address: 'https://your-cluster.com', token: 'xxx' }
   * );
   *
   * // Create Qdrant gRPC database
   * const qdrantDb = VectorDatabaseFactory.create(
   *     VectorDatabaseType.QDRANT_GRPC,
   *     { address: 'localhost:6334', apiKey: 'xxx' }
   * );
   *
   * // Create FAISS local database
   * const faissDb = VectorDatabaseFactory.create(
   *     VectorDatabaseType.FAISS_LOCAL,
   *     { storageDir: '~/.context/faiss-indexes' }
   * );
   * ```
   */
  static create<T extends VectorDatabaseType>(
    type: T,
    config: VectorDatabaseConfig[T],
  ): VectorDatabase {
    switch (type) {
      case VectorDatabaseType.MILVUS_GRPC:
        return new MilvusVectorDatabase(config as MilvusConfig)

      case VectorDatabaseType.MILVUS_RESTFUL:
        return new MilvusRestfulVectorDatabase(config as MilvusRestfulConfig)

      case VectorDatabaseType.QDRANT_GRPC:
        return new QdrantVectorDatabase(config as QdrantConfig)

      case VectorDatabaseType.FAISS_LOCAL:
        return new FaissVectorDatabase(config as FaissConfig)

      default:
        throw new Error(`Unsupported database type: ${type}`)
    }
  }

  /**
   * Get all supported database types
   */
  static getSupportedTypes(): VectorDatabaseType[] {
    return Object.values(VectorDatabaseType)
  }
}
