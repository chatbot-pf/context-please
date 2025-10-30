import type { ContextConfig } from '../../src/context'
import type { Embedding } from '../../src/embedding/base-embedding'
import type { Splitter } from '../../src/splitter'
import type { VectorDatabase } from '../../src/vectordb/types'
import { Context } from '../../src/context'
import { FakeEmbedding } from './fake-embedding'
import { FakeVectorDatabase } from './fake-vector-database'

/**
 * Fluent builder for creating Context instances in tests.
 *
 * Provides convenient methods for common test configurations:
 * - Fake implementations for fast, isolated tests
 * - Real implementations for integration tests
 * - Customizable extensions and ignore patterns
 *
 * Example usage:
 * ```typescript
 * const context = new TestContextBuilder()
 *   .withFakeEmbedding(256)
 *   .withFakeVectorDatabase()
 *   .withSupportedExtensions(['.ts', '.js'])
 *   .build();
 * ```
 */
export class TestContextBuilder {
  private config: Partial<ContextConfig> = {}

  /**
   * Use fake embedding provider (fast, no API calls)
   */
  withFakeEmbedding(dimension = 128): this {
    this.config.embedding = new FakeEmbedding(dimension)
    return this
  }

  /**
   * Use fake vector database (in-memory, fast)
   */
  withFakeVectorDatabase(): this {
    this.config.vectorDatabase = new FakeVectorDatabase({ address: 'test' })
    return this
  }

  /**
   * Use custom embedding provider
   */
  withEmbedding(embedding: Embedding): this {
    this.config.embedding = embedding
    return this
  }

  /**
   * Use custom vector database
   */
  withVectorDatabase(vectorDatabase: VectorDatabase): this {
    this.config.vectorDatabase = vectorDatabase
    return this
  }

  /**
   * Use custom code splitter
   */
  withCodeSplitter(splitter: Splitter): this {
    this.config.codeSplitter = splitter
    return this
  }

  /**
   * Set supported file extensions
   */
  withSupportedExtensions(extensions: string[]): this {
    this.config.supportedExtensions = extensions
    return this
  }

  /**
   * Set ignore patterns
   */
  withIgnorePatterns(patterns: string[]): this {
    this.config.ignorePatterns = patterns
    return this
  }

  /**
   * Set custom file extensions (from MCP/environment)
   */
  withCustomExtensions(extensions: string[]): this {
    this.config.customExtensions = extensions
    return this
  }

  /**
   * Set custom ignore patterns (from MCP/environment)
   */
  withCustomIgnorePatterns(patterns: string[]): this {
    this.config.customIgnorePatterns = patterns
    return this
  }

  /**
   * Build the Context instance
   */
  build(): Context {
    // Ensure vector database is provided (required)
    if (!this.config.vectorDatabase) {
      throw new Error('Vector database is required. Call withFakeVectorDatabase() or withVectorDatabase()')
    }

    return new Context(this.config as ContextConfig)
  }

  /**
   * Shorthand: Create a fully fake Context for fast unit-style integration tests
   */
  static createFakeContext(dimension = 128): Context {
    return new TestContextBuilder()
      .withFakeEmbedding(dimension)
      .withFakeVectorDatabase()
      .build()
  }

  /**
   * Shorthand: Create a Context with fake vector DB but configurable embedding
   */
  static createWithEmbedding(embedding: Embedding): Context {
    return new TestContextBuilder()
      .withEmbedding(embedding)
      .withFakeVectorDatabase()
      .build()
  }

  /**
   * Shorthand: Create a Context with fake embedding but configurable vector DB
   */
  static createWithVectorDatabase(vectorDatabase: VectorDatabase): Context {
    return new TestContextBuilder()
      .withFakeEmbedding()
      .withVectorDatabase(vectorDatabase)
      .build()
  }
}
