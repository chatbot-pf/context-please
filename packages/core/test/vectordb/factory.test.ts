import { describe, it, expect } from 'vitest';
import {
    VectorDatabaseFactory,
    VectorDatabaseType,
    VectorDatabaseConfig,
} from '../../src/vectordb/factory';
import { MilvusVectorDatabase } from '../../src/vectordb/milvus-vectordb';
import { MilvusRestfulVectorDatabase } from '../../src/vectordb/milvus-restful-vectordb';
import { QdrantVectorDatabase } from '../../src/vectordb/qdrant-vectordb';
import { VectorDatabase } from '../../src/vectordb/types';

describe('VectorDatabaseFactory', () => {
    describe('create', () => {
        it('should create MilvusVectorDatabase with MILVUS_GRPC type', () => {
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_GRPC,
                {
                    address: 'localhost:19530',
                    username: 'test',
                    password: 'test',
                }
            );

            expect(db).toBeInstanceOf(MilvusVectorDatabase);
            expect(db).toHaveProperty('createCollection');
            expect(db).toHaveProperty('search');
        });

        it('should create MilvusRestfulVectorDatabase with MILVUS_RESTFUL type', () => {
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_RESTFUL,
                {
                    address: 'https://example.com',
                    token: 'test-token',
                }
            );

            expect(db).toBeInstanceOf(MilvusRestfulVectorDatabase);
            expect(db).toHaveProperty('createCollection');
            expect(db).toHaveProperty('search');
        });

        it('should create QdrantVectorDatabase with QDRANT_GRPC type', () => {
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.QDRANT_GRPC,
                {
                    address: 'localhost:6334',
                    apiKey: 'test-key',
                }
            );

            expect(db).toBeInstanceOf(QdrantVectorDatabase);
            expect(db).toHaveProperty('createCollection');
            expect(db).toHaveProperty('search');
            expect(db).toHaveProperty('hybridSearch');
        });

        it('should pass correct config to MilvusVectorDatabase', () => {
            const config = {
                address: 'localhost:19530',
                username: 'admin',
                password: 'secret',
                ssl: true,
            };

            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_GRPC,
                config
            );

            expect(db).toBeInstanceOf(MilvusVectorDatabase);
        });

        it('should pass correct config to MilvusRestfulVectorDatabase', () => {
            const config = {
                address: 'https://example.com',
                token: 'my-token',
                database: 'test-db',
            };

            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_RESTFUL,
                config
            );

            expect(db).toBeInstanceOf(MilvusRestfulVectorDatabase);
        });

        it('should throw error for unsupported database type', () => {
            expect(() => {
                VectorDatabaseFactory.create(
                    'unsupported-type' as VectorDatabaseType,
                    { address: 'test' } as any
                );
            }).toThrow('Unsupported database type: unsupported-type');
        });
    });

    describe('getSupportedTypes', () => {
        it('should return all supported database types', () => {
            const types = VectorDatabaseFactory.getSupportedTypes();

            expect(types).toContain(VectorDatabaseType.MILVUS_GRPC);
            expect(types).toContain(VectorDatabaseType.MILVUS_RESTFUL);
            expect(types).toContain(VectorDatabaseType.QDRANT_GRPC);
            expect(types.length).toBe(3);
        });

        it('should return array of VectorDatabaseType', () => {
            const types = VectorDatabaseFactory.getSupportedTypes();

            expect(Array.isArray(types)).toBe(true);
            types.forEach(type => {
                expect(typeof type).toBe('string');
            });
        });
    });

    describe('VectorDatabaseType enum', () => {
        it('should have MILVUS_GRPC type', () => {
            expect(VectorDatabaseType.MILVUS_GRPC).toBe('milvus-grpc');
        });

        it('should have MILVUS_RESTFUL type', () => {
            expect(VectorDatabaseType.MILVUS_RESTFUL).toBe('milvus-restful');
        });

        it('should have QDRANT_GRPC type', () => {
            expect(VectorDatabaseType.QDRANT_GRPC).toBe('qdrant-grpc');
        });
    });

    describe('type safety', () => {
        it('should enforce correct config type for MILVUS_GRPC', () => {
            // This test verifies TypeScript compilation
            // If it compiles, the type system is working correctly
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_GRPC,
                {
                    address: 'localhost:19530',
                    ssl: true, // MilvusConfig-specific field
                }
            );

            expect(db).toBeDefined();
        });

        it('should enforce correct config type for MILVUS_RESTFUL', () => {
            // This test verifies TypeScript compilation
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_RESTFUL,
                {
                    address: 'https://example.com',
                    database: 'test-db', // MilvusRestfulConfig-specific field
                }
            );

            expect(db).toBeDefined();
        });

        it('should enforce correct config type for QDRANT_GRPC', () => {
            // This test verifies TypeScript compilation
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.QDRANT_GRPC,
                {
                    address: 'localhost:6334',
                    apiKey: 'test-key', // QdrantConfig-specific field
                    timeout: 10000,
                }
            );

            expect(db).toBeDefined();
        });
    });

    describe('VectorDatabase interface compliance', () => {
        it('should return instances that implement VectorDatabase interface', () => {
            const grpcDb = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_GRPC,
                { address: 'localhost:19530' }
            );

            const restfulDb = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_RESTFUL,
                { address: 'https://example.com' }
            );

            const qdrantDb = VectorDatabaseFactory.create(
                VectorDatabaseType.QDRANT_GRPC,
                { address: 'localhost:6334' }
            );

            // Check that all instances have all VectorDatabase methods
            const requiredMethods = [
                'createCollection',
                'createHybridCollection',
                'dropCollection',
                'hasCollection',
                'listCollections',
                'insert',
                'insertHybrid',
                'search',
                'hybridSearch',
                'delete',
                'query',
                'checkCollectionLimit',
            ];

            requiredMethods.forEach(method => {
                expect(grpcDb).toHaveProperty(method);
                expect(typeof (grpcDb as any)[method]).toBe('function');

                expect(restfulDb).toHaveProperty(method);
                expect(typeof (restfulDb as any)[method]).toBe('function');

                expect(qdrantDb).toHaveProperty(method);
                expect(typeof (qdrantDb as any)[method]).toBe('function');
            });
        });
    });

    describe('factory pattern benefits', () => {
        it('should allow switching database types easily', () => {
            const configs = {
                grpc: { address: 'localhost:19530' },
                restful: { address: 'https://example.com' },
            };

            // Easy to switch between implementations
            let db: VectorDatabase;

            db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_GRPC,
                configs.grpc
            );
            expect(db).toBeInstanceOf(MilvusVectorDatabase);

            db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_RESTFUL,
                configs.restful
            );
            expect(db).toBeInstanceOf(MilvusRestfulVectorDatabase);
        });

        it('should enable dependency injection pattern', () => {
            function createVectorDb(
                type: VectorDatabaseType,
                config: VectorDatabaseConfig[typeof type]
            ): VectorDatabase {
                return VectorDatabaseFactory.create(type, config);
            }

            const db1 = createVectorDb(VectorDatabaseType.MILVUS_GRPC, {
                address: 'localhost:19530',
            });

            const db2 = createVectorDb(VectorDatabaseType.MILVUS_RESTFUL, {
                address: 'https://example.com',
            });

            expect(db1).toBeInstanceOf(MilvusVectorDatabase);
            expect(db2).toBeInstanceOf(MilvusRestfulVectorDatabase);
        });
    });

    describe('configuration variations', () => {
        it('should handle minimal config', () => {
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_GRPC,
                { address: 'localhost:19530' }
            );

            expect(db).toBeDefined();
        });

        it('should handle full config with all optional fields', () => {
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_GRPC,
                {
                    address: 'localhost:19530',
                    token: 'test-token',
                    username: 'admin',
                    password: 'secret',
                    ssl: true,
                }
            );

            expect(db).toBeDefined();
        });

        it('should handle RESTful config with database field', () => {
            const db = VectorDatabaseFactory.create(
                VectorDatabaseType.MILVUS_RESTFUL,
                {
                    address: 'https://example.com',
                    token: 'test-token',
                    database: 'my-database',
                }
            );

            expect(db).toBeDefined();
        });
    });
});
