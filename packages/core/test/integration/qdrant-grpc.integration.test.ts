import type { VectorDocument } from '../../src/vectordb/types.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QdrantVectorDatabase } from '../../src/vectordb/qdrant-vectordb.js'

/**
 * Integration tests for Qdrant gRPC client functionality
 *
 * Tests the core gRPC operations:
 * 1. Collection operations (list, has, create, drop)
 * 2. Document insertion with protobuf payload structure
 * 3. Query with metadata extraction (including codebasePath)
 * 4. Protobuf value unwrapping (kind.case pattern)
 */
describe('qdrant gRPC Client Integration', () => {
  let qdrantDb: QdrantVectorDatabase
  const testCollectionName = 'test_grpc_integration'

  // Use real Qdrant if available, otherwise skip tests
  const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6334' // gRPC port
  const skipQdrant = !process.env.QDRANT_URL && !process.env.CI

  beforeEach(async () => {
    if (skipQdrant) {
      console.log('⏭️  Skipping Qdrant gRPC tests (QDRANT_URL not set)')
      return
    }

    // Create Qdrant connection with gRPC port
    qdrantDb = new QdrantVectorDatabase({
      address: qdrantUrl,
    })

    // Clean up any existing test collection
    try {
      const hasCollection = await qdrantDb.hasCollection(testCollectionName)
      if (hasCollection) {
        await qdrantDb.dropCollection(testCollectionName)
      }
    }
    catch (e) {
      // Ignore errors during cleanup
    }
  })

  afterEach(async () => {
    if (skipQdrant)
      return

    // Clean up test collection
    try {
      const hasCollection = await qdrantDb.hasCollection(testCollectionName)
      if (hasCollection) {
        await qdrantDb.dropCollection(testCollectionName)
      }
    }
    catch (e) {
      // Ignore cleanup errors
    }
  })

  describe('collection Operations', () => {
    it('should list collections using gRPC API', async () => {
      if (skipQdrant)
        return

      const collections = await qdrantDb.listCollections()
      expect(Array.isArray(collections)).toBe(true)
    })

    it('should check if collection exists using gRPC API', async () => {
      if (skipQdrant)
        return

      const exists = await qdrantDb.hasCollection(testCollectionName)
      expect(exists).toBe(false)
    })

    it('should create and drop collection using gRPC API', async () => {
      if (skipQdrant)
        return

      // Create collection
      await qdrantDb.createHybridCollection(testCollectionName, 1536)

      // Verify it exists
      const exists = await qdrantDb.hasCollection(testCollectionName)
      expect(exists).toBe(true)

      // Verify it appears in list
      const collections = await qdrantDb.listCollections()
      expect(collections).toContain(testCollectionName)

      // Drop collection
      await qdrantDb.dropCollection(testCollectionName)

      // Verify it's gone
      const existsAfterDrop = await qdrantDb.hasCollection(testCollectionName)
      expect(existsAfterDrop).toBe(false)
    })
  })

  describe('document Insertion with Protobuf Structure', () => {
    it('should insert documents with metadata using gRPC protobuf format', async () => {
      if (skipQdrant)
        return

      // Create collection
      await qdrantDb.createHybridCollection(testCollectionName, 1536)

      // Train BM25 for sparse vectors
      const bm25 = qdrantDb.getBM25Generator()
      bm25.learn(['test content for indexing', 'another document'])

      // Create test document with metadata including codebasePath
      const testDoc: VectorDocument = {
        id: 'chunk_1234567890abcdef',
        vector: Array.from({ length: 1536 }).fill(0.1),
        content: 'test content for indexing',
        relativePath: 'src/test.ts',
        startLine: 1,
        endLine: 10,
        fileExtension: '.ts',
        metadata: {
          language: 'typescript',
          codebasePath: '/home/user/test-project',
          chunkIndex: 0,
        },
      }

      // Insert document
      await qdrantDb.insertHybrid(testCollectionName, [testDoc])

      // Query to verify insertion
      const results = await qdrantDb.query(testCollectionName, '', ['metadata'], 1)

      expect(results.length).toBe(1)
      expect(results[0].id).toBeTruthy()
      expect(results[0].metadata).toBeDefined()
    })
  })

  describe('query with Metadata Extraction', () => {
    beforeEach(async () => {
      if (skipQdrant)
        return

      // Setup: Create collection and insert test data
      await qdrantDb.createHybridCollection(testCollectionName, 1536)

      const bm25 = qdrantDb.getBM25Generator()
      bm25.learn([
        'user authentication service',
        'database connection handler',
        'api endpoint controller',
      ])

      const testDocs: VectorDocument[] = [
        {
          id: 'chunk_0000000000000001',
          vector: Array.from({ length: 1536 }).fill(0.1),
          content: 'user authentication service',
          relativePath: 'src/auth.ts',
          startLine: 1,
          endLine: 20,
          fileExtension: '.ts',
          metadata: {
            language: 'typescript',
            codebasePath: '/home/user/my-project',
            chunkIndex: 0,
          },
        },
        {
          id: 'chunk_0000000000000002',
          vector: Array.from({ length: 1536 }).fill(0.2),
          content: 'database connection handler',
          relativePath: 'src/db.ts',
          startLine: 1,
          endLine: 15,
          fileExtension: '.ts',
          metadata: {
            language: 'typescript',
            codebasePath: '/home/user/my-project',
            chunkIndex: 1,
          },
        },
        {
          id: 'chunk_0000000000000003',
          vector: Array.from({ length: 1536 }).fill(0.3),
          content: 'api endpoint controller',
          relativePath: 'src/api.ts',
          startLine: 1,
          endLine: 25,
          fileExtension: '.ts',
          metadata: {
            language: 'typescript',
            codebasePath: '/home/user/my-project',
            chunkIndex: 2,
          },
        },
      ]

      await qdrantDb.insertHybrid(testCollectionName, testDocs)
    })

    it('should query and extract metadata.codebasePath correctly', async () => {
      if (skipQdrant)
        return

      // Query with metadata field
      const results = await qdrantDb.query(
        testCollectionName,
        '', // empty filter
        ['metadata'], // request metadata field
        3,
      )

      expect(results.length).toBeGreaterThan(0)

      // Verify metadata structure
      for (const result of results) {
        expect(result.metadata).toBeDefined()
        expect(typeof result.metadata).toBe('object')

        // Verify codebasePath exists and is correct
        expect(result.metadata.codebasePath).toBe('/home/user/my-project')
        expect(result.metadata.language).toBe('typescript')
        expect(typeof result.metadata.chunkIndex).toBe('number')
      }
    })

    it('should handle protobuf kind.case pattern for string values', async () => {
      if (skipQdrant)
        return

      const results = await qdrantDb.query(
        testCollectionName,
        '',
        ['content', 'relativePath', 'metadata'],
        1,
      )

      expect(results.length).toBe(1)
      const result = results[0]

      // Verify string values are extracted from protobuf structure
      expect(typeof result.content).toBe('string')
      expect(result.content.length).toBeGreaterThan(0)

      expect(typeof result.relativePath).toBe('string')
      expect(result.relativePath).toContain('.ts')

      // Verify metadata is parsed as JSON object
      expect(typeof result.metadata).toBe('object')
      expect(result.metadata.codebasePath).toBeTruthy()
    })

    it('should handle protobuf kind.case pattern for integer values', async () => {
      if (skipQdrant)
        return

      const results = await qdrantDb.query(
        testCollectionName,
        '',
        ['startLine', 'endLine'],
        1,
      )

      expect(results.length).toBe(1)
      const result = results[0]

      // Verify integer values are extracted and converted from BigInt
      expect(typeof result.startLine).toBe('number')
      expect(result.startLine).toBeGreaterThanOrEqual(1)

      expect(typeof result.endLine).toBe('number')
      expect(result.endLine).toBeGreaterThan(result.startLine)
    })

    it('should return all fields when outputFields is empty', async () => {
      if (skipQdrant)
        return

      const results = await qdrantDb.query(
        testCollectionName,
        '',
        [], // empty array = return all fields
        1,
      )

      expect(results.length).toBe(1)
      const result = results[0]

      // Verify all known fields are present
      expect(result.id).toBeTruthy()
      expect(result.content).toBeTruthy()
      expect(result.relativePath).toBeTruthy()
      expect(typeof result.startLine).toBe('number')
      expect(typeof result.endLine).toBe('number')
      expect(result.fileExtension).toBeTruthy()
      expect(result.metadata).toBeDefined()
      expect(result.metadata.codebasePath).toBeTruthy()
    })

    it('should filter by fileExtension correctly', async () => {
      if (skipQdrant)
        return

      // Query with filter
      const results = await qdrantDb.query(
        testCollectionName,
        'fileExtension == \'.ts\'', // Milvus-style filter expression
        ['relativePath'],
        10,
      )

      expect(results.length).toBeGreaterThan(0)

      // Verify all results have .ts extension
      for (const result of results) {
        expect(result.relativePath).toContain('.ts')
      }
    })

    it('should handle empty collections gracefully', async () => {
      if (skipQdrant)
        return

      // Create empty collection
      const emptyCollection = 'test_empty_collection'
      await qdrantDb.createHybridCollection(emptyCollection, 1536)

      try {
        // Query empty collection
        const results = await qdrantDb.query(emptyCollection, '', ['metadata'], 10)

        // Should return empty array, not throw
        expect(Array.isArray(results)).toBe(true)
        expect(results.length).toBe(0)
      }
      finally {
        // Cleanup
        await qdrantDb.dropCollection(emptyCollection)
      }
    })
  })

  describe('protobuf Backward Compatibility', () => {
    it('should handle both kind.value and direct value access patterns', async () => {
      if (skipQdrant)
        return

      await qdrantDb.createHybridCollection(testCollectionName, 1536)

      const bm25 = qdrantDb.getBM25Generator()
      bm25.learn(['test content'])

      const testDoc: VectorDocument = {
        id: 'chunk_aaaaaaaaaaaaaaaa',
        vector: Array.from({ length: 1536 }).fill(0.5),
        content: 'test content',
        relativePath: 'test.ts',
        startLine: 1,
        endLine: 10,
        fileExtension: '.ts',
        metadata: {
          language: 'typescript',
          codebasePath: '/test/path',
          chunkIndex: 0,
        },
      }

      await qdrantDb.insertHybrid(testCollectionName, [testDoc])

      // Query and verify both access patterns work
      const results = await qdrantDb.query(
        testCollectionName,
        '',
        ['content', 'metadata'],
        1,
      )

      expect(results.length).toBe(1)
      expect(results[0].content).toBe('test content')
      expect(results[0].metadata.codebasePath).toBe('/test/path')
    })
  })

  describe('sync Integration', () => {
    it('should allow sync to extract codebasePath from Qdrant collections', async () => {
      if (skipQdrant)
        return

      await qdrantDb.createHybridCollection(testCollectionName, 1536)

      const bm25 = qdrantDb.getBM25Generator()
      bm25.learn(['sync test'])

      const testDoc: VectorDocument = {
        id: 'chunk_bbbbbbbbbbbbbbbb',
        vector: Array.from({ length: 1536 }).fill(0.1),
        content: 'sync test',
        relativePath: 'src/sync.ts',
        startLine: 1,
        endLine: 5,
        fileExtension: '.ts',
        metadata: {
          language: 'typescript',
          codebasePath: '/home/user/sync-project', // This is what sync needs
          chunkIndex: 0,
        },
      }

      await qdrantDb.insertHybrid(testCollectionName, [testDoc])

      // Simulate what sync does: query for metadata
      const results = await qdrantDb.query(testCollectionName, '', ['metadata'], 1)

      expect(results.length).toBe(1)
      expect(results[0].metadata).toBeDefined()

      // Parse metadata (sync does JSON.parse)
      const metadata = typeof results[0].metadata === 'string'
        ? JSON.parse(results[0].metadata)
        : results[0].metadata

      // Verify codebasePath is extractable
      expect(metadata.codebasePath).toBe('/home/user/sync-project')
      expect(typeof metadata.codebasePath).toBe('string')
    })
  })

  describe('hybrid Search with BM25', () => {
    beforeEach(async () => {
      if (skipQdrant)
        return

      // Create collection with hybrid vectors
      await qdrantDb.createHybridCollection(testCollectionName, 384) // Small dimension for test

      // Insert test documents with BM25 training
      const testDocs: VectorDocument[] = [
        {
          id: 'chunk_0000000000000001',
          vector: Array.from({ length: 384 }).fill(0.1),
          content: 'function get_resolver() { return new URLResolver(); }',
          relativePath: 'urls/resolvers.py',
          startLine: 1,
          endLine: 5,
          fileExtension: '.py',
          metadata: { codebasePath: '/test/django' },
        },
        {
          id: 'chunk_0000000000000002',
          vector: Array.from({ length: 384 }).fill(0.2),
          content: 'def get_resolver(): return URLResolver()',
          relativePath: 'urls/base.py',
          startLine: 10,
          endLine: 15,
          fileExtension: '.py',
          metadata: { codebasePath: '/test/django' },
        },
        {
          id: 'chunk_0000000000000003',
          vector: Array.from({ length: 384 }).fill(0.3),
          content: 'class URLResolver: pass',
          relativePath: 'urls/resolver.py',
          startLine: 20,
          endLine: 25,
          fileExtension: '.py',
          metadata: { codebasePath: '/test/django' },
        },
      ]

      // Train BM25 with corpus
      const corpus = testDocs.map((doc) => doc.content)
      const bm25Generator = qdrantDb.getBM25Generator()
      bm25Generator.learn(corpus)

      // Insert documents with hybrid vectors
      await qdrantDb.insertHybrid(testCollectionName, testDocs)
    })

    it('should perform hybrid search successfully', async () => {
      if (skipQdrant)
        return

      // Act - Perform hybrid search
      const query = 'get_resolver function'
      const denseVector = Array.from({ length: 384 }).fill(0.15)

      const results = await qdrantDb.hybridSearch(
        testCollectionName,
        [
          { data: denseVector, limit: 10 },
          { data: query, limit: 10 },
        ],
        { limit: 3 },
      )

      // Assert
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
      expect(results.length).toBeLessThanOrEqual(3)

      // Verify result structure
      results.forEach((result) => {
        expect(result.document).toBeDefined()
        expect(result.document.content).toBeTruthy()
        expect(result.score).toBeGreaterThan(0)
      })
    })

    it('should handle query with empty sparse vector gracefully', async () => {
      if (skipQdrant)
        return

      // Act - Query with term not in vocabulary (should generate empty sparse vector)
      const query = 'nonexistent_unknown_term_xyz'
      const denseVector = Array.from({ length: 384 }).fill(0.15)

      // This should NOT throw "Query variant is missing" error
      // It should fall back to dense-only search
      const results = await qdrantDb.hybridSearch(
        testCollectionName,
        [
          { data: denseVector, limit: 10 },
          { data: query, limit: 10 },
        ],
        { limit: 3 },
      )

      // Assert - Should still return results (dense-only fallback)
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      // May return results based on dense vector similarity
    })

    it('should handle BM25 model persistence across searches', async () => {
      if (skipQdrant)
        return

      // First search - BM25 should be trained
      const query1 = 'get_resolver'
      const denseVector1 = Array.from({ length: 384 }).fill(0.1)

      const results1 = await qdrantDb.hybridSearch(
        testCollectionName,
        [
          { data: denseVector1, limit: 10 },
          { data: query1, limit: 10 },
        ],
        { limit: 3 },
      )

      expect(results1).toBeDefined()
      expect(results1.length).toBeGreaterThan(0)

      // Second search - Should use same BM25 model
      const query2 = 'URLResolver class'
      const denseVector2 = Array.from({ length: 384 }).fill(0.2)

      const results2 = await qdrantDb.hybridSearch(
        testCollectionName,
        [
          { data: denseVector2, limit: 10 },
          { data: query2, limit: 10 },
        ],
        { limit: 3 },
      )

      expect(results2).toBeDefined()
      expect(results2.length).toBeGreaterThan(0)
    })
  })
})
