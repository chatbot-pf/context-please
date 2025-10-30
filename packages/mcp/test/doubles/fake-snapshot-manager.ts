import {
  CodebaseInfo,
  CodebaseInfoIndexed,
  CodebaseInfoIndexFailed,
  CodebaseInfoIndexing,
} from '../../src/config.js'

/**
 * FakeSnapshotManager
 *
 * In-memory implementation of SnapshotManager for testing.
 * No file I/O - all state is kept in memory.
 *
 * Mimics the SnapshotManager interface but without filesystem persistence.
 */
export class FakeSnapshotManager {
  private indexedCodebases: string[] = []
  private indexingCodebases: Map<string, number> = new Map()
  private codebaseFileCount: Map<string, number> = new Map()
  private codebaseInfoMap: Map<string, CodebaseInfo> = new Map()

  // Test helper: Reset all state
  public reset(): void {
    this.indexedCodebases = []
    this.indexingCodebases = new Map()
    this.codebaseFileCount = new Map()
    this.codebaseInfoMap = new Map()
  }

  // Test helper: Get all internal state for assertions
  public getInternalState() {
    return {
      indexedCodebases: [...this.indexedCodebases],
      indexingCodebases: new Map(this.indexingCodebases),
      codebaseFileCount: new Map(this.codebaseFileCount),
      codebaseInfoMap: new Map(this.codebaseInfoMap),
    }
  }

  public getIndexedCodebases(): string[] {
    return [...this.indexedCodebases]
  }

  public getIndexingCodebases(): string[] {
    return Array.from(this.indexingCodebases.keys())
  }

  public getIndexingProgress(codebasePath: string): number | undefined {
    return this.indexingCodebases.get(codebasePath)
  }

  public setCodebaseIndexing(codebasePath: string, progress: number = 0): void {
    this.indexingCodebases.set(codebasePath, progress)

    // Remove from other states
    this.indexedCodebases = this.indexedCodebases.filter((path) => path !== codebasePath)
    this.codebaseFileCount.delete(codebasePath)

    // Update info map
    const info: CodebaseInfoIndexing = {
      status: 'indexing',
      indexingPercentage: progress,
      lastUpdated: new Date().toISOString(),
    }
    this.codebaseInfoMap.set(codebasePath, info)
  }

  public setCodebaseIndexed(
    codebasePath: string,
    stats: { indexedFiles: number, totalChunks: number, status: 'completed' | 'limit_reached' },
  ): void {
    // Add to indexed list if not already there
    if (!this.indexedCodebases.includes(codebasePath)) {
      this.indexedCodebases.push(codebasePath)
    }

    // Remove from indexing state
    this.indexingCodebases.delete(codebasePath)

    // Update file count and info
    this.codebaseFileCount.set(codebasePath, stats.indexedFiles)

    const info: CodebaseInfoIndexed = {
      status: 'indexed',
      indexedFiles: stats.indexedFiles,
      totalChunks: stats.totalChunks,
      indexStatus: stats.status,
      lastUpdated: new Date().toISOString(),
    }
    this.codebaseInfoMap.set(codebasePath, info)
  }

  public setCodebaseIndexFailed(
    codebasePath: string,
    errorMessage: string,
    lastAttemptedPercentage?: number,
  ): void {
    // Remove from other states
    this.indexedCodebases = this.indexedCodebases.filter((path) => path !== codebasePath)
    this.indexingCodebases.delete(codebasePath)
    this.codebaseFileCount.delete(codebasePath)

    // Update info map
    const info: CodebaseInfoIndexFailed = {
      status: 'indexfailed',
      errorMessage,
      lastAttemptedPercentage,
      lastUpdated: new Date().toISOString(),
    }
    this.codebaseInfoMap.set(codebasePath, info)
  }

  public getCodebaseStatus(codebasePath: string): 'indexed' | 'indexing' | 'indexfailed' | 'not_found' {
    const info = this.codebaseInfoMap.get(codebasePath)
    if (!info)
      return 'not_found'
    return info.status
  }

  public getCodebaseInfo(codebasePath: string): CodebaseInfo | undefined {
    return this.codebaseInfoMap.get(codebasePath)
  }

  public getFailedCodebases(): string[] {
    return Array.from(this.codebaseInfoMap.entries())
      .filter(([_, info]) => info.status === 'indexfailed')
      .map(([path, _]) => path)
  }

  public removeCodebaseCompletely(codebasePath: string): void {
    // Remove from all internal state
    this.indexedCodebases = this.indexedCodebases.filter((path) => path !== codebasePath)
    this.indexingCodebases.delete(codebasePath)
    this.codebaseFileCount.delete(codebasePath)
    this.codebaseInfoMap.delete(codebasePath)
  }

  public removeIndexedCodebase(codebasePath: string): void {
    this.indexedCodebases = this.indexedCodebases.filter((path) => path !== codebasePath)
    this.codebaseFileCount.delete(codebasePath)
    this.codebaseInfoMap.delete(codebasePath)
  }

  // No-op methods for file persistence (in-memory only)
  public loadCodebaseSnapshot(): void {
    // No-op for in-memory fake
  }

  public saveCodebaseSnapshot(): void {
    // No-op for in-memory fake
  }
}
