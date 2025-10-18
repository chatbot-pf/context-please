# Problem 1-Pager: Phase 2 - Migration

**Epic**: Issue #14 - Replace console.log with MCP-compliant Pino logging system
**Phase**: 2 of 3
**Duration**: 5-7 days
**Size**: 10-15 small PRs (~30-50 LOC per PR)
**Blocked By**: Phase 1 (Foundation)

---

## Context

Phase 1 has established the Pino logger infrastructure. Now Phase 2 replaces 400+ direct `console.log/warn/error` calls throughout the codebase with structured Pino logging. Each component will be migrated independently following TDD cycle.

**Current State**:
- ✅ Logger factory ready (`createLogger('ComponentName')`)
- ✅ MCP logging/setLevel handler active
- ✅ stderr redirect workaround still present (safety net)
- ❌ 400+ console.* calls still in production code

**Target State**:
- ✅ 0 console.* calls in production code
- ✅ All logging via structured Pino
- ✅ Structured metadata on all logs
- ✅ Log sampling for high-volume operations
- ✅ Stderr redirect still present (removed in Phase 3)

---

## Problem

**What needs to change?**
- Replace all 400+ console.* calls with `logger.*` equivalents
- Add structured metadata (operation, duration, count, etc.)
- Implement sampling for high-volume operations (e.g., indexing)
- Ensure zero regressions (all tests passing)

**Why systematic approach?**
- 400+ calls at once = high risk of regressions
- One component at a time = easy to review and test
- Can parallelize between developers
- Enables incremental validation

**Why TDD for each component?**
- Tests verify behavior unchanged
- Refactoring done safely (test → refactor → verify)
- Catches mistakes early
- Documents expected logging output

---

## Goal

**Replace all console.* calls with structured Pino logging** by migrating components systematically:

1. Utilities (3 files, ~20 calls)
2. Splitters (2 files, ~15 calls)
3. Embeddings (4 files, ~60 calls)
4. Vector Databases (6 files, ~120 calls)
5. Sync (2 files, ~30 calls)
6. Core Context (1 file, ~80 calls)
7. MCP Server (5 files, ~75 calls)

**Success = 400+ console.* calls → 0 (production code)**

---

## Non-Goals

- ❌ Remove stderr redirect (done in Phase 3)
- ❌ Add new logging features beyond structured metadata
- ❌ Performance optimization beyond sampling
- ❌ Change API of existing components

---

## Constraints

1. **Per-component approach**: Migrate in dependency order (leaves → root)
2. **TDD cycle**: Read → Test → Migrate → Verify → Commit
3. **Small PRs**: Each PR <50 LOC changes (easy to review)
4. **100% test coverage**: All tests pass before commit
5. **Zero regressions**: Existing behavior unchanged
6. **Structured metadata**: All logs include operation context

---

## Solution Summary

### Migration Order (Dependency Tree)

```
Utilities
  ↓
Splitters, Embeddings
  ↓
Vector Databases, Sparse Search
  ↓
Sync
  ↓
Core Context
  ↓
MCP Server
```

### Per-Component TDD Workflow

```
1. READ: Entire file + all call sites
2. TEST: Review existing tests, ensure coverage
3. MIGRATE: Replace console.* with logger.* + metadata
4. SAMPLE: Implement sampling for high-volume logs
5. VERIFY: Tests pass, typecheck, linter clean
6. COMMIT: One commit per component
```

### Example Transformation

**Before**:
```typescript
console.log('[QdrantDB] 🔌 Connecting to Qdrant at:', address)
```

**After**:
```typescript
const logger = createLogger('QdrantDB')
logger.info({ address }, 'Connecting to Qdrant')
```

### Structured Metadata Pattern

```typescript
// Every log includes relevant context
logger.info({
  operation: 'hybrid-search',        // What operation?
  resultCount: 100,                  // Key metrics
  duration: 245,                     // How long?
  collection: 'my-codebase',         // Which resource?
}, 'Search completed')               // What happened?
```

### High-Volume Sampling Pattern

```typescript
// Avoid log explosion during indexing
let processedFiles = 0
const SAMPLE_INTERVAL = 100

for (const file of files) {
  processedFiles++

  if (processedFiles % SAMPLE_INTERVAL === 0) {
    logger.debug({
      processedFiles,
      totalFiles,
      progress: `${(processedFiles / totalFiles * 100).toFixed(1)}%`,
    }, 'Processing files')
  }
}
```

---

## Deliverables

### Code Changes (10-15 PRs)
1. ✅ Utilities (env-manager) - PR 1
2. ✅ Splitters (ast-splitter, langchain-splitter) - PR 2
3. ✅ Embeddings (openai, ollama, voyageai, gemini) - PR 3-5
4. ✅ Vector DBs (milvus, qdrant, bm25, zilliz-utils) - PR 6-9
5. ✅ Sync (synchronizer, merkle) - PR 10-11
6. ✅ Core (context.ts) - PR 12
7. ✅ MCP Server (handlers) - PR 13-15

### Tests
- ✅ All existing tests pass (100% passing rate)
- ✅ No new test failures introduced
- ✅ Coverage maintained or improved

### Verification
- ✅ `grep -r "console\." packages/core/src packages/mcp/src` returns 0
- ✅ `pnpm typecheck:core` passes
- ✅ `pnpm typecheck:mcp` passes
- ✅ `pnpm lint:fix` passes

---

## Acceptance Criteria

### Functional
- [ ] 0 console.* calls in `packages/core/src/` (verified by grep)
- [ ] 0 console.* calls in `packages/mcp/src/` (verified by grep)
- [ ] All loggers use `createLogger()` factory
- [ ] All log statements include structured metadata

### Quality
- [ ] 100% of unit tests passing
- [ ] 100% of integration tests passing
- [ ] Zero TypeScript errors
- [ ] Linter clean (no warnings)
- [ ] No regressions in existing functionality

### Structure
- [ ] Each component migrated in single commit
- [ ] Commit messages follow conventional format
- [ ] All PRs follow project standards
- [ ] Documentation updated for logging

### Performance
- [ ] Log sampling prevents >1% overhead on indexing
- [ ] Memory overhead <500KB for logger infrastructure
- [ ] No degradation vs Phase 1 baseline

---

## Migration Tasks

### 1. Utilities Migration (4-6 hours)
**Files**: `env-manager.ts`
- [ ] Read entire file
- [ ] Identify ~20 console.* calls
- [ ] Add logger import and factory
- [ ] Replace calls with `logger.info/warn/error`
- [ ] Run tests: `pnpm test:unit`
- [ ] Commit: `refactor(core): migrate env-manager to Pino logging`

### 2. Splitters Migration (6-8 hours)
**Files**: `ast-splitter.ts`, `langchain-splitter.ts`
- [ ] Migrate AST splitter (~8 calls)
- [ ] Migrate LangChain splitter (~7 calls)
- [ ] Add sampling for file processing
- [ ] 2 commits: one per splitter

### 3. Embeddings Migration (10-14 hours)
**Files**: 4 embedding provider files
- [ ] Migrate OpenAI embedding (~15 calls)
- [ ] Migrate Ollama embedding (~15 calls)
- [ ] Migrate VoyageAI embedding (~15 calls)
- [ ] Migrate Gemini embedding (~15 calls)
- [ ] Add metadata: model, tokenCount, retries
- [ ] 4 commits: one per provider

### 4. Vector DBs Migration (16-24 hours)
**Files**: `qdrant-vectordb.ts`, `milvus-vectordb.ts`, `milvus-restful-vectordb.ts`, `simple-bm25.ts`, `zilliz-utils.ts`
- [ ] Migrate Qdrant DB (~30 calls)
- [ ] Migrate Milvus DB (~40 calls)
- [ ] Migrate Milvus Restful (~20 calls)
- [ ] Migrate SimpleBM25 (~20 calls)
- [ ] Add sampling for collection operations
- [ ] 5 commits: one per component

### 5. Sync Migration (4-6 hours)
**Files**: `synchronizer.ts`, `merkle.ts`
- [ ] Migrate FileSynchronizer (~20 calls)
- [ ] Migrate Merkle tree (~10 calls)
- [ ] Add progress logging with sampling
- [ ] 2 commits: one per component

### 6. Core Context Migration (8-12 hours)
**Files**: `context.ts`
- [ ] Migrate main Context class (~80 calls)
- [ ] Add operation context (indexing, searching)
- [ ] Implement sampling for large operations
- [ ] 1 commit: `refactor(core): migrate Context to Pino logging`

### 7. MCP Server Migration (8-12 hours)
**Files**: `packages/mcp/src/` handler files
- [ ] Migrate MCP server index (~25 calls)
- [ ] Migrate tool handlers (~50 calls)
- [ ] Add tool name and parameter metadata
- [ ] 3-5 commits: logical grouping

---

## Per-Component Workflow

### Step 1: Read (30 min - 1 hour)
```bash
# Read entire file to understand:
# - All console.* usage patterns
# - Context of each call
# - Related logic and dependencies
# - Test coverage
```

### Step 2: Test (15-30 min)
```bash
# Review existing tests
pnpm test --include "**/ComponentName.test.ts"

# Ensure tests pass before changes
# Verify test coverage adequate
```

### Step 3: Migrate (45 min - 2 hours)
```typescript
// 1. Add import
import { createLogger } from '../utils/logger'

// 2. Create component logger
const logger = createLogger('ComponentName')

// 3. Replace each console call
// OLD: console.log('[Comp] message:', data)
// NEW: logger.info({ data }, 'message')
```

### Step 4: Add Metadata (15-30 min)
```typescript
// Include context for each operation
logger.info({
  operation: 'search',     // What?
  duration: 245,           // How long?
  resultCount: 100,        // Key metrics?
  collection: 'my-code',   // Which resource?
}, 'Search completed')     // What happened?
```

### Step 5: Verify (15-30 min)
```bash
# Run component tests
pnpm test --include "**/ComponentName.test.ts"

# Verify no console output
grep -r "console\." packages/core/src/ComponentName.ts

# TypeScript check
pnpm typecheck:core

# Linter
pnpm lint:fix
```

### Step 6: Commit (5 min)
```bash
# Commit with conventional format
git commit -m "refactor(core): migrate ComponentName to Pino logging"

# Verify commit follows standards
# - Conventional format (type/scope/message)
# - <100 char message
# - No secrets
# - Single logical unit
```

---

## Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Missed console.* calls | Medium | Grep verification at end of Phase 2 and Phase 3 |
| Test failures | Medium | TDD workflow, run all tests before commit |
| Regressions | Medium | Stderr redirect still present as safety net |
| Performance degradation | Low | Log sampling, benchmarking |
| High context switching | Low | Suggest 1-2 components per developer per day |

---

## Parallelization Strategy

Multiple developers can work on different components simultaneously:

**Developer 1**: Utilities + Splitters (3-4 days)
**Developer 2**: Embeddings (4-5 days)
**Developer 3**: Vector DBs (5-6 days)
**Developer 4**: Sync + Core + MCP (5-6 days)

**Synchronization points**:
- Phase 1 complete before Phase 2 starts
- Daily sync on blockers
- All tests must pass before merge

---

## Success Metrics

After Phase 2 completes:
- ✅ 400+ console.* calls → 0 (grep verified)
- ✅ 100% of tests passing
- ✅ All commits follow conventional format
- ✅ Structured logging in place throughout codebase
- ✅ Log sampling implemented for high-volume ops
- ✅ Ready for Phase 3 verification

---

## Timeline

| Component | Duration | Est. PRs |
|-----------|----------|----------|
| Utilities | 1 day | 1 |
| Splitters | 1 day | 1 |
| Embeddings | 1-2 days | 2-3 |
| Vector DBs | 2-3 days | 3-4 |
| Sync | 1 day | 1 |
| Core | 1-2 days | 1 |
| MCP | 1-2 days | 2-3 |
| **Total** | **5-7 days** | **12-15 PRs** |

---

## PR Template (Per Component)

```markdown
## Description

Migrate [ComponentName] to Pino structured logging as part of issue #14.

Replaces console.* calls with structured Pino logging:
- Added component-specific logger via createLogger()
- Converted console.* calls to logger.info/warn/error
- Added structured metadata: operation, duration, count, etc.
- Implemented log sampling for [high-volume operations if applicable]

## Changes

- Replaced X console.* calls with Pino logging
- Added structured metadata to all logs
- Implemented sampling for high-volume operations

## Testing

- [x] All tests passing (pnpm test:unit)
- [x] TypeScript clean (pnpm typecheck:core)
- [x] Linter clean (pnpm lint:fix)
- [x] No regressions

## Related Issue

Part of #14 - Phase 2: Migration
```

---

## Definition of Done (Per Component)

✅ Code:
- [ ] All console.* calls replaced
- [ ] Structured metadata added
- [ ] Sampling implemented (if applicable)

✅ Testing:
- [ ] All tests passing
- [ ] No new test failures
- [ ] Coverage maintained

✅ Quality:
- [ ] TypeScript passes
- [ ] Linter clean
- [ ] Conventional commit format

✅ Verification:
- [ ] Component-specific grep: 0 console.* calls
- [ ] `pnpm typecheck:core` passes
- [ ] Related tests all passing

---

## Dependencies & Blockers

**Blocked By**: Phase 1 (Foundation) ← must be complete
**Enables**: Phase 3 (Verification)
**Critical Path**: Vector DBs (most console.* calls, longest phase)

---

## Next Steps (After Phase 2)

→ **Phase 3: Verification & Cleanup**
- Remove stderr redirect workaround
- Verify MCP protocol compliance
- Integration testing with real MCP clients
- Performance benchmarking
- Close issue #14
- Estimated: 2-3 days

---

**Status**: Ready for Implementation (after Phase 1) ✅
**Last Updated**: 2025-10-19
**Related Documents**:
- Plan: `docs/plans/logging-migration-plan.md`
- Guide: `docs/develop/LOGGING.md`
