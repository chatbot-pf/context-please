# Logging Guidelines

**Document Version**: 1.0
**Last Updated**: 2025-10-19
**Related Issue**: #14 - Replace console.log with MCP-compliant logging

---

## Quick Start

```typescript
import { createLogger } from '@pleaseai/context-please-core'

const logger = createLogger('ComponentName')

// Log an operation
logger.info({ operation, duration: 245 }, 'Operation completed')

// Log a warning
logger.warn({ attempt: 1, maxRetries: 3 }, 'Retry needed')

// Log an error
logger.error({ err: error, query }, 'Search failed')

// Debug logging (sampling)
if (++counter % 100 === 0) {
  logger.debug({ counter, total }, 'Progress update')
}
```

---

## Table of Contents

1. [Logger Setup](#logger-setup)
2. [Log Levels](#log-levels)
3. [Structured Metadata](#structured-metadata)
4. [High-Volume Logging](#high-volume-logging)
5. [Error Handling](#error-handling)
6. [Testing](#testing)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Logger Setup

### Creating a Component Logger

Every component should have its own logger:

```typescript
import { createLogger } from '@pleaseai/context-please-core'

export class MyComponent {
  private logger = createLogger('MyComponent')

  async doSomething() {
    this.logger.info({}, 'Starting operation')
    // ...
  }
}
```

### Logger Factory

The `createLogger()` function is a factory that:
- Takes component name as parameter
- Returns a child logger with component binding
- All logs automatically include component metadata

### Environment Configuration

Control logging via environment variables:

```bash
# Set log level
export LOG_LEVEL=debug      # debug, info, warn, error
export LOG_LEVEL=info       # Default

# Set environment mode
export NODE_ENV=development # Pretty-printed output
export NODE_ENV=production  # JSON output
```

---

## Log Levels

### When to Use Each Level

| Level | Use Case | Frequency | Example |
|-------|----------|-----------|---------|
| **debug** | Diagnostic details (code flow, variables) | High | File parsing details, AST traversal |
| **info** | Standard operations, milestones | Medium | Indexing completed, search results |
| **warn** | Unexpected but recoverable situations | Low | Missing config, retry needed |
| **error** | Error conditions requiring action | Very low | API failure, invalid data |

### Level Hierarchy

```
debug (10)   ← Most verbose
  ↓
info (20)    ← Default
  ↓
warn (30)
  ↓
error (40)   ← Least verbose
```

When you set `LOG_LEVEL=info`, you see: info, warn, error (debug hidden)

### Examples

**Debug Level**:
```typescript
logger.debug({
  filePath: '/path/to/file.ts',
  lines: 150,
  ast: true,
}, 'Parsing file')
```

**Info Level**:
```typescript
logger.info({
  totalFiles: 1000,
  processedFiles: 500,
  progress: '50%',
}, 'Indexing progress')
```

**Warn Level**:
```typescript
logger.warn({
  embeddingModel: 'openai-default',
  reason: 'OPENAI_API_KEY not configured',
}, 'Using fallback embedding model')
```

**Error Level**:
```typescript
logger.error({
  err: error,
  query: userQuery,
  operation: 'hybrid-search',
}, 'Search operation failed')
```

---

## Structured Metadata

### Purpose

Structured metadata enables log aggregation, analysis, and debugging:
- ✅ Parse logs automatically (JSON format)
- ✅ Filter by operation type
- ✅ Calculate metrics (latency, throughput)
- ✅ Correlate across components

### Standard Fields

Include relevant context for every operation:

```typescript
logger.info({
  // What operation?
  operation: 'hybrid-search',

  // Key metrics
  resultCount: 100,

  // How long did it take?
  duration: 245,

  // Which resource?
  collection: 'my-codebase',

  // Progress (for long operations)
  progress: '50%',
  processed: 500,
  total: 1000,
}, 'Search completed')
```

### Recommended Fields by Component

**QdrantVectorDatabase**:
```typescript
logger.info({
  operation: 'create-collection|search|upsert',
  collection: 'collection-name',
  dimension: 1536,
  vectorCount: 500,
  duration: 100,
  resultCount: 10,
}, 'operation completed')
```

**Context (Indexing)**:
```typescript
logger.info({
  operation: 'indexing',
  totalFiles: 1000,
  processedFiles: 500,
  progress: '50%',
  duration: 30000,
  filesPerSecond: 16.7,
}, 'Indexing progress')
```

**Embedding Provider**:
```typescript
logger.info({
  operation: 'embed-batch',
  batchSize: 100,
  tokenCount: 50000,
  duration: 2000,
  tokensPerSecond: 25,
  model: 'text-embedding-3-small',
}, 'Batch embedding completed')
```

**FileSynchronizer**:
```typescript
logger.info({
  operation: 'sync',
  addedFiles: 10,
  modifiedFiles: 5,
  deletedFiles: 2,
  duration: 500,
}, 'Sync completed')
```

### Metadata Best Practices

✅ **DO**:
- Use descriptive field names (`resultsCount` not `rc`)
- Include timing information (`duration: ms`)
- Add counters for progress (`processed`, `total`)
- Include error context (`err: error`, `query: userQuery`)

❌ **DON'T**:
- Log sensitive data (passwords, tokens, API keys)
- Use unstructured messages (use fields instead)
- Create huge objects (keep metadata < 1KB)
- Log at info level for every item in a loop (use sampling)

---

## High-Volume Logging

### Problem: Log Explosion

Without sampling, indexing 10,000 files would generate millions of logs:

```typescript
// ❌ DON'T: Logs millions of messages
for (const file of files) {
  logger.info({ file }, 'Processing file')  // 10,000 logs!
}
```

### Solution: Sampling

Log only every Nth operation:

```typescript
// ✅ DO: Sample every 100 files
let processedFiles = 0
const SAMPLE_INTERVAL = 100

for (const file of files) {
  processedFiles++

  if (processedFiles % SAMPLE_INTERVAL === 0 && logger.isDebugEnabled()) {
    logger.debug({
      processedFiles,
      totalFiles: files.length,
      progress: (processedFiles / files.length * 100).toFixed(1) + '%',
    }, 'Processing files')
  }
}
```

### Sampling Patterns

**Pattern 1: Periodic Sampling**
```typescript
// Log every 100th operation
if (++counter % 100 === 0) {
  logger.debug({ counter, total }, 'Progress')
}
```

**Pattern 2: Level-Aware Sampling**
```typescript
// Only sample if debug level is enabled
if (logger.isDebugEnabled() && ++counter % 100 === 0) {
  logger.debug({}, 'Message')
}
```

**Pattern 3: Limit Large Result Sets**
```typescript
// Log only first 3 and last 2 results
const logResults = results.length > 10
  ? [...results.slice(0, 3), '...', ...results.slice(-2)]
  : results

logger.debug({ results: logResults }, 'Results')
```

**Pattern 4: Conditional Expensive Operations**
```typescript
// Don't compute if log won't be emitted
if (logger.isDebugEnabled()) {
  logger.debug({
    expensiveData: complexStringification(),
  }, 'Debug info')
}
```

### Performance Impact

| Sampling | Logs/Index | Overhead | Recommendation |
|----------|-----------|----------|-----------------|
| None | 100,000 | >50% | ❌ Not acceptable |
| Every 1000 | 10 | <0.1% | ✅ Good for debug |
| Every 100 | 100 | <1% | ✅ Default |
| Every 10 | 1000 | <2% | ⚠️ If needed |

---

## Error Handling

### Logging Errors Properly

Always include the error object and context:

```typescript
async function search(query: string) {
  const logger = createLogger('Search')

  try {
    const results = await vectorDb.search(query)
    logger.info({ resultCount: results.length }, 'Search completed')
    return results
  } catch (error) {
    // ✅ Good: Include error + context
    logger.error({
      err: error,
      query,
      collection: 'my-codebase',
      operation: 'hybrid-search',
    }, 'Search failed')

    // Re-throw or handle error
    throw error
  }
}
```

### Error Field Handling

Pino automatically includes stack traces:

```typescript
// Input
logger.error({ err: new Error('Something failed') }, 'Operation failed')

// Output
{
  "level": 40,
  "err": {
    "type": "Error",
    "message": "Something failed",
    "stack": "Error: Something failed\n    at ...",
  },
  "msg": "Operation failed"
}
```

### Graceful Degradation

Log warnings for recoverable errors:

```typescript
try {
  const embedding = await provider.embed(text)
  logger.info({ model, tokens }, 'Embedding completed')
} catch (error) {
  logger.warn({
    err: error,
    fallback: 'using-cached-embedding',
  }, 'Embedding failed, using fallback')

  return cachedEmbedding
}
```

---

## Testing

### Silencing Logs in Tests

For unit tests, suppress logging to keep output clean:

```typescript
import { describe, it, beforeEach } from 'vitest'

describe('MyComponent', () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = 'silent'
  })

  it('should do something', () => {
    // No logging output during test
  })
})
```

### Capturing Logs for Verification

For integration tests, capture logs:

```typescript
import { describe, it } from 'vitest'
import pino from 'pino'

describe('Search', () => {
  it('should log search results', async () => {
    const messages: any[] = []

    // Create mock transport
    const transport = pino.transport({
      target: pino.transports.stream,
      options: {
        destination: {
          write: (msg: string) => {
            messages.push(JSON.parse(msg))
          },
        },
      },
    })

    // Your test code...

    // Verify logs
    expect(messages).toContainEqual(
      expect.objectContaining({
        msg: 'Search completed',
        resultCount: 100,
      })
    )
  })
})
```

---

## Best Practices

### ✅ DO

1. **Create logger per component**
   ```typescript
   const logger = createLogger('ComponentName')
   ```

2. **Use structured metadata**
   ```typescript
   logger.info({ operation, duration }, 'message')
   ```

3. **Include context for errors**
   ```typescript
   logger.error({ err: error, context }, 'Error message')
   ```

4. **Sample high-volume logs**
   ```typescript
   if (++counter % 100 === 0) logger.debug({}, 'msg')
   ```

5. **Use descriptive field names**
   ```typescript
   logger.info({ resultCount: 100 }, 'msg')  // Good
   logger.info({ rc: 100 }, 'msg')           // Bad
   ```

### ❌ DON'T

1. **Don't use console.***
   ```typescript
   // ❌ Never
   console.log('message')

   // ✅ Always use logger
   logger.info({}, 'message')
   ```

2. **Don't log sensitive data**
   ```typescript
   // ❌ Never
   logger.info({ apiKey: process.env.OPENAI_API_KEY }, 'msg')

   // ✅ Log safely
   logger.info({ model: 'gpt-3.5' }, 'API call')
   ```

3. **Don't create huge metadata objects**
   ```typescript
   // ❌ Avoid
   logger.info({ largeObject: entireCodebase }, 'msg')

   // ✅ Extract relevant fields
   logger.info({ totalLines: 50000, files: 100 }, 'msg')
   ```

4. **Don't log in tight loops**
   ```typescript
   // ❌ Creates millions of logs
   for (const file of files) {
     logger.info({ file }, 'Processing')
   }

   // ✅ Use sampling
   if (++counter % 100 === 0) {
     logger.info({ counter }, 'Progress')
   }
   ```

5. **Don't use string interpolation in messages**
   ```typescript
   // ❌ Hard to parse
   logger.info(`Processing ${file}...`)

   // ✅ Use structured fields
   logger.info({ file }, 'Processing')
   ```

---

## MCP Protocol Integration

### Dynamic Log Level Control

MCP clients (Claude Code CLI) can change log levels:

```typescript
// Client sends request
{
  "method": "logging/setLevel",
  "params": { "level": "debug" }
}

// Server responds
{ }

// Now all logs at debug level and above are shown
```

### Development Workflow

1. **Start MCP server**
   ```bash
   cd packages/mcp
   npm run dev
   ```

2. **In Claude Code CLI, enable debug logging**
   ```
   /tools logging/setLevel debug
   ```

3. **See detailed diagnostic logs**
   ```
   [16:45:32] DEBUG [QdrantDB] Connecting to qdrant...
   [16:45:32] DEBUG [Context] Starting indexing...
   ```

---

## Troubleshooting

### Issue: No logs appearing

**Cause**: Log level may be set too high
```bash
# Check/set log level
export LOG_LEVEL=info
```

### Issue: Too many logs

**Cause**: Running in debug mode or no sampling
```bash
# Set to info level
export LOG_LEVEL=info

# Add sampling to high-volume operations
if (++counter % 100 === 0) logger.debug({}, 'msg')
```

### Issue: Sensitive data in logs

**Cause**: Logging API keys, passwords, etc.
```typescript
// ❌ Remove this
logger.info({ apiKey: process.env.API_KEY }, 'msg')

// ✅ Log safely
logger.info({ hasApiKey: !!process.env.API_KEY }, 'msg')
```

### Issue: Performance degradation

**Cause**: No log sampling on large operations
```typescript
// Add sampling
let counter = 0
for (const file of files) {
  if (++counter % 100 === 0) {
    logger.debug({ counter }, 'Progress')
  }
}
```

---

## Examples

### Example 1: Component with Multiple Operations

```typescript
import { createLogger } from '@pleaseai/context-please-core'

export class QdrantVectorDatabase {
  private logger = createLogger('QdrantDB')

  async initialize(address: string) {
    this.logger.info({ address }, 'Initializing Qdrant')

    try {
      // Connect logic...
      this.logger.info({}, 'Connected successfully')
    } catch (error) {
      this.logger.error({ err: error, address }, 'Connection failed')
      throw error
    }
  }

  async search(query: string, limit: number = 10) {
    const startTime = Date.now()

    try {
      const results = await this.vectorDb.search(query, limit)
      const duration = Date.now() - startTime

      this.logger.info({
        operation: 'search',
        resultCount: results.length,
        duration,
        query: query.length,
      }, 'Search completed')

      return results
    } catch (error) {
      const duration = Date.now() - startTime

      this.logger.error({
        err: error,
        operation: 'search',
        duration,
        query,
      }, 'Search failed')

      throw error
    }
  }
}
```

### Example 2: High-Volume Operation with Sampling

```typescript
export class Context {
  private logger = createLogger('Context')

  async indexCodebase(path: string) {
    const files = await getFiles(path)
    let processedFiles = 0
    const SAMPLE_INTERVAL = 100

    for (const file of files) {
      processedFiles++

      // Sample every 100 files
      if (processedFiles % SAMPLE_INTERVAL === 0) {
        this.logger.debug({
          processedFiles,
          totalFiles: files.length,
          progress: (processedFiles / files.length * 100).toFixed(1) + '%',
        }, 'Indexing progress')
      }

      // Process file...
    }

    this.logger.info({
      operation: 'indexing',
      totalFiles: files.length,
      processed: processedFiles,
    }, 'Indexing completed')
  }
}
```

### Example 3: Error Handling with Context

```typescript
export class OpenAIEmbedding {
  private logger = createLogger('OpenAIEmbedding')

  async embed(text: string, retries = 3): Promise<number[]> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const embedding = await this.callOpenAI(text)

        if (attempt > 1) {
          this.logger.info({
            operation: 'embed-retry-success',
            attempt,
            totalAttempts: retries,
          }, 'Embedding succeeded after retry')
        }

        return embedding
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        this.logger.warn({
          operation: 'embed-retry',
          attempt,
          maxAttempts: retries,
          err: lastError,
        }, `Embedding failed, retrying (${attempt}/${retries})`)

        if (attempt < retries) {
          await delay(1000 * attempt) // Exponential backoff
        }
      }
    }

    this.logger.error({
      operation: 'embed-failed',
      attempts: retries,
      err: lastError,
      text: text.substring(0, 100), // Log first 100 chars only
    }, 'Embedding failed after all retries')

    throw lastError
  }
}
```

---

## References

- **ADR**: `docs/architecture/adr/001-pino-logging-system.md`
- **Specification**: `docs/specifications/logging-system.md`
- **Migration Plan**: `docs/plans/logging-migration-plan.md`
- **Pino Docs**: https://getpino.io/
- **RFC 5424**: https://tools.ietf.org/html/rfc5424

---

**Last Updated**: 2025-10-19
**Status**: Complete ✅
**Revision**: 1.0
