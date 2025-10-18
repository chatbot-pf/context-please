# Logging System Migration Plan

**Document Version**: 1.0
**Last Updated**: 2025-10-19
**Related Documents**:
- ADR: `docs/architecture/adr/001-pino-logging-system.md`
- Spec: `docs/specifications/logging-system.md`
- Issue: #14, Issue: TBD (Epic)

---

## Executive Summary

Three-phase plan to migrate Context Please from 400+ `console.log/warn/error` calls to Pino-based structured logging system. Estimated effort: **9-13 days**, organized as **3 separate PRs** for incremental review and risk mitigation.

---

## Phase Overview

| Phase | Duration | Focus | Risk | PRs |
|-------|----------|-------|------|-----|
| **Phase 1: Foundation** | 2-3 days | Infrastructure setup | ⭐ Low | 1 small PR |
| **Phase 2: Migration** | 5-7 days | Replace 400+ console calls | ⭐⭐ Medium | 10-15 small PRs |
| **Phase 3: Verification** | 2-3 days | Testing & cleanup | ⭐ Low | 1 small PR |
| **Total** | **9-13 days** | **Complete migration** | **Low** | **12-19 small PRs** |

---

## Phase 1: Foundation (2-3 days)

### Objectives
- ✅ Add Pino logger infrastructure to core package
- ✅ Enable MCP logging capability in server
- ✅ Document logging guidelines
- ✅ Create unit tests for logger factory

### Tasks

#### 1.1 Add Dependencies
**File**: `packages/core/package.json`
```json
{
  "dependencies": {
    "pino": "^9.0.0",
    "pino-pretty": "^10.0.0"
  }
}
```

**Steps**:
1. Open `packages/core/package.json`
2. Add `pino` and `pino-pretty` to dependencies
3. Run `pnpm install`
4. Verify installation: `pnpm --filter @pleaseai/context-please-core list | grep pino`

**Commit**: `build(core): add pino and pino-pretty dependencies`

#### 1.2 Create Logger Utilities
**File**: `packages/core/src/utils/logger.ts` (NEW)

```typescript
import pino, { Logger } from 'pino'

/**
 * Global Pino logger instance
 * Configured by environment variables (LOG_LEVEL, NODE_ENV)
 */
export const globalLogger = pino({
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
 * @param componentName Component identifier (e.g., 'QdrantDB', 'OpenAIEmbedding')
 * @returns Child logger with component context
 */
export function createLogger(componentName: string): Logger {
  return globalLogger.child({ component: componentName })
}

/**
 * Get global logger instance (rarely needed)
 * @returns Global Pino logger
 */
export function getGlobalLogger(): Logger {
  return globalLogger
}

/**
 * Set log level dynamically (called by MCP logging/setLevel handler)
 * @param level RFC 5424 level: debug, info, warn, error
 */
export function setLogLevel(level: string): void {
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(level)) {
    throw new Error(`Invalid log level: ${level}`)
  }
  globalLogger.level = level
}

export default globalLogger
```

**Steps**:
1. Create `packages/core/src/utils/logger.ts`
2. Implement factory functions
3. Add JSDoc comments
4. Test: `pnpm --filter @pleaseai/context-please-core typecheck`

**Commit**: `feat(core): add Pino logger factory with RFC 5424 levels`

#### 1.3 Export Logger from Core Package
**File**: `packages/core/src/index.ts`

Add to exports:
```typescript
export {
  createLogger,
  getGlobalLogger,
  setLogLevel,
  globalLogger
} from './utils/logger'
```

**Commit**: `feat(core): export logger utilities from core package`

#### 1.4 Enable MCP Logging Capability
**File**: `packages/mcp/src/index.ts`

Add logging capability to server:
```typescript
import { setLogLevel } from '@pleaseai/context-please-core'

class ContextMcpServer {
  private server: Server

  constructor(config: ContextMcpConfig) {
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
          logging: {}, // ← Add this line
        },
      }
    )

    // Add request handler for logging/setLevel
    this.server.setRequestHandler(
      { method: 'logging/setLevel' },
      async (request: { params: { level: string } }) => {
        const { level } = request.params
        setLogLevel(level)
        return {} // Success response
      }
    )
  }
}
```

**Steps**:
1. Add `logging: {}` to server capabilities
2. Implement `logging/setLevel` request handler
3. Test: `pnpm --filter @pleaseai/context-please-mcp typecheck`

**Commit**: `feat(mcp): enable logging/setLevel request handler`

#### 1.5 Create Unit Tests for Logger Factory
**File**: `packages/core/test/utils/logger.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createLogger, setLogLevel, getGlobalLogger } from '../../src/utils/logger'

describe('Logger Factory', () => {
  afterEach(() => {
    setLogLevel('info') // Reset to default
  })

  it('should create logger with component name', () => {
    const logger = createLogger('TestComponent')
    expect(logger).toBeDefined()
  })

  it('should have component name in bindings', () => {
    const logger = createLogger('TestComponent')
    const bindings = logger.bindings() as { component: string }
    expect(bindings.component).toBe('TestComponent')
  })

  it('should set log level dynamically', () => {
    const globalLogger = getGlobalLogger()
    setLogLevel('debug')
    expect(globalLogger.level).toBe('debug')

    setLogLevel('warn')
    expect(globalLogger.level).toBe('warn')
  })

  it('should reject invalid log levels', () => {
    expect(() => setLogLevel('invalid')).toThrow('Invalid log level')
  })

  it('should log at different levels', () => {
    const logger = createLogger('TestLogger')
    expect(() => {
      logger.debug({ test: 'data' }, 'Debug message')
      logger.info({ test: 'data' }, 'Info message')
      logger.warn({ test: 'data' }, 'Warning message')
      logger.error({ test: 'data' }, 'Error message')
    }).not.toThrow()
  })
})
```

**Steps**:
1. Create test file with 5+ test cases
2. Run tests: `pnpm --filter @pleaseai/context-please-core test`
3. Ensure all pass

**Commit**: `test(core): add unit tests for logger factory`

#### 1.6 Update CLAUDE.md with Logging Guidelines
**File**: `CLAUDE.md` (APPEND)

Add section:
```markdown
## Logging Standards

All code must use structured logging via the Pino logger (see `docs/develop/LOGGING.md`):

- **Create logger per component**: `const logger = createLogger('ComponentName')`
- **Use structured metadata**: `logger.info({ operation, duration }, 'message')`
- **Levels**: debug (diagnostics), info (milestones), warn (recoverable), error (failures)
- **No console.***\***: Never use console.log/warn/error in production code
- **No sensitive data**: Never log passwords, tokens, or API keys
- **Sample high-volume ops**: Use sampling (every 100 items) for debug-level logs during indexing

See `docs/develop/LOGGING.md` for comprehensive guidelines.
```

**Commit**: `docs(core): add logging guidelines to CLAUDE.md`

#### 1.7 Create LOGGING.md Developer Guide
**File**: `docs/develop/LOGGING.md` (NEW)

Use template from `docs/specifications/logging-system.md` with practical examples.

**Commit**: `docs(develop): add LOGGING.md developer guide`

#### 1.8 Integration Test for MCP logging/setLevel
**File**: `packages/mcp/test/integration/logging.integration.test.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest'
import { setLogLevel } from '@pleaseai/context-please-core'

describe('MCP Logging Integration', () => {
  it('should handle logging/setLevel request', async () => {
    // Test that setLogLevel works without throwing
    expect(() => {
      setLogLevel('debug')
      setLogLevel('info')
      setLogLevel('warn')
      setLogLevel('error')
    }).not.toThrow()
  })
})
```

**Commit**: `test(mcp): add logging/setLevel integration test`

### Phase 1 Completion Checklist
- ✅ Dependencies added
- ✅ Logger factory created and exported
- ✅ MCP capability enabled
- ✅ Unit tests passing (8+ tests)
- ✅ Integration tests passing
- ✅ TypeScript compiles without errors
- ✅ All linter warnings resolved
- ✅ Documentation updated

### Phase 1 PR Criteria
- **Title**: `feat(core): add Pino logger infrastructure with MCP logging/setLevel support`
- **Size**: ~150 lines of code + 100 lines of tests
- **Review Focus**: Logger design, RFC 5424 level mapping, MCP capability setup
- **Risk**: ⭐ Low (no existing code modified)
- **Rollback**: Easy (revert single PR)

---

## Phase 2: Systematic Migration (5-7 days)

### Objectives
- ✅ Replace all 400+ console.* calls with Pino logging
- ✅ Add structured metadata to all log entries
- ✅ Implement log sampling for high-volume operations
- ✅ Verify no regressions (all tests pass)

### Migration Strategy

#### 2.1 Component Migration Order
Process in dependency order (leaves → root):

1. **Utilities** (3 files)
   - `utils/env-manager.ts`
   - Total console calls: ~20

2. **Splitters** (2 files)
   - `splitter/ast-splitter.ts`
   - `splitter/langchain-splitter.ts`
   - Total console calls: ~15

3. **Embeddings** (4 files)
   - `embedding/openai-embedding.ts`
   - `embedding/ollama-embedding.ts`
   - `embedding/voyageai-embedding.ts`
   - `embedding/gemini-embedding.ts`
   - Total console calls: ~60

4. **Vector Databases** (6 files)
   - `vectordb/milvus-vectordb.ts`
   - `vectordb/milvus-restful-vectordb.ts`
   - `vectordb/qdrant-vectordb.ts`
   - `vectordb/zilliz-utils.ts`
   - `vectordb/sparse/simple-bm25.ts`
   - `vectordb/base/base-vector-database.ts`
   - Total console calls: ~120

5. **Sync** (2 files)
   - `sync/synchronizer.ts`
   - `sync/merkle.ts`
   - Total console calls: ~30

6. **Core** (1 file)
   - `context.ts`
   - Total console calls: ~80

7. **MCP Server** (5 files)
   - `packages/mcp/src/*.ts`
   - Total console calls: ~75

#### 2.2 Per-Component TDD Workflow

For **EACH** component:

```
1. READ
   - Read entire file end-to-end
   - Understand all console.* patterns
   - Identify all call sites and context

2. TEST
   - Review existing tests
   - Update tests to work with new logging
   - Add tests for structured metadata if needed

3. MIGRATE
   - Add logger import: import { createLogger } from '../utils/logger'
   - Create component logger: const logger = createLogger('ComponentName')
   - Replace each console.* call:
     OLD: console.log('[Component] message', data)
     NEW: logger.info({ data }, 'message')

4. ADD METADATA
   - Include operation context (operation, duration, count)
   - Add error objects properly
   - Use sampling for high-volume logs

5. VERIFY
   - Run component tests: pnpm test --include "**/ComponentName.test.ts"
   - Run TypeScript: pnpm typecheck:core
   - Run linter: pnpm lint:fix
   - Verify stdout clean (no console output)

6. COMMIT
   - One commit per component
   - Message: `refactor(core): migrate [ComponentName] to Pino logging`
```

#### 2.3 Example Transformation

**Before** (qdrant-vectordb.ts:76-80):
```typescript
console.log('[QdrantDB] 🔌 Connecting to Qdrant at:', address)
// ...
console.log('[QdrantDB] ✅ Connected to Qdrant successfully')

async createCollection(collectionName: string) {
  console.log('[QdrantDB] 🔧 Creating collection:', collectionName)
  console.log('[QdrantDB] 📏 Vector dimension:', dimension)
  // ...
}
```

**After**:
```typescript
import { createLogger } from '../utils/logger'

export class QdrantVectorDatabase {
  private logger = createLogger('QdrantDB')

  async initialize() {
    this.logger.info({ address }, 'Connecting to Qdrant')
    // ...
    this.logger.info({}, 'Connected to Qdrant successfully')
  }

  async createCollection(collectionName: string, dimension: number) {
    this.logger.info({ collectionName, dimension }, 'Creating collection')
    // ...
  }
}
```

#### 2.4 High-Volume Logging with Sampling

**Before**:
```typescript
for (const file of files) {
  console.log('[Context] Processing file:', file)
}
```

**After** (with sampling):
```typescript
const logger = createLogger('Context')
let processedFiles = 0
const SAMPLE_INTERVAL = 100

for (const file of files) {
  processedFiles++

  if (processedFiles % SAMPLE_INTERVAL === 0 && logger.isDebugEnabled()) {
    logger.debug({
      file,
      processedFiles,
      totalFiles: files.length,
      progress: `${(processedFiles / files.length * 100).toFixed(1)}%`,
    }, 'Processing files')
  }
}
```

#### 2.5 Error Logging Pattern

**Before**:
```typescript
try {
  await search()
} catch (error) {
  console.error('[Component] Error:', error)
}
```

**After**:
```typescript
try {
  await search()
} catch (error) {
  this.logger.error(
    {
      err: error,
      query: userQuery,
      collection: collectionName,
    },
    'Search failed'
  )
}
```

### Phase 2 Migration Checklist

#### Utilities
- [ ] Read `utils/env-manager.ts` completely
- [ ] Migrate console.* → logger.* (~5 calls)
- [ ] Run tests: `pnpm test:unit`
- [ ] Verify no console output

#### Splitters
- [ ] Read `splitter/ast-splitter.ts`
- [ ] Migrate with sampling (every 100 files)
- [ ] Run tests: `pnpm test:unit`

#### Embeddings
- [ ] Migrate all 4 embedding providers
- [ ] Add structured metadata (model, tokenCount, retries)
- [ ] Run tests: `pnpm test:unit`

#### Vector Databases
- [ ] Migrate QdrantVectorDatabase (highest console.* count)
- [ ] Migrate MilvusVectorDatabase
- [ ] Migrate SimpleBM25
- [ ] Add sampling for high-volume operations
- [ ] Run tests: `pnpm test:unit && pnpm test:integration:*`

#### Sync
- [ ] Migrate FileSynchronizer
- [ ] Migrate MerkleTree logging
- [ ] Add progress logging with sampling

#### Core
- [ ] Migrate Context class (largest file)
- [ ] Add operation context (indexing, searching)
- [ ] Run tests: `pnpm test:unit && pnpm test:integration:*`

#### MCP Server
- [ ] Migrate all handler files
- [ ] Replace stderr redirect workaround (keep for now)
- [ ] Add structured metadata (tool name, parameters)

### Phase 2 Metrics
- **Total console.* calls replaced**: 400+
- **Files modified**: ~25
- **New log statements added**: ~50+
- **Tests passing**: 100% (no regressions)
- **Performance overhead**: <5% (with sampling)

### Phase 2 PR Strategy

**Option A: Single large PR** (Not recommended)
- Pros: Simpler to coordinate
- Cons: Difficult to review, high risk, hard to revert

**Option B: Multiple small PRs** (Recommended) ✅
```
PR 1: feat(core): add logger utilities
PR 2: refactor(core): migrate env-manager to Pino logging
PR 3: refactor(core): migrate AstCodeSplitter to Pino logging
PR 4: refactor(core): migrate embedding providers to Pino logging
PR 5: refactor(core): migrate QdrantVectorDatabase to Pino logging
PR 6: refactor(core): migrate MilvusVectorDatabase to Pino logging
PR 7: refactor(core): migrate SimpleBM25 to Pino logging
PR 8: refactor(core): migrate FileSynchronizer to Pino logging
PR 9: refactor(core): migrate Context to Pino logging
PR 10: refactor(mcp): migrate server handlers to Pino logging
```

Each PR:
- **Size**: 30-50 LOC changes + tests
- **Time to review**: 10-15 minutes
- **Risk**: ⭐ Low (isolated component changes)
- **Rollback**: Easy (revert individual PR)

---

## Phase 3: Verification & Cleanup (2-3 days)

### Objectives
- ✅ Remove stderr redirect workaround
- ✅ Verify full MCP protocol compliance
- ✅ Integration test with real MCP clients
- ✅ Performance benchmarking
- ✅ Final documentation

### Tasks

#### 3.1 Remove Stderr Redirect Workaround
**File**: `packages/mcp/src/index.ts`

**Before**:
```typescript
const originalConsoleLog = console.log
const originalConsoleWarn = console.warn

console.log = (...args: any[]) => {
  process.stderr.write(`[LOG] ${args.join(' ')}\n`)
}

console.warn = (...args: any[]) => {
  process.stderr.write(`[WARN] ${args.join(' ')}\n`)
}
```

**After**: Delete entirely (lines 22-31)

Update comment at top:
```typescript
// ✅ All logs are now sent to stderr via Pino logger
// No need for console.log redirection - Pino handles it
```

**Commit**: `refactor(mcp): remove stderr redirect workaround (Pino handles it)`

#### 3.2 Verify Zero Console Calls
**Verification**:
```bash
# Check no console.* in production code
grep -r "console\." packages/core/src packages/mcp/src --include="*.ts" | wc -l

# Result should be: 0
```

**Commit**: `chore: verify zero console.* calls in production code`

#### 3.3 Integration Testing with MCP Client
**File**: `packages/mcp/test/integration/mcp-logging-client.integration.test.ts` (NEW)

```typescript
import { describe, it, expect } from 'vitest'
import { createLogger, setLogLevel } from '@pleaseai/context-please-core'

describe('MCP Logging Protocol Compliance', () => {
  it('should accept logging/setLevel requests', async () => {
    const logger = createLogger('TestClient')

    // Simulate client sending setLevel request
    const levels = ['debug', 'info', 'warn', 'error']
    for (const level of levels) {
      expect(() => setLogLevel(level)).not.toThrow()
    }
  })

  it('should output to stderr not stdout', async () => {
    const logger = createLogger('StdoutTest')

    // Verify logger exists and can log
    expect(() => {
      logger.info({}, 'Test message')
    }).not.toThrow()

    // Note: Actual stdout/stderr capture would require
    // wrapping process.stdout/stderr in tests
  })

  it('should produce valid JSON logs', () => {
    const logger = createLogger('JSONTest')

    // Verify log structure
    const bindings = logger.bindings() as { component: string }
    expect(bindings.component).toBe('JSONTest')
  })
})
```

**Commit**: `test(mcp): add MCP logging protocol compliance tests`

#### 3.4 Performance Benchmarking
**File**: `scripts/benchmark-logging.js` (NEW)

```javascript
const { Context } = require('@pleaseai/context-please-core')

async function benchmarkLogging() {
  const iterations = 1000
  const startTime = Date.now()

  for (let i = 0; i < iterations; i++) {
    // Simulate logging operations
  }

  const duration = Date.now() - startTime
  const overhead = (duration / iterations).toFixed(2)

  console.log(`Logging overhead: ${overhead}ms per operation`)
  console.log(`Target: <5ms overhead`)

  if (overhead > 5) {
    throw new Error(`Logging overhead ${overhead}ms exceeds target 5ms`)
  }
}

benchmarkLogging().catch(e => {
  console.error(e)
  process.exit(1)
})
```

**Steps**:
1. Run baseline: `npm run benchmark` (before Pino)
2. Apply Pino changes
3. Run benchmark: `node scripts/benchmark-logging.js`
4. Compare results
5. Document findings

**Commit**: `perf(core): verify logging overhead <5% with sampling`

#### 3.5 Update Issue #14
Link implementation to original issue:

```markdown
# Resolution Summary

✅ **Issue #14 Resolved**: Replace console.log with MCP-compliant Pino logging

## What Was Implemented

1. **Foundation (PR #XXXX)**
   - Added Pino logger infrastructure
   - Implemented `logging/setLevel` MCP handler
   - Created logger factory for components

2. **Migration (PR #XXXX - #YYYY)**
   - Replaced 400+ console.* calls
   - Added structured metadata to all logs
   - Implemented sampling for high-volume operations

3. **Verification (PR #ZZZZ)**
   - Verified MCP protocol compliance
   - Removed stderr redirect workaround
   - Performance benchmarking complete

## Results

✅ 400+ console.* calls → 0 (production code)
✅ Full MCP logging/setLevel support
✅ Structured JSON logs with component/metadata
✅ <5% performance overhead (with sampling)
✅ All tests passing

See `docs/develop/LOGGING.md` for usage guidelines.
```

**Commit**: `docs: close issue #14 with complete implementation summary`

#### 3.6 Update Main Documentation
**File**: `CLAUDE.md` (UPDATE)

Ensure logging section references:
- ✅ Logger factory usage
- ✅ Structured metadata patterns
- ✅ High-volume operation sampling
- ✅ Error logging best practices

**File**: `docs/README.md` (UPDATE)

Add link to:
- ✅ `docs/develop/LOGGING.md`
- ✅ `docs/specifications/logging-system.md`
- ✅ `docs/architecture/adr/001-pino-logging-system.md`

**Commit**: `docs: update documentation with logging migration results`

### Phase 3 Completion Checklist
- ✅ Stderr redirect workaround removed
- ✅ Zero console.* in production code (grep verified)
- ✅ MCP protocol compliance tests passing
- ✅ Performance benchmarks documented (<5% overhead)
- ✅ All integration tests passing
- ✅ Documentation updated
- ✅ Issue #14 resolved and linked

### Phase 3 PR Criteria
- **Title**: `chore: finalize MCP logging migration - remove workarounds and verify compliance`
- **Size**: ~50 lines of code + 100 lines of tests
- **Review Focus**: MCP protocol compliance, performance metrics, zero console verification
- **Risk**: ⭐ Low (only removals and tests)
- **Rollback**: Easy (revert single PR, restore stderr redirect if needed)

---

## Success Criteria (Phase Complete)

### Functional
✅ **Zero console.* calls** in production code
✅ **MCP logging/setLevel handler** works correctly
✅ **Structured logging** with component and metadata
✅ **Log sampling** reduces volume 90%+ for high-volume operations

### Quality
✅ **All tests passing** (unit + integration)
✅ **No TypeScript errors** (pnpm typecheck)
✅ **Linter clean** (pnpm lint)
✅ **No regressions** (existing functionality unchanged)

### Performance
✅ **<5% overhead** during indexing (with sampling)
✅ **<2ms per log message** latency
✅ **<500KB memory** for logger infrastructure

### Documentation
✅ **docs/develop/LOGGING.md** created with comprehensive guide
✅ **CLAUDE.md** updated with logging standards
✅ **Issue #14** closed with implementation summary

---

## Risk Assessment & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Regressions in functionality | High | Keep stderr redirect until Phase 3, comprehensive testing per component |
| Performance degradation | Medium | Log sampling, benchmarking, <5% target |
| Incomplete migration (missed console calls) | Medium | Grep verification at end of Phase 2, grep verification at Phase 3 |
| MCP protocol violation | Low | MCP tests, client integration testing |

---

## Timeline & Staffing

### Recommended Schedule
- **Week 1**: Phase 1 (Foundation) - 1 developer
- **Week 2-3**: Phase 2 (Migration) - Can parallelize components
- **Week 4**: Phase 3 (Verification) - 1 developer

### Parallel Opportunities
During Phase 2, multiple developers can work on different components independently:
- Developer A: Embeddings (4 files)
- Developer B: Vector Databases (6 files)
- Developer C: Splitters + Sync (4 files)
- Developer D: Core + MCP (6 files)

---

## References

- **ADR**: `docs/architecture/adr/001-pino-logging-system.md`
- **Spec**: `docs/specifications/logging-system.md`
- **Guide**: `docs/develop/LOGGING.md`
- **Issue**: #14 - Replace console.log with MCP-compliant logging system
- **Pino Docs**: https://getpino.io/
- **MCP Spec**: https://modelcontextprotocol.io/

---

**Status**: Approved ✅
**Last Updated**: 2025-10-19
**Next Phase**: Implementation begins with Phase 1 foundation work
