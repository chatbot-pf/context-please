import * as path from 'node:path'
import { Context } from '@pleaseai/context-please-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToolHandlers } from '../../src/handlers.js'
import { FakeSnapshotManager } from '../doubles/fake-snapshot-manager.js'
import { TestToolHandlerBuilder } from '../doubles/test-tool-handler-builder.js'

/**
 * Integration tests for MCP ToolHandlers
 *
 * Tests the 4 MCP tools:
 * - index_codebase
 * - search_code
 * - clear_index
 * - get_indexing_status
 */
describe('tool Handlers Integration', () => {
  let handlers: ToolHandlers
  let context: Context
  let snapshotManager: FakeSnapshotManager
  let fixturesPath: string

  beforeEach(() => {
    // Create test setup with fake dependencies
    const setup = TestToolHandlerBuilder.createDefault()
    handlers = setup.handlers
    context = setup.context
    snapshotManager = setup.snapshotManager

    // Path to shared test fixtures from core package
    fixturesPath = path.join(__dirname, '../../../core/test/fixtures/sample-codebase')
  })

  afterEach(() => {
    // Reset all test doubles
    snapshotManager.reset()
  })

  describe('handleIndexCodebase', () => {
    it('should start indexing a valid codebase path', async () => {
      // Arrange
      const args = { path: fixturesPath, force: false, splitter: 'ast' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')
      expect(result.content[0].text).toContain('Started background indexing')
      expect(result.content[0].text).toContain(fixturesPath)

      // Check snapshot manager state
      const indexingCodebases = snapshotManager.getIndexingCodebases()
      expect(indexingCodebases).toContain(fixturesPath)
    })

    it('should reject non-existent path', async () => {
      // Arrange
      const nonExistentPath = '/path/that/does/not/exist'
      const args = { path: nonExistentPath, force: false, splitter: 'ast' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('does not exist')
    })

    it('should reject already indexed codebase without force flag', async () => {
      // Arrange: Actually index the codebase first (creates collection in fake DB)
      await context.indexCodebase(fixturesPath)

      // Mark as indexed in snapshot
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 10,
        status: 'completed',
      })

      const args = { path: fixturesPath, force: false, splitter: 'ast' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('already indexed')
      expect(result.content[0].text).toContain('force=true')
    })

    it('should allow re-indexing with force flag', async () => {
      // Arrange: Actually index the codebase first
      await context.indexCodebase(fixturesPath)

      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 10,
        status: 'completed',
      })

      const args = { path: fixturesPath, force: true, splitter: 'ast' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.isError).not.toBe(true)
      expect(result.content[0].text).toContain('Started background indexing')
    })

    it('should reject codebase that is currently indexing', async () => {
      // Arrange
      snapshotManager.setCodebaseIndexing(fixturesPath, 50)

      const args = { path: fixturesPath, force: false, splitter: 'ast' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('already being indexed')
    })

    it('should handle custom extensions parameter', async () => {
      // Arrange
      const args = {
        path: fixturesPath,
        force: false,
        splitter: 'ast',
        customExtensions: ['.vue', '.svelte'],
      }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.content[0].text).toContain('Started background indexing')
      expect(result.content[0].text).toContain('custom extensions')
    })

    it('should handle custom ignore patterns parameter', async () => {
      // Arrange
      const args = {
        path: fixturesPath,
        force: false,
        splitter: 'ast',
        ignorePatterns: ['static/**', '*.tmp'],
      }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.content[0].text).toContain('Started background indexing')
      expect(result.content[0].text).toContain('custom ignore patterns')
    })

    it('should reject invalid splitter type', async () => {
      // Arrange
      const args = { path: fixturesPath, force: false, splitter: 'invalid' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Invalid splitter type')
    })
  })

  describe('handleSearchCode', () => {
    it('should return error for non-indexed codebase', async () => {
      // Arrange
      const args = { path: fixturesPath, query: 'test query', limit: 10 }

      // Act
      const result = await handlers.handleSearchCode(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not indexed')
      expect(result.content[0].text).toContain('index_codebase')
    })

    it('should return error for non-existent path', async () => {
      // Arrange
      const nonExistentPath = '/path/that/does/not/exist'
      const args = { path: nonExistentPath, query: 'test', limit: 10 }

      // Act
      const result = await handlers.handleSearchCode(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('does not exist')
    })

    it('should allow search on indexing codebase with warning', async () => {
      // Arrange: Set codebase as indexing
      snapshotManager.setCodebaseIndexing(fixturesPath, 50)

      // Index the codebase first (simulate background indexing started)
      await context.indexCodebase(fixturesPath)

      const args = { path: fixturesPath, query: 'user', limit: 5 }

      // Act
      const result = await handlers.handleSearchCode(args)

      // Assert
      expect(result.isError).not.toBe(true)
      expect(result.content[0].text).toContain('Indexing in Progress')
    })

    it('should return search results for indexed codebase', async () => {
      // Arrange: Index and mark as indexed
      await context.indexCodebase(fixturesPath)
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 28,
        status: 'completed',
      })

      const args = { path: fixturesPath, query: 'user service', limit: 5 }

      // Act
      const result = await handlers.handleSearchCode(args)

      // Assert
      expect(result.isError).not.toBe(true)
      expect(result.content[0].text).toContain('Found')
      expect(result.content[0].text).toContain('results')
    })

    it('should handle no results gracefully', async () => {
      // Arrange
      await context.indexCodebase(fixturesPath)
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 28,
        status: 'completed',
      })

      const args = { path: fixturesPath, query: 'xyznonexistent999', limit: 5 }

      // Act
      const result = await handlers.handleSearchCode(args)

      // Assert
      expect(result.isError).not.toBe(true)
      // Note: Fake embeddings may still find results due to deterministic hashing
      // The important thing is it doesn't error
      expect(result.content[0].text).toBeDefined()
    })

    it('should respect limit parameter', async () => {
      // Arrange
      await context.indexCodebase(fixturesPath)
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 28,
        status: 'completed',
      })

      const args = { path: fixturesPath, query: 'function', limit: 3 }

      // Act
      const result = await handlers.handleSearchCode(args)

      // Assert
      expect(result.isError).not.toBe(true)
      // Should not return more than requested limit
      const resultCount = (result.content[0].text.match(/\d+\. Code snippet/g) || []).length
      expect(resultCount).toBeLessThanOrEqual(3)
    })

    it('should handle extensionFilter parameter', async () => {
      // Arrange
      await context.indexCodebase(fixturesPath)
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 28,
        status: 'completed',
      })

      const args = {
        path: fixturesPath,
        query: 'function',
        limit: 10,
        extensionFilter: ['.ts'],
      }

      // Act
      const result = await handlers.handleSearchCode(args)

      // Assert
      expect(result.isError).not.toBe(true)
      // Results should only contain .ts files
      if (result.content[0].text.includes('Code snippet')) {
        expect(result.content[0].text).not.toContain('.py')
      }
    })

    it('should reject invalid extension filter format', async () => {
      // Arrange
      await context.indexCodebase(fixturesPath)
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 28,
        status: 'completed',
      })

      const args = {
        path: fixturesPath,
        query: 'function',
        limit: 10,
        extensionFilter: ['invalid'], // Missing dot prefix
      }

      // Act
      const result = await handlers.handleSearchCode(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Invalid file extensions')
    })
  })

  describe('handleClearIndex', () => {
    it('should clear indexed codebase successfully', async () => {
      // Arrange
      await context.indexCodebase(fixturesPath)
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 28,
        status: 'completed',
      })

      const args = { path: fixturesPath }

      // Act
      const result = await handlers.handleClearIndex(args)

      // Assert
      expect(result.isError).not.toBe(true)
      expect(result.content[0].text).toContain('Successfully cleared')

      // Verify codebase was removed from snapshot
      const indexedCodebases = snapshotManager.getIndexedCodebases()
      expect(indexedCodebases).not.toContain(fixturesPath)
    })

    it('should handle clearing non-existent path', async () => {
      // Arrange: First index something so we bypass the "no codebases" early return
      await context.indexCodebase(path.join(__dirname, '../../../core/test/fixtures/empty-dir'))
      snapshotManager.setCodebaseIndexed(path.join(__dirname, '../../../core/test/fixtures/empty-dir'), {
        indexedFiles: 0,
        totalChunks: 0,
        status: 'completed',
      })

      const nonExistentPath = '/path/that/does/not/exist'
      const args = { path: nonExistentPath }

      // Act
      const result = await handlers.handleClearIndex(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('does not exist')
    })

    it('should handle clearing non-indexed codebase', async () => {
      // Arrange: Index a different codebase so we bypass "no codebases" early return
      const otherPath = path.join(__dirname, '../../../core/test/fixtures/empty-dir')
      await context.indexCodebase(otherPath)
      snapshotManager.setCodebaseIndexed(otherPath, {
        indexedFiles: 0,
        totalChunks: 0,
        status: 'completed',
      })

      const args = { path: fixturesPath }

      // Act
      const result = await handlers.handleClearIndex(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not indexed')
    })

    it('should clear indexing codebase successfully', async () => {
      // Arrange
      snapshotManager.setCodebaseIndexing(fixturesPath, 50)
      await context.indexCodebase(fixturesPath) // Create collection

      const args = { path: fixturesPath }

      // Act
      const result = await handlers.handleClearIndex(args)

      // Assert
      expect(result.isError).not.toBe(true)
      expect(result.content[0].text).toContain('Successfully cleared')
    })

    it('should report remaining codebases after clear', async () => {
      // Arrange: Index two codebases
      const secondPath = path.join(__dirname, '../../../core/test/fixtures/empty-dir')
      await context.indexCodebase(fixturesPath)
      await context.indexCodebase(secondPath)

      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 28,
        status: 'completed',
      })
      snapshotManager.setCodebaseIndexed(secondPath, {
        indexedFiles: 0,
        totalChunks: 0,
        status: 'completed',
      })

      const args = { path: fixturesPath }

      // Act
      const result = await handlers.handleClearIndex(args)

      // Assert
      expect(result.content[0].text).toContain('1 other indexed codebase')
    })
  })

  describe('handleGetIndexingStatus', () => {
    it('should return not_found status for non-indexed codebase', async () => {
      // Arrange
      const args = { path: fixturesPath }

      // Act
      const result = await handlers.handleGetIndexingStatus(args)

      // Assert
      expect(result.isError).not.toBe(true)
      expect(result.content[0].text).toContain('not indexed')
      expect(result.content[0].text).toContain('index_codebase')
    })

    it('should return indexing status with progress', async () => {
      // Arrange
      snapshotManager.setCodebaseIndexing(fixturesPath, 65.5)

      const args = { path: fixturesPath }

      // Act
      const result = await handlers.handleGetIndexingStatus(args)

      // Assert
      expect(result.content[0].text).toContain('currently being indexed')
      expect(result.content[0].text).toContain('65.5%')
    })

    it('should return indexed status with statistics', async () => {
      // Arrange
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 42,
        totalChunks: 156,
        status: 'completed',
      })

      const args = { path: fixturesPath }

      // Act
      const result = await handlers.handleGetIndexingStatus(args)

      // Assert
      expect(result.content[0].text).toContain('fully indexed')
      expect(result.content[0].text).toContain('42 files')
      expect(result.content[0].text).toContain('156 chunks')
    })

    it('should return failed status with error message', async () => {
      // Arrange
      snapshotManager.setCodebaseIndexFailed(
        fixturesPath,
        'Connection timeout',
        75,
      )

      const args = { path: fixturesPath }

      // Act
      const result = await handlers.handleGetIndexingStatus(args)

      // Assert
      expect(result.content[0].text).toContain('indexing failed')
      expect(result.content[0].text).toContain('Connection timeout')
      expect(result.content[0].text).toContain('75.0%')
      expect(result.content[0].text).toContain('retry')
    })

    it('should handle non-existent path', async () => {
      // Arrange
      const nonExistentPath = '/path/that/does/not/exist'
      const args = { path: nonExistentPath }

      // Act
      const result = await handlers.handleGetIndexingStatus(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('does not exist')
    })
  })

  describe('path Resolution', () => {
    it('should handle absolute paths correctly', async () => {
      // Arrange
      const absolutePath = fixturesPath
      const args = { path: absolutePath, force: false, splitter: 'ast' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.content[0].text).toContain(absolutePath)
      expect(result.content[0].text).not.toContain('resolved to absolute path')
    })

    it('should resolve relative paths to absolute', async () => {
      // Arrange: Use a relative path from MCP package root to core fixtures
      // From /packages/mcp to /packages/core/test/fixtures/sample-codebase
      const relativePath = '../core/test/fixtures/sample-codebase'
      const args = { path: relativePath, force: false, splitter: 'ast' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      // Should successfully index and show resolution note
      expect(result.isError).not.toBe(true)
      expect(result.content[0].text).toContain('Started background indexing')
      expect(result.content[0].text).toContain('resolved to absolute path')
    })
  })

  describe('error Handling', () => {
    it('should handle file paths (not directories) gracefully', async () => {
      // Arrange: Use a file path instead of directory
      const filePath = path.join(fixturesPath, 'user-service.ts')
      const args = { path: filePath, force: false, splitter: 'ast' }

      // Act
      const result = await handlers.handleIndexCodebase(args)

      // Assert
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not a directory')
    })

    it('should return proper error format for all tools', async () => {
      // Test that errors have consistent format

      // Arrange: Index something to avoid "no codebases" early return in clear_index
      await context.indexCodebase(fixturesPath)
      snapshotManager.setCodebaseIndexed(fixturesPath, {
        indexedFiles: 3,
        totalChunks: 28,
        status: 'completed',
      })

      // Test index_codebase
      const indexResult = await handlers.handleIndexCodebase({
        path: '/nonexistent',
        force: false,
        splitter: 'ast',
      })
      expect(indexResult.isError).toBe(true)
      expect(indexResult.content).toBeDefined()
      expect(indexResult.content[0].type).toBe('text')

      // Test search_code
      const searchResult = await handlers.handleSearchCode({
        path: '/nonexistent',
        query: 'test',
        limit: 10,
      })
      expect(searchResult.isError).toBe(true)
      expect(searchResult.content).toBeDefined()
      expect(searchResult.content[0].type).toBe('text')

      // Test clear_index
      const clearResult = await handlers.handleClearIndex({
        path: '/nonexistent',
      })
      expect(clearResult.isError).toBe(true)
      expect(clearResult.content).toBeDefined()
      expect(clearResult.content[0].type).toBe('text')

      // Test get_indexing_status
      const statusResult = await handlers.handleGetIndexingStatus({
        path: '/nonexistent',
      })
      expect(statusResult.isError).toBe(true)
      expect(statusResult.content).toBeDefined()
      expect(statusResult.content[0].type).toBe('text')
    })
  })
})
