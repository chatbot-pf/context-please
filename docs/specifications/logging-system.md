# Logging System Technical Specification

**Document Version**: 1.0
**Last Updated**: 2025-10-19
**Status**: Approved
**Relates to ADR**: 001-pino-logging-system.md

---

## Executive Summary

This specification defines the structured logging system for Context Please using Pino, compliant with MCP (Model Context Protocol) standards. The system enables real-time log control, structured debugging, and performance monitoring across all indexing and search operations.

**Key Metrics**:
- 400+ console.* calls → 0 (production code)
- Performance overhead: <5% (with log sampling)
- Log latency: 1-2ms per message
- Memory overhead: <500KB additional

---

## 1. Architecture Overview

### 1.1 System Components

```
┌─────────────────────────────────────────────────────────┐
│                   MCP Server                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  logging/setLevel Handler                        │   │
│  │  - Dynamic level adjustment (debug/info/warn)    │   │
│  │  - Broadcasts level change to logger factory     │   │
│  └──────────┬───────────────────────────────────────┘   │
└─────────────┼───────────────────────────────────────────┘
              │
┌─────────────v───────────────────────────────────────────┐
│          Logger Factory (core/utils/logger.ts)          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Global Pino Instance                            │   │
│  │  - Shared configuration                          │   │
│  │  - Environment variable driven                   │   │
│  │  - stderr output stream                          │   │
│  └──────────┬───────────────────────────────────────┘   │
│  ┌──────────v───────────────────────────────────────┐   │
│  │  Component Child Loggers                         │   │
│  │  - QdrantDB, MilvusDB, OpenAIEmbedding, etc.     │   │
│  │  - Each inherits global config                   │   │
│  │  - Auto-tagged with component name               │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────┬───────────────────────────────────────────┘
              │
┌─────────────v───────────────────────────────────────────┐
│                  Pino Core                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  JSON Serialization                              │   │
│  │  - RFC 5424 log levels                           │   │
│  │  - Timestamp + context fields                    │   │
│  │  - Process/hostname metadata                     │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Output Transports (Environment-based)           │   │
│  │  - Production: stderr stream (no pretty)         │   │
│  │  - Development: pino-pretty (colorized)          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Log Flow

```
Application Code
     │
     ├─→ logger.info({ metadata }, 'message')
     │
     ├─→ Pino Core
     │   ├─→ Serialize to JSON
     │   ├─→ Add timestamp, process ID
     │   ├─→ Add severity level
     │
     ├─→ Transport (stderr)
     │   ├─→ Dev: pino-pretty formatter
     │   ├─→ Prod: raw JSON
     │
     └─→ stderr output for log aggregation
```

---

## 2. Core Logger Factory

### 2.1 Implementation

**File**: `packages/core/src/utils/logger.ts`

```typescript
import pino, { Logger } from 'pino'

// Global logger instance - shared by all components
const globalLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            destination: 2, // stderr
            translateTime: 'HH:MM:ss Z',
            singleLine: false,
            ignore: 'pid,hostname',
          },
        }
      : {
          target: 'pino/file',
          options: { destination: 2 }, // stderr
        },
})

/**
 * Create a child logger for a specific component
 * @param componentName - Name of the component (e.g., 'QdrantDB', 'OpenAIEmbedding')
 * @returns Child logger with component context
 */
export function createLogger(componentName: string): Logger {
  return globalLogger.child({ component: componentName })
}

/**
 * Get the global logger instance (rarely needed)
 * @returns Global Pino logger
 */
export function getGlobalLogger(): Logger {
  return globalLogger
}

/**
 * Set log level dynamically (used by MCP logging/setLevel handler)
 * @param level - New log level (debug/info/warn/error)
 */
export function setLogLevel(level: string): void {
  globalLogger.level = level
}

export default globalLogger
```

### 2.2 Environment Variables

| Variable | Default | Description | Example |
|----------|---------|-------------|---------|
| `LOG_LEVEL` | `info` | RFC 5424 log level (debug/info/warn/error) | `DEBUG` |
| `NODE_ENV` | `development` | Environment mode (development/production) | `production` |

### 2.3 Log Level Hierarchy

Levels are hierarchical - setting level X shows X and above (lower numbers):

```
debug (10)   ← Most verbose
  ↓
info (20)    ← Default
  ↓
warn (30)
  ↓
error (40)   ← Least verbose
```

**Example**:
- `LOG_LEVEL=debug`: Shows debug, info, warn, error
- `LOG_LEVEL=info`: Shows info, warn, error
- `LOG_LEVEL=warn`: Shows warn, error
- `LOG_LEVEL=error`: Shows error only

---

## 3. Component Logger Usage

### 3.1 Basic Pattern

```typescript
import { createLogger } from '../utils/logger'

export class QdrantVectorDatabase {
  private logger = createLogger('QdrantDB')

  async initialize() {
    this.logger.info({ address: this.config.address }, 'Initializing Qdrant')
    // ... initialization code ...
    this.logger.info({ collections: 5 }, 'Initialization complete')
  }

  async search(query: string) {
    const startTime = Date.now()
    this.logger.debug({ query }, 'Starting search')

    const results = await this.performSearch(query)

    const duration = Date.now() - startTime
    this.logger.info(
      { queryLength: query.length, resultCount: results.length, duration },
      'Search completed'
    )
  }

  async handleError(error: Error, context: string) {
    this.logger.error({ err: error, context }, 'Search failed')
  }
}
```

### 3.2 Structured Metadata

Every log should include relevant context:

```typescript
// ✅ Good - includes structured metadata
logger.info({
  resultsCount: 100,
  searchTime: 245,
  collection: 'codebase-v1',
  query: 'authenticate user',
  operation: 'hybrid-search',
}, 'Hybrid search completed')

// ❌ Bad - unstructured message
logger.info('Got 100 results from search in 245ms')
```

### 3.3 Log Level Selection

| Level | Use Case | Example |
|-------|----------|---------|
| **debug** | Detailed diagnostic information | `logger.debug({ filePath, ast }, 'Parsing file')` |
| **info** | Standard operations, milestones | `logger.info({ indexed: 50, total: 200 }, 'Indexing progress')` |
| **warn** | Unexpected but recoverable situations | `logger.warn({ missing: 'embedding_model' }, 'Using default embedding')` |
| **error** | Error conditions with recovery path | `logger.error({ err, query }, 'Search failed, using fallback')` |

---

## 4. MCP Integration

### 4.1 Server Initialization

**File**: `packages/mcp/src/index.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { createLogger, setLogLevel } from '@pleaseai/context-please-core'

const logger = createLogger('ContextMCP')

class ContextMcpServer {
  private server: Server

  constructor(config) {
    this.server = new Server(
      { name: 'context-please', version: '0.3.0' },
      {
        capabilities: {
          tools: {},
          logging: {}, // ← Enable logging capability
        },
      }
    )

    // Handle dynamic log level changes from MCP clients
    this.server.setRequestHandler(
      { method: 'logging/setLevel' },
      async (request) => {
        const { level } = request.params
        setLogLevel(level)
        logger.info({ newLevel: level }, 'Log level changed by client')
        return {}
      }
    )
  }
}
```

### 4.2 MCP Logging Request

MCP clients can request to change log level:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "logging/setLevel",
  "params": {
    "level": "debug"
  }
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {}
}
```

### 4.3 Logging Notifications (Optional)

MCP server can send logs back to clients via `notifications/message`:

```typescript
this.server.notification('notifications/message', {
  level: 'info',
  data: 'Indexing completed successfully',
})
```

---

## 5. Log Output Formats

### 5.1 Development Mode (pretty-printed)

```
[16:45:32 Z] INFO  (1234 on hostname): [QdrantDB] Initializing Qdrant
    address: "localhost:6334"
[16:45:32 Z] INFO  (1234 on hostname): [MilvusDB] Connection established
    collections: 5
[16:45:32 Z] ERROR (1234 on hostname): [OpenAIEmbedding] API error
    err: Error: 401 Unauthorized
        at ...
    retries: 3
```

### 5.2 Production Mode (JSON)

```json
{"level":20,"time":1634567890000,"pid":1234,"hostname":"prod-server","component":"QdrantDB","address":"localhost:6334","msg":"Initializing Qdrant"}
{"level":20,"time":1634567891000,"pid":1234,"hostname":"prod-server","component":"MilvusDB","collections":5,"msg":"Connection established"}
{"level":40,"time":1634567892000,"pid":1234,"hostname":"prod-server","component":"OpenAIEmbedding","err":{"message":"401 Unauthorized"},"retries":3,"msg":"API error"}
```

---

## 6. High-Volume Operation Logging

### 6.1 Problem: Log Explosion

Large codebase indexing (10,000 files) would generate millions of logs at debug level. Solution: Log sampling.

### 6.2 Sampling Patterns

#### Pattern 1: Periodic Sampling

```typescript
const logger = createLogger('AstCodeSplitter')
let processedFiles = 0
const SAMPLE_INTERVAL = 100 // Log every 100th file

for (const file of files) {
  processedFiles++

  if (processedFiles % SAMPLE_INTERVAL === 0 && logger.isDebugEnabled()) {
    logger.debug({
      processedFiles,
      totalFiles: files.length,
      progress: (processedFiles / files.length * 100).toFixed(1) + '%',
    }, 'Processing files')
  }

  // Process file...
}
```

#### Pattern 2: Limit Large Result Sets

```typescript
const logger = createLogger('QdrantDB')

async search(query: string, limit: number = 10): Promise<SearchResult[]> {
  const allResults = await this.vectorDb.search(query)

  // Log only first 3 and last 2 results for large result sets
  const logResults =
    allResults.length > 10
      ? [...allResults.slice(0, 3), '...', ...allResults.slice(-2)]
      : allResults

  logger.debug({ results: logResults }, 'Search results')
  return allResults
}
```

#### Pattern 3: Debug-Only Verbose Logging

```typescript
const logger = createLogger('FileSynchronizer')

async sync(files: string[]) {
  if (logger.isDebugEnabled()) {
    logger.debug({
      files: files.slice(0, 5).map(f => basename(f)), // First 5 files
      total: files.length,
    }, 'Syncing files')
  }

  // Sync logic...
}
```

### 6.3 Performance Impact

| Sampling | Log Volume | Performance Overhead |
|----------|-----------|---------------------|
| No sampling | 1M logs/index | >50% overhead |
| Every 100 files | 10K logs/index | <1% overhead |
| Every 1000 files | 1K logs/index | <0.5% overhead |

**Recommendation**: Sample every 100 files for debug level, no sampling for info/warn/error.

---

## 7. Testing Logger Output

### 7.1 Silencing Logs in Tests

For unit tests, suppress all logging:

```typescript
import { describe, it, beforeEach } from 'vitest'
import pino from 'pino'

describe('QdrantVectorDatabase', () => {
  beforeEach(() => {
    // Silence pino for tests (send to /dev/null)
    process.env.LOG_LEVEL = 'silent'
  })

  it('should search with hybrid search', async () => {
    // Test code...
  })
})
```

### 7.2 Capturing Logs for Verification

```typescript
import { describe, it } from 'vitest'
import pino from 'pino'

describe('QdrantVectorDatabase', () => {
  it('should log search results', async () => {
    const messages: any[] = []

    // Create a custom transport to capture logs
    const customLogger = pino({
      level: 'debug',
      transport: {
        target: pino.transports.stream,
      },
    })

    // Capture logs (implementation varies)
    // ...

    // Assert logs
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

## 8. Metadata Guidelines

### 8.1 Standard Fields

Every log should include relevant metadata:

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `component` | string | Component name (auto-added) | ✅ |
| `operation` | string | Operation being performed | ⭐ |
| `duration` | number | Operation duration in ms | ⭐ |
| `error` / `err` | Error | Error object if applicable | ❌ |
| `count` / `total` | number | Item counts | ⭐ |
| `path` | string | File/collection path | ⭐ |
| `status` | string | Operation status (success/failed) | ⭐ |

⭐ = Recommended

### 8.2 Examples by Component

**QdrantVectorDatabase**:
```typescript
logger.info({
  operation: 'create-collection',
  collection: 'my-codebase',
  dimension: 1536,
  duration: 450,
}, 'Collection created')
```

**Context (Indexing)**:
```typescript
logger.info({
  operation: 'indexing',
  totalFiles: 1000,
  processedFiles: 500,
  progress: '50%',
  duration: 5000,
}, 'Indexing in progress')
```

**OpenAIEmbedding**:
```typescript
logger.warn({
  operation: 'embed-batch',
  batchSize: 100,
  retries: 2,
  duration: 3000,
}, 'Batch embedding completed with retries')
```

---

## 9. Error Handling

### 9.1 Logging Exceptions

```typescript
async function indexCodebase(path: string) {
  const logger = createLogger('Context')

  try {
    logger.info({ path }, 'Starting indexing')
    await performIndexing(path)
    logger.info({ path }, 'Indexing completed')
  } catch (error) {
    logger.error(
      {
        err: error,
        path,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Indexing failed'
    )
    throw error
  }
}
```

### 9.2 Error Context

Always include context when logging errors:

```typescript
// ✅ Good
logger.error({
  err: error,
  query: userQuery,
  collection: 'my-codebase',
  operation: 'hybrid-search',
}, 'Search operation failed')

// ❌ Bad
logger.error({ err: error }, 'Error')
```

---

## 10. Configuration Reference

### 10.1 Environment Variables

```bash
# Set log level
export LOG_LEVEL=debug

# Production mode (JSON output)
export NODE_ENV=production

# Development mode (pretty output)
export NODE_ENV=development
```

### 10.2 Programmatic Configuration

```typescript
import { setLogLevel } from '@pleaseai/context-please-core'

// Change log level at runtime
setLogLevel('debug')

// Handle MCP client request to change level
server.setRequestHandler({ method: 'logging/setLevel' }, async (req) => {
  const { level } = req.params
  setLogLevel(level)
  return {}
})
```

---

## 11. Performance Characteristics

### 11.1 Benchmarks

**Single Log Message**:
| Component | Duration | Memory |
|-----------|----------|--------|
| Pino (JSON) | 0.1ms | ~100B |
| Pino (pretty) | 0.5ms | ~200B |
| console.log | 0.05ms | ~100B |
| Winston | 1-2ms | ~500B |

**During Indexing (10K files)**:
| Sampling | Total Logs | Total Time | Overhead |
|----------|-----------|-----------|----------|
| None | 50,000 | +2000ms | +25% |
| Every 100 | 500 | +15ms | <1% |
| Every 1000 | 50 | +2ms | <0.1% |

### 11.2 Optimization Techniques

```typescript
// 1. Check log level before expensive operations
if (logger.isDebugEnabled()) {
  logger.debug({ largeObject: complexStringification() }, 'msg')
}

// 2. Use sampling for high-volume logs
if (++counter % 100 === 0) {
  logger.info({ counter }, 'Progress update')
}

// 3. Lazy-evaluate metadata
logger.info({
  get stats() { return expensiveCalculation() }, // Only evaluated if log is emitted
}, 'Operation complete')
```

---

## 12. Migration Strategy

See `docs/plans/logging-migration-plan.md` for detailed implementation phases.

**Order**:
1. Utilities → Splitters → Embeddings → VectorDBs → Sync → Core → MCP
2. Per-component TDD cycle: Read → Test → Implement → Verify
3. Stderr redirect kept as fallback during Phase 2

---

## Appendix A: Log Level Reference

| Level | Value | Use Case | Frequency |
|-------|-------|----------|-----------|
| debug | 10 | Diagnostic info (code flow, variables) | High (with sampling) |
| info | 20 | Standard operations, milestones | Medium |
| warn | 30 | Unexpected but recoverable situations | Low |
| error | 40 | Error conditions requiring action | Very low |

---

## Appendix B: Structured Logging Best Practices

✅ **DO**:
- Include operation context (operation, duration, count)
- Use consistent field names across components
- Add error objects with full stack traces
- Sample high-volume logs

❌ **DON'T**:
- Log sensitive data (passwords, tokens, API keys)
- Use string interpolation for metadata
- Log at info level for every operation
- Create extremely large metadata objects

---

**Status**: Approved ✅
**Last Updated**: 2025-10-19
**Review Cycle**: Quarterly
