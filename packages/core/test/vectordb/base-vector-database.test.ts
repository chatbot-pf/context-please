import type { BaseDatabaseConfig } from '../../src/vectordb/base/base-vector-database'
import type {
  HybridSearchOptions,
  HybridSearchRequest,
  HybridSearchResult,
  SearchOptions,
  VectorDocument,
  VectorSearchResult,
} from '../../src/vectordb/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { BaseVectorDatabase } from '../../src/vectordb/base/base-vector-database'

// Test configuration interface
interface TestDbConfig extends BaseDatabaseConfig {
  testField?: string
}

// Concrete implementation for testing
class TestVectorDatabase extends BaseVectorDatabase<TestDbConfig> {
  private mockClient: { connected: boolean } | null = null
  private mockCollections: Set<string> = new Set()
  public initializeCalled = false
  public ensureLoadedCalled = false

  protected async initialize(): Promise<void> {
    this.initializeCalled = true
    // Simulate async initialization
    await new Promise((resolve) => setTimeout(resolve, 10))
    this.mockClient = { connected: true }
  }

  protected async ensureLoaded(collectionName: string): Promise<void> {
    this.ensureLoadedCalled = true
    if (!this.mockCollections.has(collectionName)) {
      throw new Error(`Collection '${collectionName}' not found`)
    }
  }

  async createCollection(name: string, dimension: number, description?: string): Promise<void> {
    await this.ensureInitialized()
    this.mockCollections.add(name)
  }

  async createHybridCollection(name: string, dimension: number, description?: string): Promise<void> {
    await this.ensureInitialized()
    this.mockCollections.add(name)
  }

  async dropCollection(name: string): Promise<void> {
    await this.ensureInitialized()
    this.mockCollections.delete(name)
  }

  async hasCollection(name: string): Promise<boolean> {
    await this.ensureInitialized()
    return this.mockCollections.has(name)
  }

  async listCollections(): Promise<string[]> {
    await this.ensureInitialized()
    return Array.from(this.mockCollections)
  }

  async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)
  }

  async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)
  }

  async search(
    collectionName: string,
    queryVector: number[],
    options?: SearchOptions,
  ): Promise<VectorSearchResult[]> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)
    return []
  }

  async hybridSearch(
    collectionName: string,
    searchRequests: HybridSearchRequest[],
    options?: HybridSearchOptions,
  ): Promise<HybridSearchResult[]> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)
    return []
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)
  }

  async query(
    collectionName: string,
    filter: string,
    outputFields: string[],
    limit?: number,
  ): Promise<Record<string, any>[]> {
    await this.ensureInitialized()
    await this.ensureLoaded(collectionName)
    return []
  }

  async checkCollectionLimit(): Promise<boolean> {
    await this.ensureInitialized()
    return true
  }

  // Expose protected properties for testing
  getConfig(): TestDbConfig {
    return this.config
  }

  isClientConnected(): boolean {
    return this.mockClient?.connected ?? false
  }
}

describe('baseVectorDatabase', () => {
  let db: TestVectorDatabase

  beforeEach(() => {
    db = new TestVectorDatabase({
      address: 'test-address',
      token: 'test-token',
      testField: 'test-value',
    })
  })

  describe('initialization', () => {
    it('should initialize asynchronously on construction', async () => {
      // Client should not be connected immediately
      expect(db.isClientConnected()).toBe(false)

      // Wait for initialization by calling a method
      await db.hasCollection('test')

      // After initialization, client should be connected
      expect(db.isClientConnected()).toBe(true)
    })

    it('should store config correctly', () => {
      const config = db.getConfig()

      expect(config.address).toBe('test-address')
      expect(config.token).toBe('test-token')
      expect(config.testField).toBe('test-value')
    })

    it('should wait for initialization before operations', async () => {
      await db.createCollection('test', 128)

      // Client should be connected after operation
      expect(db.isClientConnected()).toBe(true)
    })
  })

  describe('collection operations', () => {
    it('should create collection', async () => {
      await db.createCollection('test-collection', 128)

      const exists = await db.hasCollection('test-collection')
      expect(exists).toBe(true)
    })

    it('should create hybrid collection', async () => {
      await db.createHybridCollection('hybrid-collection', 128)

      const exists = await db.hasCollection('hybrid-collection')
      expect(exists).toBe(true)
    })

    it('should drop collection', async () => {
      await db.createCollection('temp-collection', 128)
      await db.dropCollection('temp-collection')

      const exists = await db.hasCollection('temp-collection')
      expect(exists).toBe(false)
    })

    it('should list collections', async () => {
      await db.createCollection('collection1', 128)
      await db.createCollection('collection2', 128)

      const collections = await db.listCollections()

      expect(collections).toHaveLength(2)
      expect(collections).toContain('collection1')
      expect(collections).toContain('collection2')
    })

    it('should check collection existence', async () => {
      await db.createCollection('existing', 128)

      expect(await db.hasCollection('existing')).toBe(true)
      expect(await db.hasCollection('non-existing')).toBe(false)
    })
  })

  describe('ensureLoaded', () => {
    it('should call ensureLoaded before insert', async () => {
      await db.createCollection('test', 128)

      db.ensureLoadedCalled = false
      await db.insert('test', [])

      expect(db.ensureLoadedCalled).toBe(true)
    })

    it('should throw error if collection not found', async () => {
      await expect(
        db.insert('non-existing', []),
      ).rejects.toThrow('Collection \'non-existing\' not found')
    })

    it('should call ensureLoaded before search', async () => {
      await db.createCollection('test', 128)

      db.ensureLoadedCalled = false
      await db.search('test', [0.1, 0.2, 0.3])

      expect(db.ensureLoadedCalled).toBe(true)
    })

    it('should call ensureLoaded before delete', async () => {
      await db.createCollection('test', 128)

      db.ensureLoadedCalled = false
      await db.delete('test', ['id1', 'id2'])

      expect(db.ensureLoadedCalled).toBe(true)
    })
  })

  describe('cRUD operations', () => {
    beforeEach(async () => {
      await db.createCollection('test-collection', 128)
    })

    it('should insert documents', async () => {
      const documents: VectorDocument[] = [
        {
          id: '1',
          vector: [0.1, 0.2],
          content: 'test',
          relativePath: 'test.ts',
          startLine: 1,
          endLine: 10,
          fileExtension: '.ts',
          metadata: {},
        },
      ]

      await expect(
        db.insert('test-collection', documents),
      ).resolves.not.toThrow()
    })

    it('should insert hybrid documents', async () => {
      const documents: VectorDocument[] = [
        {
          id: '1',
          vector: [0.1, 0.2],
          content: 'test',
          relativePath: 'test.ts',
          startLine: 1,
          endLine: 10,
          fileExtension: '.ts',
          metadata: {},
        },
      ]

      await expect(
        db.insertHybrid('test-collection', documents),
      ).resolves.not.toThrow()
    })

    it('should search vectors', async () => {
      const results = await db.search('test-collection', [0.1, 0.2, 0.3])

      expect(Array.isArray(results)).toBe(true)
    })

    it('should perform hybrid search', async () => {
      const searchRequests: HybridSearchRequest[] = [
        {
          data: [0.1, 0.2, 0.3],
          anns_field: 'vector',
          param: { nprobe: 10 },
          limit: 10,
        },
      ]

      const results = await db.hybridSearch('test-collection', searchRequests)

      expect(Array.isArray(results)).toBe(true)
    })

    it('should delete documents', async () => {
      await expect(
        db.delete('test-collection', ['id1', 'id2']),
      ).resolves.not.toThrow()
    })

    it('should query documents', async () => {
      const results = await db.query('test-collection', 'id in ["1"]', ['content'])

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('checkCollectionLimit', () => {
    it('should check collection limit', async () => {
      const canCreate = await db.checkCollectionLimit()

      expect(typeof canCreate).toBe('boolean')
      expect(canCreate).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should propagate initialization errors to operations', async () => {
      class FailingDatabase extends BaseVectorDatabase {
        protected async initialize(): Promise<void> {
          throw new Error('Initialization failed')
        }

        protected async ensureLoaded(): Promise<void> {}
        async createCollection(): Promise<void> {
          await this.ensureInitialized()
        }

        async createHybridCollection(): Promise<void> {
          await this.ensureInitialized()
        }

        async dropCollection(): Promise<void> {
          await this.ensureInitialized()
        }

        async hasCollection(): Promise<boolean> {
          await this.ensureInitialized()
          return false
        }

        async listCollections(): Promise<string[]> {
          await this.ensureInitialized()
          return []
        }

        async insert(): Promise<void> {
          await this.ensureInitialized()
        }

        async insertHybrid(): Promise<void> {
          await this.ensureInitialized()
        }

        async search(): Promise<VectorSearchResult[]> {
          await this.ensureInitialized()
          return []
        }

        async hybridSearch(): Promise<HybridSearchResult[]> {
          await this.ensureInitialized()
          return []
        }

        async delete(): Promise<void> {
          await this.ensureInitialized()
        }

        async query(): Promise<Record<string, any>[]> {
          await this.ensureInitialized()
          return []
        }

        async checkCollectionLimit(): Promise<boolean> {
          await this.ensureInitialized()
          return true
        }
      }

      const failingDb = new FailingDatabase({ address: 'test' })

      // Initialization error should propagate to operations
      await expect(
        failingDb.createCollection('test', 128),
      ).rejects.toThrow('Initialization failed')
    })
  })
})
