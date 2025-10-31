import type { FaissConfig } from './faiss-vectordb'
import type { MilvusRestfulConfig } from './milvus-restful-vectordb'
import type { MilvusConfig } from './milvus-vectordb'
import type { QdrantConfig } from './qdrant-vectordb'
import type { VectorDatabase } from './types'
import { MilvusRestfulVectorDatabase } from './milvus-restful-vectordb'
import { MilvusVectorDatabase } from './milvus-vectordb'
import { QdrantVectorDatabase } from './qdrant-vectordb'

// FAISS is optional - may not be available in all environments (e.g., CI without native bindings)
// Use lazy loading to avoid import errors
let FaissVectorDatabase: any
let faissAvailable: boolean | null = null // null = not checked yet
let faissCheckError: string | null = null

function checkFaissAvailability(): boolean {
  if (faissAvailable !== null) {
    return faissAvailable
  }

  try {
    FaissVectorDatabase = require('./faiss-vectordb').FaissVectorDatabase
    faissAvailable = true
    return true
  }
  catch (error: any) {
    const errorMsg = error.message || String(error)

    // Check if it's a FAISS bindings error (allow FAISS to be unavailable)
    if (errorMsg.includes('Could not locate the bindings file')
        || errorMsg.includes('faiss-node')) {
      faissAvailable = false
      faissCheckError = 'FAISS native bindings not available'
      console.warn('[VectorDatabaseFactory] FAISS native bindings not available. FAISS support disabled.')
      return false
    }

    // For other errors (e.g., missing file during tests), also mark as unavailable
    // but don't throw to allow tests to run
    faissAvailable = false
    faissCheckError = errorMsg
    console.warn(`[VectorDatabaseFactory] FAISS unavailable: ${errorMsg}`)
    return false
  }
}

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
        if (!checkFaissAvailability()) {
          throw new Error(
            `FAISS vector database is not available. ${faissCheckError || 'Native bindings could not be loaded'}. `
            + 'This usually happens in environments without C++ build tools. '
            + 'Please use another vector database type (MILVUS_GRPC, MILVUS_RESTFUL, or QDRANT_GRPC).',
          )
        }
        return new FaissVectorDatabase(config as FaissConfig)

      default:
        throw new Error(`Unsupported database type: ${type}`)
    }
  }

  /**
   * Get all supported database types
   * Note: FAISS may not be available if native bindings are missing
   */
  static getSupportedTypes(): VectorDatabaseType[] {
    const types = Object.values(VectorDatabaseType)
    if (!checkFaissAvailability()) {
      return types.filter(t => t !== VectorDatabaseType.FAISS_LOCAL)
    }
    return types
  }

  /**
   * Check if FAISS is available in the current environment
   */
  static isFaissAvailable(): boolean {
    return checkFaissAvailability()
  }
}
