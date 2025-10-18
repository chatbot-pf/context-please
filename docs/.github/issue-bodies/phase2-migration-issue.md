# refactor(core): Migrate all console.* calls to Pino structured logging

**Related Epic**: [Epic] Replace console.log with MCP-compliant Pino logging system
**Phase**: Phase 2 of 3 (Migration)
**Duration**: 5-7 days
**Type**: Refactoring

## Problem

Phase 1 established the Pino logger infrastructure. Now we need to replace 400+ direct `console.log/warn/error` calls throughout the codebase with structured Pino logging to achieve:
- ✅ MCP protocol compliance
- ✅ Structured logging for debugging
- ✅ Zero console.* in production code

## Solution

Systematically migrate components from console.* to Pino logging:
1. Migrate in dependency order (utilities → core → MCP)
2. Use TDD workflow for each component
3. Add structured metadata to all logs
4. Implement sampling for high-volume operations
5. Verify 100% test passing after each component

## Detailed Plan

See: `docs/plans/problem-1pagers/phase2-migration.md`

## Component Migration Order

**Utilities** (1-2 PRs)
- [ ] env-manager.ts (~20 console.* calls)

**Splitters** (1-2 PRs)
- [ ] ast-splitter.ts (~8 console.* calls)
- [ ] langchain-splitter.ts (~7 console.* calls)

**Embeddings** (2-3 PRs)
- [ ] openai-embedding.ts (~15 console.* calls)
- [ ] ollama-embedding.ts (~15 console.* calls)
- [ ] voyageai-embedding.ts (~15 console.* calls)
- [ ] gemini-embedding.ts (~15 console.* calls)

**Vector Databases** (3-4 PRs)
- [ ] qdrant-vectordb.ts (~30 console.* calls)
- [ ] milvus-vectordb.ts (~40 console.* calls)
- [ ] milvus-restful-vectordb.ts (~20 console.* calls)
- [ ] simple-bm25.ts (~20 console.* calls)
- [ ] zilliz-utils.ts (~10 console.* calls)

**Sync** (1-2 PRs)
- [ ] synchronizer.ts (~20 console.* calls)
- [ ] merkle.ts (~10 console.* calls)

**Core** (1 PR)
- [ ] context.ts (~80 console.* calls)

**MCP Server** (2-3 PRs)
- [ ] index.ts (~25 console.* calls)
- [ ] handlers.ts (~50 console.* calls)

## Per-Component Workflow

For each component:

1. **Read** (30-60 min)
   - Read entire file end-to-end
   - Understand all console.* patterns and context
   - Identify test coverage

2. **Test** (15-30 min)
   - Review existing tests
   - Run tests: `pnpm test --include "**/ComponentName.test.ts"`
   - Ensure tests pass before changes

3. **Migrate** (45 min - 2 hours)
   - Add logger import: `import { createLogger } from '../utils/logger'`
   - Create logger: `const logger = createLogger('ComponentName')`
   - Replace each console.* call:
     - `console.log('[Comp] msg:', data)` → `logger.info({ data }, 'msg')`
     - `console.warn('[Comp] msg')` → `logger.warn({}, 'msg')`
     - `console.error('[Comp] msg', err)` → `logger.error({ err }, 'msg')`

4. **Add Metadata** (15-30 min)
   - Include operation context: `{ operation, duration, count }`
   - Add component-specific fields
   - Verify metadata is useful for debugging

5. **Implement Sampling** (15-30 min, if applicable)
   - High-volume operations (indexing, searching)
   - Sample every 100-1000 items
   - Prevent log explosion

6. **Verify** (15-30 min)
   - Run component tests: `pnpm test --include "**/ComponentName.test.ts"`
   - Run typecheck: `pnpm typecheck:core`
   - Run linter: `pnpm lint:fix`
   - Verify no console.* calls: `grep "console\." packages/core/src/ComponentName.ts`

7. **Commit** (5 min)
   - Format: `refactor(core): migrate ComponentName to Pino logging`
   - One component per commit
   - Follow conventional format

## Tasks

### Utilities Migration (1-2 PRs, 1 day)
- [ ] Read `utils/env-manager.ts` completely
- [ ] Migrate console.* → logger.* (~20 calls)
- [ ] Update tests if needed
- [ ] Run: `pnpm test:unit`, `pnpm typecheck:core`, `pnpm lint:fix`
- [ ] Commit: `refactor(core): migrate env-manager to Pino logging`

### Splitters Migration (1-2 PRs, 1 day)
- [ ] Read ast-splitter.ts
- [ ] Migrate with sampling (every 100 files)
- [ ] Commit: `refactor(core): migrate AstCodeSplitter to Pino logging`
- [ ] Migrate langchain-splitter.ts
- [ ] Commit: `refactor(core): migrate LangChainCodeSplitter to Pino logging`

### Embeddings Migration (2-3 PRs, 1-2 days)
- [ ] Migrate openai-embedding.ts
- [ ] Migrate ollama-embedding.ts
- [ ] Migrate voyageai-embedding.ts
- [ ] Migrate gemini-embedding.ts
- [ ] Add metadata: model, tokenCount, retries
- [ ] One commit per provider

### Vector DBs Migration (3-4 PRs, 2-3 days)
- [ ] Migrate qdrant-vectordb.ts (30+ calls - largest)
- [ ] Migrate milvus-vectordb.ts (40+ calls)
- [ ] Migrate milvus-restful-vectordb.ts (20+ calls)
- [ ] Migrate simple-bm25.ts (20+ calls)
- [ ] Add sampling for collection operations
- [ ] One commit per component

### Sync Migration (1-2 PRs, 1 day)
- [ ] Migrate synchronizer.ts
- [ ] Migrate merkle.ts
- [ ] Add progress logging with sampling
- [ ] One commit per component

### Core Context Migration (1 PR, 1-2 days)
- [ ] Migrate context.ts (80+ calls - largest)
- [ ] Add operation context (indexing, searching)
- [ ] Implement sampling for large operations
- [ ] Commit: `refactor(core): migrate Context to Pino logging`

### MCP Server Migration (2-3 PRs, 1-2 days)
- [ ] Migrate index.ts
- [ ] Migrate handler files
- [ ] Add tool name and parameter metadata
- [ ] Keep stderr redirect for now (removed in Phase 3)

### Final Verification (End of Phase 2)
- [ ] Grep verification: `grep -r "console\." packages/core/src packages/mcp/src` → 0 results
- [ ] Run: `pnpm typecheck:core && pnpm typecheck:mcp` ✅
- [ ] Run: `pnpm test:unit && pnpm test:integration:*` ✅ (100% passing)
- [ ] Run: `pnpm lint:fix` ✅

## Acceptance Criteria

### Functional
- [x] 0 console.* calls in `packages/core/src/` (verified by grep)
- [x] 0 console.* calls in `packages/mcp/src/` (verified by grep)
- [x] All loggers use `createLogger()` factory
- [x] All logs include structured metadata
- [x] Stderr redirect still present (safety net for Phase 2)

### Quality
- [x] 100% unit tests passing
- [x] 100% integration tests passing
- [x] Zero TypeScript errors
- [x] Linter clean (no warnings)
- [x] No regressions (existing behavior unchanged)

### Metrics
- [x] 400+ console.* calls → 0
- [x] ~25 files migrated
- [x] ~15 PRs created
- [x] 100% test passing rate
- [x] <1% performance overhead (due to sampling)

## Definition of Done (Per Component)

✅ **Code**:
- Console.* calls replaced
- Structured metadata added
- Sampling implemented (if applicable)

✅ **Testing**:
- All tests passing
- No new test failures
- Coverage maintained

✅ **Quality**:
- TypeScript passes
- Linter clean
- Conventional commit format

✅ **Verification**:
- Component grep: 0 console.* calls
- TypeScript: `pnpm typecheck:core`
- Tests: All passing

## PR Template (Per Component)

```markdown
## Description

Migrate [ComponentName] to Pino structured logging (Phase 2 of issue #14).

Replaces X console.* calls with structured Pino logging:
- Added component-specific logger via createLogger()
- Converted console.* to logger.info/warn/error
- Added structured metadata: operation, duration, count, etc.
- [Implemented log sampling for high-volume operations if applicable]

## Changes

- Replaced X console.* calls with Pino logging
- Added structured metadata (operation, duration, etc.)

## Testing

- [x] All tests passing (pnpm test:unit)
- [x] TypeScript clean (pnpm typecheck:core)
- [x] Linter clean (pnpm lint:fix)
- [x] No regressions

## Related Issue

Part of #14 - Phase 2: Systematic Migration
Related to Epic: [Epic] Replace console.log...
```

## Related Links

- **Problem 1-Pager**: `docs/plans/problem-1pagers/phase2-migration.md`
- **Migration Plan**: `docs/plans/logging-migration-plan.md`
- **Developer Guide**: `docs/develop/LOGGING.md`
- **ADR**: `docs/architecture/adr/001-pino-logging-system.md`

## Dependencies

**Blocked By**: Phase 1 (Foundation) ✅ Must be complete
**Blocks**: Phase 3 (Verification)
**Related**: Issue #14, Epic

## Effort Estimate

- **Phase**: 5-7 days (can parallelize components)
- **Per-Component**: 4-8 hours
- **Total PRs**: 10-15 small PRs (<50 LOC each)

## Success Metrics

After Phase 2:
- ✅ 400+ console.* calls → 0 (grep verified)
- ✅ All tests passing (100%)
- ✅ Structured logging in place throughout
- ✅ Log sampling preventing overhead
- ✅ Ready for Phase 3 verification

## Parallelization

Multiple developers can work on different components:
- **Developer 1**: Utilities + Splitters (3-4 days)
- **Developer 2**: Embeddings (4-5 days)
- **Developer 3**: Vector DBs (5-6 days)
- **Developer 4**: Sync + Core + MCP (5-6 days)

Daily sync on blockers, all tests must pass before merge.

---

**Status**: Blocked by Phase 1 (pending completion)
**Created**: 2025-10-19
**Phase**: 2 of 3

Start after Phase 1 is merged. Proceed to Phase 3 after all components migrated.
