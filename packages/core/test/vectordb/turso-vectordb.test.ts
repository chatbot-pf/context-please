import type { VectorDocument } from '../../src/types'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TursoVectorDatabase } from '../../src/vectordb/turso-vectordb'

describe('tursoVectorDatabase', () => {
  let tursoDB: TursoVectorDatabase
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'turso-test-'))
    tursoDB = new TursoVectorDatabase({ storageDir: tempDir })
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  describe('initialization', () => {
    it('should initialize storage directory', async () => {
      await (tursoDB as any).initialize()
      expect(await fs.pathExists(tempDir)).toBe(true)
    })

    it('should throw error with invalid storage directory permissions', async () => {
      const readOnlyDb = new TursoVectorDatabase({ storageDir: '/root/turso-test-readonly' })
      await expect((readOnlyDb as any).initializationPromise).rejects.toThrow(/Failed to initialize/)
    })
  })

  describe('createCollection', () => {
    it('should create a dense-only collection', async () => {
      await tursoDB.createCollection('test', 128)

      expect(await tursoDB.hasCollection('test')).toBe(true)
      const collections = await tursoDB.listCollections()
      expect(collections).toContain('test')
    })

    it('should create a hybrid collection with BM25', async () => {
      await tursoDB.createHybridCollection('hybrid-test', 128)

      expect(await tursoDB.hasCollection('hybrid-test')).toBe(true)
      const collections = await tursoDB.listCollections()
      expect(collections).toContain('hybrid-test')
    })

    it('should throw error when creating duplicate collection', async () => {
      await tursoDB.createCollection('test', 128)
      await expect(tursoDB.createCollection('test', 128)).rejects.toThrow(/already exists/)
    })
  })

  describe('insert and search', () => {
    const testDocs: VectorDocument[] = [
      {
        id: 'doc1',
        vector: Array.from({ length: 128 }).fill(0).map((_, i) => i === 0 ? 1.0 : 0.0),
        content: 'First document about testing',
        relativePath: 'test1.ts',
        startLine: 1,
        endLine: 10,
        fileExtension: '.ts',
        metadata: {},
      },
      {
        id: 'doc2',
        vector: Array.from({ length: 128 }).fill(0).map((_, i) => i === 1 ? 1.0 : 0.0),
        content: 'Second document about implementation',
        relativePath: 'test2.ts',
        startLine: 1,
        endLine: 10,
        fileExtension: '.ts',
        metadata: {},
      },
    ]

    it('should insert and search documents', async () => {
      await tursoDB.createCollection('test', 128)
      await tursoDB.insert('test', testDocs)

      const queryVector = Array.from({ length: 128 }).fill(0).map((_, i) => i === 0 ? 1.0 : 0.0)
      const results = await tursoDB.search('test', queryVector, { topK: 5 })

      expect(results).toHaveLength(2)
      expect(results[0].document.id).toBe('doc1')
      expect(results[0].score).toBeGreaterThan(0)
    })

    it('should return empty array for empty collection', async () => {
      await tursoDB.createCollection('empty', 128)
      const queryVector = Array.from({ length: 128 }).fill(0.1)
      const results = await tursoDB.search('empty', queryVector)

      expect(results).toEqual([])
      expect(results).toBeInstanceOf(Array)
    })

    it('should handle dimension mismatch gracefully', async () => {
      await tursoDB.createCollection('test', 128)

      const wrongDimDoc: VectorDocument = {
        id: 'wrong',
        vector: Array.from({ length: 256 }).fill(0.1),
        content: 'test',
        relativePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        fileExtension: '.ts',
        metadata: {},
      }

      await expect(tursoDB.insert('test', [wrongDimDoc])).rejects.toThrow(/dimension mismatch/)
    })

    it('should apply score threshold filter', async () => {
      await tursoDB.createCollection('test', 128)
      await tursoDB.insert('test', testDocs)

      const queryVector = Array.from({ length: 128 }).fill(0).map((_, i) => i === 0 ? 1.0 : 0.0)
      const results = await tursoDB.search('test', queryVector, { topK: 5, threshold: 0.9 })

      // Should filter out low-score documents
      expect(results.length).toBeLessThanOrEqual(2)
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.9)
      }
    })
  })

  describe('persistence', () => {
    const testDoc: VectorDocument = {
      id: 'persist-test',
      vector: Array.from({ length: 128 }).fill(0.1),
      content: 'persistence test',
      relativePath: 'test.ts',
      startLine: 1,
      endLine: 10,
      fileExtension: '.ts',
      metadata: {},
    }

    it('should persist and reload collection', async () => {
      // Create and save
      await tursoDB.createCollection('persist', 128)
      await tursoDB.insert('persist', [testDoc])

      // Force unload from memory
      const client = (tursoDB as any).clients.get('persist')
      if (client)
        client.close()
      ;(tursoDB as any).clients.delete('persist')
      ;(tursoDB as any).metadataCache.delete('persist')

      // Reload
      const queryVector = Array.from({ length: 128 }).fill(0.1)
      const results = await tursoDB.search('persist', queryVector)

      expect(results).toHaveLength(1)
      expect(results[0].document.id).toBe('persist-test')
    })

    it('should throw error when searching non-existent collection', async () => {
      const queryVector = Array.from({ length: 128 }).fill(0.1)

      await expect(tursoDB.search('non-existent', queryVector))
        .rejects
        .toThrow(/does not exist/)
    })
  })

  describe('hybrid search', () => {
    it('should perform hybrid search with BM25', async () => {
      await tursoDB.createHybridCollection('hybrid', 128)

      const docs: VectorDocument[] = [
        {
          id: 'doc1',
          vector: Array.from({ length: 128 }).fill(0).map((_, i) => i === 0 ? 1.0 : 0.0),
          content: 'machine learning algorithms',
          relativePath: 'ml.ts',
          startLine: 1,
          endLine: 10,
          fileExtension: '.ts',
          metadata: {},
        },
        {
          id: 'doc2',
          vector: Array.from({ length: 128 }).fill(0).map((_, i) => i === 1 ? 1.0 : 0.0),
          content: 'neural network implementation',
          relativePath: 'nn.ts',
          startLine: 1,
          endLine: 10,
          fileExtension: '.ts',
          metadata: {},
        },
      ]

      await tursoDB.insertHybrid('hybrid', docs)

      const results = await tursoDB.hybridSearch('hybrid', [
        { anns_field: 'dense', data: Array.from({ length: 128 }).fill(0).map((_, i) => i === 0 ? 1.0 : 0.0), param: {}, limit: 10 },
        { anns_field: 'sparse', data: 'machine learning', param: {}, limit: 10 },
      ])

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].document.content).toContain('machine')
    })

    it('should throw error when calling insertHybrid on dense-only collection', async () => {
      await tursoDB.createCollection('dense-only', 128)

      const docs: VectorDocument[] = [{
        id: 'test',
        vector: Array.from({ length: 128 }).fill(0.1),
        content: 'test content',
        relativePath: 'test.ts',
        startLine: 1,
        endLine: 10,
        fileExtension: '.ts',
        metadata: {},
      }]

      await expect(tursoDB.insertHybrid('dense-only', docs))
        .rejects
        .toThrow(/is not a hybrid collection/)
    })

    it('should throw error when calling hybridSearch on dense-only collection', async () => {
      await tursoDB.createCollection('dense-only', 128)

      await expect(tursoDB.hybridSearch('dense-only', [
        { anns_field: 'dense', data: Array.from({ length: 128 }).fill(0.1), param: {}, limit: 10 },
      ])).rejects.toThrow(/is not a hybrid collection/)
    })
  })

  describe('delete operation (key advantage over FAISS)', () => {
    it('should delete documents by ID', async () => {
      await tursoDB.createCollection('test', 128)
      const docs: VectorDocument[] = [
        {
          id: 'delete-me',
          vector: Array.from({ length: 128 }).fill(0.1),
          content: 'test content to delete',
          relativePath: 'test.ts',
          startLine: 1,
          endLine: 1,
          fileExtension: '.ts',
          metadata: {},
        },
        {
          id: 'keep-me',
          vector: Array.from({ length: 128 }).fill(0.2),
          content: 'test content to keep',
          relativePath: 'test2.ts',
          startLine: 1,
          endLine: 1,
          fileExtension: '.ts',
          metadata: {},
        },
      ]
      await tursoDB.insert('test', docs)

      // Verify both documents exist
      let results = await tursoDB.query('test', '', ['id'], 10)
      expect(results).toHaveLength(2)

      // Delete one document
      await tursoDB.delete('test', ['delete-me'])

      // Verify only one document remains
      results = await tursoDB.query('test', '', ['id'], 10)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('keep-me')
    })

    it('should handle non-existent IDs gracefully', async () => {
      await tursoDB.createCollection('test', 128)
      const doc: VectorDocument = {
        id: 'existing',
        vector: Array.from({ length: 128 }).fill(0.1),
        content: 'test',
        relativePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        fileExtension: '.ts',
        metadata: {},
      }
      await tursoDB.insert('test', [doc])

      // Should not throw when deleting non-existent ID
      await expect(tursoDB.delete('test', ['non-existent-id'])).resolves.not.toThrow()

      // Original document should still exist
      const results = await tursoDB.query('test', '', ['id'], 10)
      expect(results).toHaveLength(1)
    })
  })

  describe('query with filter (key advantage over FAISS)', () => {
    const testDocs: VectorDocument[] = [
      {
        id: 'ts-file',
        vector: Array.from({ length: 128 }).fill(0.1),
        content: 'typescript content',
        relativePath: 'src/app.ts',
        startLine: 1,
        endLine: 10,
        fileExtension: '.ts',
        metadata: {},
      },
      {
        id: 'js-file',
        vector: Array.from({ length: 128 }).fill(0.2),
        content: 'javascript content',
        relativePath: 'src/app.js',
        startLine: 1,
        endLine: 10,
        fileExtension: '.js',
        metadata: {},
      },
    ]

    it('should filter by fileExtension', async () => {
      await tursoDB.createCollection('test', 128)
      await tursoDB.insert('test', testDocs)

      const results = await tursoDB.query('test', 'fileExtension == \'.ts\'', ['id', 'content'])

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('ts-file')
    })

    it('should return all documents when no filter', async () => {
      await tursoDB.createCollection('test', 128)
      await tursoDB.insert('test', testDocs)

      const results = await tursoDB.query('test', '', ['id'], 10)

      expect(results).toHaveLength(2)
    })
  })

  describe('dropCollection', () => {
    it('should remove database file when dropping collection', async () => {
      await tursoDB.createCollection('drop-test', 128)
      const dbPath = path.join(tempDir, 'drop-test.db')

      expect(await fs.pathExists(dbPath)).toBe(true)

      await tursoDB.dropCollection('drop-test')

      expect(await fs.pathExists(dbPath)).toBe(false)
      expect(await tursoDB.hasCollection('drop-test')).toBe(false)
    })

    it('should remove BM25 model file for hybrid collection', async () => {
      await tursoDB.createHybridCollection('hybrid-drop', 128)

      const docs: VectorDocument[] = [{
        id: 'test',
        vector: Array.from({ length: 128 }).fill(0.1),
        content: 'test content',
        relativePath: 'test.ts',
        startLine: 1,
        endLine: 10,
        fileExtension: '.ts',
        metadata: {},
      }]
      await tursoDB.insertHybrid('hybrid-drop', docs)

      const bm25Path = path.join(tempDir, 'hybrid-drop_bm25.json')
      expect(await fs.pathExists(bm25Path)).toBe(true)

      await tursoDB.dropCollection('hybrid-drop')

      expect(await fs.pathExists(bm25Path)).toBe(false)
    })
  })

  describe('checkCollectionLimit', () => {
    it('should always return true (no limit)', async () => {
      expect(await tursoDB.checkCollectionLimit()).toBe(true)
    })
  })
})
