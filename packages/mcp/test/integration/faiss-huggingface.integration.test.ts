import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Context, HuggingFaceEmbedding, VectorDatabaseFactory } from '@pleaseai/context-please-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Check if FAISS is available before running tests
const faissAvailable = VectorDatabaseFactory.isFaissAvailable()

/**
 * Integration tests for FAISS + HuggingFace embedding
 *
 * Tests the full indexing and search workflow using:
 * - Real HuggingFace embeddings (MongoDB/mdbr-leaf-ir)
 * - Real FAISS vector database (local file-based)
 * - Sample codebase fixtures
 *
 * This test verifies that the HuggingFace truncation fix works correctly
 * when processing code chunks that may exceed the 512 token limit.
 *
 * Note: These tests are skipped when FAISS native bindings are not available
 * (e.g., in CI environments without C++ build tools).
 */
describe.skipIf(!faissAvailable)('FAISS + HuggingFace Integration', () => {
  let context: Context
  let fixturesPath: string
  let tempFaissDir: string

  beforeAll(async () => {
    // Create temporary FAISS storage directory
    tempFaissDir = path.join(os.tmpdir(), `faiss-test-${Date.now()}`)
    fs.mkdirSync(tempFaissDir, { recursive: true })

    // Create real HuggingFace embedding
    const embedding = new HuggingFaceEmbedding({
      model: 'MongoDB/mdbr-leaf-ir',
      dtype: 'fp32',
    })

    // Create real FAISS vector database with custom storage dir
    const vectorDatabase = VectorDatabaseFactory.create('faiss-local' as any, {
      storageDir: tempFaissDir,
    })

    // Create context with real dependencies
    context = new Context({
      embedding,
      vectorDatabase,
    })

    // Path to shared test fixtures from core package
    fixturesPath = path.join(__dirname, '../../../core/test/fixtures/sample-codebase')
  }, 60000) // 60 second timeout for model loading

  afterAll(async () => {
    // Cleanup temporary FAISS directory
    if (tempFaissDir && fs.existsSync(tempFaissDir)) {
      fs.rmSync(tempFaissDir, { recursive: true, force: true })
    }
  })

  describe('indexCodebase with FAISS', () => {
    it('should successfully index codebase and store documents in FAISS', async () => {
      // Act - Index the codebase
      const result = await context.indexCodebase(fixturesPath, undefined, true)

      // Assert - Indexing completed
      expect(result.indexedFiles).toBeGreaterThan(0)
      expect(result.totalChunks).toBeGreaterThan(0)
      expect(result.status).toBe('completed')

      // Verify FAISS has stored documents
      const collectionName = context.getCollectionName(fixturesPath)
      const faissCollectionPath = path.join(tempFaissDir, collectionName)

      expect(fs.existsSync(faissCollectionPath)).toBe(true)

      const metadataPath = path.join(faissCollectionPath, 'metadata.json')
      expect(fs.existsSync(metadataPath)).toBe(true)

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      expect(metadata.documentCount).toBeGreaterThan(0)
      expect(metadata.isHybrid).toBe(true)
      expect(metadata.dimension).toBe(768) // HuggingFace mdbr-leaf-ir dimension

      console.log(`Indexed ${result.indexedFiles} files, ${result.totalChunks} chunks`)
      console.log(`FAISS stored ${metadata.documentCount} documents`)
    }, 120000) // 2 minute timeout for indexing

    it('should handle long code chunks with HuggingFace truncation', async () => {
      // This test verifies the fix for HuggingFace token limit issue
      // Create a temporary file with content that exceeds 512 tokens
      const longCodeContent = generateLongCodeContent(1000) // ~1000 tokens
      const tempCodePath = path.join(os.tmpdir(), `long-code-test-${Date.now()}`)
      fs.mkdirSync(tempCodePath, { recursive: true })
      fs.writeFileSync(path.join(tempCodePath, 'long-file.ts'), longCodeContent)

      try {
        // Act - Index the long code (should not throw due to truncation fix)
        const result = await context.indexCodebase(tempCodePath, undefined, true)

        // Assert - Indexing completed without error
        expect(result.status).toBe('completed')
        expect(result.indexedFiles).toBe(1)
        expect(result.totalChunks).toBeGreaterThan(0)

        // Verify documents were indexed (truncation worked)
        const collectionName = context.getCollectionName(tempCodePath)
        const faissCollectionPath = path.join(tempFaissDir, collectionName)
        const metadataPath = path.join(faissCollectionPath, 'metadata.json')

        expect(fs.existsSync(metadataPath)).toBe(true)
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
        expect(metadata.documentCount).toBeGreaterThan(0)

        console.log(`Long code file generated ${result.totalChunks} chunks`)
        console.log(`FAISS stored ${metadata.documentCount} documents (truncation worked!)`)
      }
      finally {
        // Cleanup temp directory
        fs.rmSync(tempCodePath, { recursive: true, force: true })
      }
    }, 120000)
  })

  describe('semanticSearch with FAISS', () => {
    it('should find relevant code using semantic search', async () => {
      // Arrange - Index codebase first (tests run in sequence, reuse previous index)
      // The first indexCodebase test already indexed fixturesPath

      // Act - Search for code
      const results = await context.semanticSearch(fixturesPath, 'user authentication login', 5)

      // Assert - Should find results (sample-codebase has auth.py)
      expect(results.length).toBeGreaterThan(0)

      // Check result structure
      const firstResult = results[0]
      expect(firstResult.content).toBeDefined()
      expect(firstResult.relativePath).toBeDefined()
      expect(firstResult.score).toBeGreaterThan(0)

      console.log(`Found ${results.length} results for "user authentication login"`)
      console.log(`Top result: ${firstResult.relativePath} (score: ${firstResult.score.toFixed(4)})`)
    }, 60000)

    it('should find code with keyword matching (BM25 hybrid)', async () => {
      // Act - Search with specific keywords
      const results = await context.semanticSearch(fixturesPath, 'utils formatDate helper', 3)

      // Assert
      expect(results.length).toBeGreaterThan(0)

      console.log(`Found ${results.length} results for "utils formatDate helper"`)
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.relativePath}:${r.startLine}-${r.endLine} (score: ${r.score.toFixed(4)})`)
      })
    }, 60000)
  })
})

/**
 * Helper: Generate long code content that exceeds token limits
 */
function generateLongCodeContent(approximateTokens: number): string {
  const lines: string[] = [
    '// This is a test file with long content to verify HuggingFace truncation',
    'export class LongCodeHandler {',
  ]

  // Each line is roughly 10-15 tokens
  const linesNeeded = Math.ceil(approximateTokens / 12)

  for (let i = 0; i < linesNeeded; i++) {
    lines.push(`  // Comment line ${i}: This is documentation for method ${i}`)
    lines.push(`  public async handleOperation${i}(param${i}: string): Promise<void> {`)
    lines.push(`    console.log('Processing operation ${i} with parameter:', param${i});`)
    lines.push(`    const result${i} = await this.processData${i}(param${i});`)
    lines.push(`    return result${i};`)
    lines.push('  }')
    lines.push('')
  }

  lines.push('}')
  return lines.join('\n')
}
