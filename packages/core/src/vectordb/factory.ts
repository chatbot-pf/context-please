import { VectorDatabase } from './types';
import { MilvusVectorDatabase, MilvusConfig } from './milvus-vectordb';
import { MilvusRestfulVectorDatabase, MilvusRestfulConfig } from './milvus-restful-vectordb';

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
}

/**
 * Configuration type for each database type
 */
export type VectorDatabaseConfig = {
    [VectorDatabaseType.MILVUS_GRPC]: MilvusConfig;
    [VectorDatabaseType.MILVUS_RESTFUL]: MilvusRestfulConfig;
};

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
     * ```
     */
    static create<T extends VectorDatabaseType>(
        type: T,
        config: VectorDatabaseConfig[T]
    ): VectorDatabase {
        switch (type) {
            case VectorDatabaseType.MILVUS_GRPC:
                return new MilvusVectorDatabase(config as MilvusConfig);

            case VectorDatabaseType.MILVUS_RESTFUL:
                return new MilvusRestfulVectorDatabase(config as MilvusRestfulConfig);

            default:
                throw new Error(`Unsupported database type: ${type}`);
        }
    }

    /**
     * Get all supported database types
     */
    static getSupportedTypes(): VectorDatabaseType[] {
        return Object.values(VectorDatabaseType);
    }
}
