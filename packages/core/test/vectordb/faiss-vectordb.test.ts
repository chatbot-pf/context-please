import type { VectorDocument } from '../../src/types'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FaissVectorDatabase } from '../../src/vectordb/faiss-vectordb'

describe('faissVectorDatabase', () => {
  let faissDb: FaissVectorDatabase
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'faiss-test-'))
    faissDb = new FaissVectorDatabase({ storageDir: tempDir })
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  describe('initialization', () => {
    it('should initialize storage directory', async () => {
      await (faissDb as any).initialize()
      expect(await fs.pathExists(tempDir)).toBe(true)
    })

    it('should throw error with invalid storage directory permissions', async () => {
      const readOnlyDb = new FaissVectorDatabase({ storageDir: '/root/faiss-test-readonly' })
      // Initialize is called in constructor, so we need to wait for it to reject
      await expect((readOnlyDb as any).initializationPromise).rejects.toThrow(/Failed to initialize/)
    })
  })

  describe('createCollection', () => {
    it('should create a dense-only collection', async () => {
      await faissDb.createCollection('test', 128)

      expect(await faissDb.hasCollection('test')).toBe(true)
      const collections = await faissDb.listCollections()
      expect(collections).toContain('test')
    })

    it('should create a hybrid collection with BM25', async () => {
      await faissDb.createHybridCollection('hybrid-test', 128)

      expect(await faissDb.hasCollection('hybrid-test')).toBe(true)
      const collections = await faissDb.listCollections()
      expect(collections).toContain('hybrid-test')
    })

    it('should throw error when creating duplicate collection', async () => {
      await faissDb.createCollection('test', 128)
      await expect(faissDb.createCollection('test', 128)).rejects.toThrow(/already exists/)
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
      await faissDb.createCollection('test', 128)
      await faissDb.insert('test', testDocs)

      const queryVector = Array.from({ length: 128 }).fill(0).map((_, i) => i === 0 ? 1.0 : 0.0)
      const results = await faissDb.search('test', queryVector, { topK: 5 })

      expect(results).toHaveLength(2)
      expect(results[0].document.id).toBe('doc1')
      expect(results[0].score).toBeGreaterThan(0)
    })

    it('should return empty array for empty collection', async () => {
      await faissDb.createCollection('empty', 128)
      const queryVector = Array.from({ length: 128 }).fill(0.1)
      const results = await faissDb.search('empty', queryVector)

      expect(results).toEqual([])
      expect(results).toBeInstanceOf(Array)
    })

    it('should handle dimension mismatch gracefully', async () => {
      await faissDb.createCollection('test', 128)

      const wrongDimDoc: VectorDocument = {
        id: 'wrong',
        vector: Array.from({ length: 256 }).fill(0.1), // Wrong dimension!
        content: 'test',
        relativePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        fileExtension: '.ts',
        metadata: {},
      }

      // FAISS will throw when adding wrong dimension vector
      await expect(faissDb.insert('test', [wrongDimDoc])).rejects.toThrow()
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
      await faissDb.createCollection('persist', 128)
      await faissDb.insert('persist', [testDoc])

      // Force unload from memory
      ;(faissDb as any).collections.delete('persist')

      // Reload
      const queryVector = Array.from({ length: 128 }).fill(0.1)
      const results = await faissDb.search('persist', queryVector)

      expect(results).toHaveLength(1)
      expect(results[0].document.id).toBe('persist-test')
    })

    it('should handle corrupt metadata file gracefully', async () => {
      await faissDb.createCollection('corrupt', 128)
      await faissDb.insert('corrupt', [testDoc])

      // Corrupt metadata file
      const metadataPath = path.join(tempDir, 'corrupt', 'metadata.json')
      await fs.writeFile(metadataPath, 'CORRUPTED_JSON{')

      // Force unload and reload
      ;(faissDb as any).collections.delete('corrupt')

      await expect((faissDb as any).loadCollection('corrupt'))
        .rejects
        .toThrow(/Failed to load collection metadata/)
    })

    it('should handle corrupt documents file gracefully', async () => {
      await faissDb.createCollection('corrupt-docs', 128)
      await faissDb.insert('corrupt-docs', [testDoc])

      // Corrupt documents file
      const documentsPath = path.join(tempDir, 'corrupt-docs', 'documents.json')
      await fs.writeFile(documentsPath, 'CORRUPTED_JSON{')

      // Force unload and reload
      ;(faissDb as any).collections.delete('corrupt-docs')

      await expect((faissDb as any).loadCollection('corrupt-docs'))
        .rejects
        .toThrow(/Failed to load documents metadata/)
    })

    it('should throw error when searching non-existent collection', async () => {
      const queryVector = Array.from({ length: 128 }).fill(0.1)

      await expect(faissDb.search('non-existent', queryVector))
        .rejects
        .toThrow(/does not exist/)
    })
  })

  describe('hybrid search', () => {
    it('should perform hybrid search with BM25', async () => {
      await faissDb.createHybridCollection('hybrid', 128)

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

      await faissDb.insertHybrid('hybrid', docs)

      const results = await faissDb.hybridSearch('hybrid', [
        { anns_field: 'dense', data: Array.from({ length: 128 }).fill(0).map((_, i) => i === 0 ? 1.0 : 0.0), limit: 10 },
        { anns_field: 'sparse', data: 'machine learning', limit: 10 },
      ])

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].document.content).toContain('machine')
    })

    it('should throw error when calling insertHybrid on dense-only collection', async () => {
      await faissDb.createCollection('dense-only', 128)

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

      await expect(faissDb.insertHybrid('dense-only', docs))
        .rejects
        .toThrow(/is not a hybrid collection/)
    })

    it('should throw error when calling hybridSearch on dense-only collection', async () => {
      await faissDb.createCollection('dense-only', 128)

      await expect(faissDb.hybridSearch('dense-only', [
        { anns_field: 'dense', data: Array.from({ length: 128 }).fill(0.1), limit: 10 },
      ])).rejects.toThrow(/is not a hybrid collection/)
    })
  })

  describe('delete operation', () => {
    it('should throw error when attempting to delete', async () => {
      await faissDb.createCollection('test', 128)
      const doc: VectorDocument = {
        id: 'delete-me',
        vector: Array.from({ length: 128 }).fill(0.1),
        content: 'test',
        relativePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        fileExtension: '.ts',
        metadata: {},
      }
      await faissDb.insert('test', [doc])

      await expect(faissDb.delete('test', ['delete-me']))
        .rejects
        .toThrow(/FAISS does not support document deletion/)
    })
  })

  describe('query operation', () => {
    it('should warn when filter is provided', async () => {
      await faissDb.createCollection('test', 128)
      const doc: VectorDocument = {
        id: 'query-test',
        vector: Array.from({ length: 128 }).fill(0.1),
        content: 'test',
        relativePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        fileExtension: '.ts',
        metadata: {},
      }
      await faissDb.insert('test', [doc])

      // Should not throw, but should warn
      const results = await faissDb.query('test', 'some_field = "value"', ['id', 'content'])

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('query-test')
    })
  })

  describe('dropCollection', () => {
    it('should remove all files when dropping collection', async () => {
      await faissDb.createCollection('drop-test', 128)
      const collectionPath = path.join(tempDir, 'drop-test')

      expect(await fs.pathExists(collectionPath)).toBe(true)

      await faissDb.dropCollection('drop-test')

      expect(await fs.pathExists(collectionPath)).toBe(false)
      expect(await faissDb.hasCollection('drop-test')).toBe(false)
    })
  })
})
