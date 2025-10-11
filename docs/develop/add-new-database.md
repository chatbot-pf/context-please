# Adding a New Vector Database

This guide explains how to add support for a new vector database to the Claude Context project.

## Architecture Overview

The vector database layer uses an abstract base class pattern to minimize code duplication and make it easy to add new database implementations.

```
vectordb/
├── base/
│   └── base-vector-database.ts    # Abstract base class
├── milvus-vectordb.ts              # Milvus gRPC implementation
├── milvus-restful-vectordb.ts      # Milvus RESTful implementation
├── your-db-impl.ts                 # Your new database
├── factory.ts                       # Factory for creating instances
├── types.ts                         # Common interfaces
└── index.ts                         # Exports
```

## Step-by-Step Guide

### 1. Define Configuration Interface

Create your database-specific configuration by extending `BaseDatabaseConfig`:

```typescript
// packages/core/src/vectordb/your-db-impl.ts
import { BaseVectorDatabase, BaseDatabaseConfig } from './base/base-vector-database';

export interface YourDbConfig extends BaseDatabaseConfig {
    // Add database-specific config fields
    apiKey?: string;
    region?: string;
    customField?: string;
}
```

### 2. Implement Database Class

Extend `BaseVectorDatabase` and implement all required methods:

```typescript
import {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
} from './types';

export class YourDatabase extends BaseVectorDatabase<YourDbConfig> {
    private client: YourDbClient | null = null;

    constructor(config: YourDbConfig) {
        super(config);
    }

    // 1. Initialize database connection
    protected async initialize(): Promise<void> {
        // Connect to your database
        // Store client in this.client
    }

    // 2. Override ensureInitialized if needed
    protected override async ensureInitialized(): Promise<void> {
        await super.ensureInitialized();
        if (!this.client) {
            throw new Error('Client not initialized');
        }
    }

    // 3. Ensure collection is loaded
    protected async ensureLoaded(collectionName: string): Promise<void> {
        // Load collection to memory if needed
    }

    // 4. Implement VectorDatabase interface methods
    async createCollection(
        collectionName: string,
        dimension: number,
        description?: string
    ): Promise<void> {
        await this.ensureInitialized();
        // Create collection in your database
    }

    async createHybridCollection(
        collectionName: string,
        dimension: number,
        description?: string
    ): Promise<void> {
        await this.ensureInitialized();
        // Create hybrid collection (dense + sparse vectors)
        // If not supported, throw error or fallback to createCollection
    }

    async dropCollection(collectionName: string): Promise<void> {
        await this.ensureInitialized();
        // Drop collection
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        await this.ensureInitialized();
        // Check if collection exists
        return false;
    }

    async listCollections(): Promise<string[]> {
        await this.ensureInitialized();
        // Return list of collection names
        return [];
    }

    async insert(
        collectionName: string,
        documents: VectorDocument[]
    ): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        // Insert documents
    }

    async insertHybrid(
        collectionName: string,
        documents: VectorDocument[]
    ): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        // Insert documents with both dense and sparse vectors
    }

    async search(
        collectionName: string,
        queryVector: number[],
        options?: SearchOptions
    ): Promise<VectorSearchResult[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        // Perform vector search
        return [];
    }

    async hybridSearch(
        collectionName: string,
        searchRequests: HybridSearchRequest[],
        options?: HybridSearchOptions
    ): Promise<HybridSearchResult[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        // Perform hybrid search (dense + sparse)
        return [];
    }

    async delete(collectionName: string, ids: string[]): Promise<void> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        // Delete documents by IDs
    }

    async query(
        collectionName: string,
        filter: string,
        outputFields: string[],
        limit?: number
    ): Promise<Record<string, any>[]> {
        await this.ensureInitialized();
        await this.ensureLoaded(collectionName);
        // Query with filters
        return [];
    }

    async checkCollectionLimit(): Promise<boolean> {
        await this.ensureInitialized();
        // Check if can create more collections
        // Return true if OK, false if limit exceeded
        return true;
    }
}
```

### 3. Update Factory

Add your database to the factory:

```typescript
// packages/core/src/vectordb/factory.ts
export enum VectorDatabaseType {
    MILVUS_GRPC = 'milvus-grpc',
    MILVUS_RESTFUL = 'milvus-restful',
    YOUR_DB = 'your-db',  // Add this
}

export type VectorDatabaseConfig = {
    [VectorDatabaseType.MILVUS_GRPC]: MilvusConfig;
    [VectorDatabaseType.MILVUS_RESTFUL]: MilvusRestfulConfig;
    [VectorDatabaseType.YOUR_DB]: YourDbConfig;  // Add this
};

export class VectorDatabaseFactory {
    static create<T extends VectorDatabaseType>(
        type: T,
        config: VectorDatabaseConfig[T]
    ): VectorDatabase {
        switch (type) {
            case VectorDatabaseType.MILVUS_GRPC:
                return new MilvusVectorDatabase(config as MilvusConfig);

            case VectorDatabaseType.MILVUS_RESTFUL:
                return new MilvusRestfulVectorDatabase(config as MilvusRestfulConfig);

            // Add your database here
            case VectorDatabaseType.YOUR_DB:
                return new YourDatabase(config as YourDbConfig);

            default:
                throw new Error(`Unsupported database type: ${type}`);
        }
    }
}
```

### 4. Update Exports

Add exports to `index.ts`:

```typescript
// packages/core/src/vectordb/index.ts
export { YourDatabase, YourDbConfig } from './your-db-impl';
```

### 5. Usage Example

```typescript
import { VectorDatabaseFactory, VectorDatabaseType } from '@pleaseai/context-please-core';

// Create database instance using factory
const db = VectorDatabaseFactory.create(
    VectorDatabaseType.YOUR_DB,
    {
        address: 'your-db-endpoint',
        apiKey: 'your-api-key',
        region: 'us-west-1'
    }
);

// Use the database
await db.createCollection('my-collection', 1536);
await db.insert('my-collection', documents);
const results = await db.search('my-collection', queryVector, { topK: 10 });
```

## Best Practices

### 1. Error Handling

Always handle errors gracefully and provide meaningful error messages:

```typescript
async createCollection(collectionName: string, dimension: number): Promise<void> {
    try {
        await this.ensureInitialized();
        // Your implementation
    } catch (error) {
        console.error(`[YourDB] Failed to create collection '${collectionName}':`, error);
        throw error;
    }
}
```

### 2. Logging

Use consistent logging patterns:

```typescript
console.log(`[YourDB] 🔌 Connecting to database...`);
console.log(`[YourDB] ✅ Collection created successfully`);
console.log(`[YourDB] ⚠️  Warning message`);
console.error(`[YourDB] ❌ Error occurred`);
```

### 3. Async Initialization

The base class handles async initialization automatically. Always call `ensureInitialized()` at the start of public methods:

```typescript
async myMethod(): Promise<void> {
    await this.ensureInitialized();  // Wait for initialization
    // Your implementation
}
```

### 4. Type Safety

Use TypeScript generics for type-safe configuration:

```typescript
export class YourDatabase extends BaseVectorDatabase<YourDbConfig> {
    constructor(config: YourDbConfig) {
        super(config);
        // this.config is now typed as YourDbConfig
    }
}
```

### 5. Testing

Create unit tests for your implementation:

```typescript
// packages/core/src/vectordb/__tests__/your-db.test.ts
describe('YourDatabase', () => {
    it('should create collection', async () => {
        const db = new YourDatabase({ address: 'test' });
        await db.createCollection('test', 1536);
        expect(await db.hasCollection('test')).toBe(true);
    });
});
```

## Common Patterns

### Retry Logic

```typescript
private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
): Promise<T> {
    let lastError: Error = new Error('The operation did not execute.');
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            // Don't wait after the last attempt
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    throw lastError;
}
```

### Batch Processing

```typescript
async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
    const BATCH_SIZE = 100;
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        await this.insertBatch(collectionName, batch);
    }
}
```

### Connection Pooling

```typescript
private connectionPool: YourDbClient[] = [];

private async getClient(): Promise<YourDbClient> {
    if (this.connectionPool.length > 0) {
        return this.connectionPool.pop()!;
    }
    return this.createNewClient();
}
```

## Testing Your Implementation

1. **Unit Tests**: Test each method in isolation
2. **Integration Tests**: Test with real database
3. **Build Test**: Run `pnpm build:core`
4. **Example Test**: Use `examples/basic-usage` to verify

```bash
# Build
pnpm build:core

# Run example
cd examples/basic-usage
# Update index.ts to use your database
pnpm dev
```

## Troubleshooting

### Issue: "Client not initialized"
- Ensure `initialize()` properly sets `this.client`
- Call `await this.ensureInitialized()` in all public methods

### Issue: Type errors in factory
- Ensure your config extends `BaseDatabaseConfig`
- Add your config type to `VectorDatabaseConfig` type union

### Issue: Build fails
- Run `pnpm typecheck` to find type errors
- Ensure all abstract methods are implemented

## Need Help?

- Check existing implementations in `milvus-vectordb.ts` and `milvus-restful-vectordb.ts`
- Review the `VectorDatabase` interface in `types.ts`
- See `BaseVectorDatabase` documentation in `base/base-vector-database.ts`
