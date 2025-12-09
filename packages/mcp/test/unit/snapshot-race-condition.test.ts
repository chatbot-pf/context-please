import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SnapshotManager } from '../../src/snapshot.js'

/**
 * Unit tests for SnapshotManager race condition fix
 *
 * These tests verify the fix for GitHub issues #49 and #50:
 * - "Index lost" - indexing completes but search says "not indexed"
 * - "Why is the search code unusable just after the index is completed?"
 *
 * The root cause was a race condition where:
 * 1. setCodebaseIndexed() updates in-memory state
 * 2. saveCodebaseSnapshot() writes to disk (after memory update)
 * 3. getIndexedCodebases() was reading from disk, missing the in-memory update
 *
 * The fix makes getIndexedCodebases(), getIndexingCodebases(), and getIndexingProgress()
 * return in-memory state instead of reading from disk, eliminating the race condition.
 */

// Mock fs module to avoid actual file I/O
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

describe('snapshotManager Race Condition Fix', () => {
  let snapshotManager: SnapshotManager

  beforeEach(() => {
    vi.clearAllMocks()
    snapshotManager = new SnapshotManager()
  })

  describe('getIndexedCodebases - Race Condition Fix (Issues #49, #50)', () => {
    it('should return indexed status immediately after setCodebaseIndexed() - before disk save', () => {
      // This is the critical test for the race condition fix.
      // Before the fix, getIndexedCodebases() read from disk, which could be stale.
      // After the fix, it returns in-memory state immediately.

      // Arrange
      const codebasePath = '/test/project'

      // Act: Set codebase as indexed (simulating end of indexing)
      snapshotManager.setCodebaseIndexed(codebasePath, {
        indexedFiles: 10,
        totalChunks: 100,
        status: 'completed',
      })
      // NOTE: saveCodebaseSnapshot() NOT called yet - simulating race window

      // Assert: getIndexedCodebases should return the path immediately
      const indexedCodebases = snapshotManager.getIndexedCodebases()
      expect(indexedCodebases).toContain(codebasePath)
    })

    it('should not include codebase that was never indexed', () => {
      // Arrange: Fresh snapshot manager with no indexed codebases
      const codebasePath = '/test/project'

      // Act: Query indexed codebases
      const indexedCodebases = snapshotManager.getIndexedCodebases()

      // Assert: Should not contain the path
      expect(indexedCodebases).not.toContain(codebasePath)
      expect(indexedCodebases).toHaveLength(0)
    })
  })

  describe('getIndexingCodebases - Race Condition Fix', () => {
    it('should return indexing status immediately after setCodebaseIndexing() - before disk save', () => {
      // Arrange
      const codebasePath = '/test/project'

      // Act: Set codebase to indexing state
      snapshotManager.setCodebaseIndexing(codebasePath, 50)
      // NOTE: saveCodebaseSnapshot() NOT called yet - simulating race window

      // Assert: getIndexingCodebases should return the path immediately
      const indexingCodebases = snapshotManager.getIndexingCodebases()
      expect(indexingCodebases).toContain(codebasePath)
    })

    it('should not include codebase that transitioned to indexed', () => {
      // Arrange
      const codebasePath = '/test/project'
      snapshotManager.setCodebaseIndexing(codebasePath, 50)

      // Act: Transition to indexed
      snapshotManager.setCodebaseIndexed(codebasePath, {
        indexedFiles: 10,
        totalChunks: 100,
        status: 'completed',
      })

      // Assert: Should no longer appear in indexing list
      const indexingCodebases = snapshotManager.getIndexingCodebases()
      expect(indexingCodebases).not.toContain(codebasePath)
    })
  })

  describe('getIndexingProgress - Race Condition Fix', () => {
    it('should return progress immediately after setCodebaseIndexing() - before disk save', () => {
      // Arrange
      const codebasePath = '/test/project'

      // Act: Set codebase to indexing with 75% progress
      snapshotManager.setCodebaseIndexing(codebasePath, 75)
      // NOTE: saveCodebaseSnapshot() NOT called yet - simulating race window

      // Assert: Progress should be available immediately
      const progress = snapshotManager.getIndexingProgress(codebasePath)
      expect(progress).toBe(75)
    })

    it('should return undefined for non-indexing codebase', () => {
      // Arrange
      const codebasePath = '/test/project'

      // Act: Query progress without setting indexing state
      const progress = snapshotManager.getIndexingProgress(codebasePath)

      // Assert: Should return undefined
      expect(progress).toBeUndefined()
    })

    it('should return undefined after transitioning to indexed', () => {
      // Arrange
      const codebasePath = '/test/project'
      snapshotManager.setCodebaseIndexing(codebasePath, 75)

      // Act: Transition to indexed
      snapshotManager.setCodebaseIndexed(codebasePath, {
        indexedFiles: 10,
        totalChunks: 100,
        status: 'completed',
      })
      const progress = snapshotManager.getIndexingProgress(codebasePath)

      // Assert: Should return undefined (no longer indexing)
      expect(progress).toBeUndefined()
    })
  })

  describe('state Transition Flow', () => {
    it('should correctly transition from indexing → indexed', () => {
      // This simulates the real flow in startBackgroundIndexing()
      const codebasePath = '/test/project'

      // Step 1: Start indexing
      snapshotManager.setCodebaseIndexing(codebasePath, 0)
      expect(snapshotManager.getIndexingCodebases()).toContain(codebasePath)
      expect(snapshotManager.getIndexedCodebases()).not.toContain(codebasePath)
      expect(snapshotManager.getCodebaseStatus(codebasePath)).toBe('indexing')

      // Step 2: Progress updates
      snapshotManager.setCodebaseIndexing(codebasePath, 50)
      expect(snapshotManager.getIndexingProgress(codebasePath)).toBe(50)

      snapshotManager.setCodebaseIndexing(codebasePath, 100)
      expect(snapshotManager.getIndexingProgress(codebasePath)).toBe(100)

      // Step 3: Complete indexing (this is where the race condition happened)
      snapshotManager.setCodebaseIndexed(codebasePath, {
        indexedFiles: 10,
        totalChunks: 100,
        status: 'completed',
      })

      // Assert: Immediately after setCodebaseIndexed(), status should be correct
      // This is the fix for the race condition
      expect(snapshotManager.getIndexedCodebases()).toContain(codebasePath)
      expect(snapshotManager.getIndexingCodebases()).not.toContain(codebasePath)
      expect(snapshotManager.getIndexingProgress(codebasePath)).toBeUndefined()
      expect(snapshotManager.getCodebaseStatus(codebasePath)).toBe('indexed')
    })

    it('should correctly transition from indexing → failed', () => {
      const codebasePath = '/test/project'

      // Start indexing
      snapshotManager.setCodebaseIndexing(codebasePath, 50)

      // Fail indexing
      snapshotManager.setCodebaseIndexFailed(codebasePath, 'Network error', 50)

      // Assert: Status should be immediately correct
      expect(snapshotManager.getIndexedCodebases()).not.toContain(codebasePath)
      expect(snapshotManager.getIndexingCodebases()).not.toContain(codebasePath)
      expect(snapshotManager.getCodebaseStatus(codebasePath)).toBe('indexfailed')
    })
  })
})
