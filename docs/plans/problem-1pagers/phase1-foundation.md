# Problem 1-Pager: Phase 1 - Foundation

**Epic**: Issue #14 - Replace console.log with MCP-compliant Pino logging system
**Phase**: 1 of 3
**Duration**: 2-3 days
**Size**: 1 small PR (~150 LOC + 100 tests)

---

## Context

The current Context Please system uses 400+ direct `console.log/warn/error` calls throughout `packages/core/src/` and `packages/mcp/src/`. These calls violate the MCP (Model Context Protocol) specification, which requires:

- Clean stdout for JSON-RPC protocol messages only
- Structured logging via `notifications/message`
- Dynamic log level control via `logging/setLevel` request
- RFC 5424 compliant log levels (debug, info, warn, error)

Currently, there's a temporary workaround in `packages/mcp/src/index.ts` (lines 22-31) that redirects console output to stderr, but this:
- ❌ Scales poorly for large codebases
- ❌ Provides no structured logging
- ❌ Lacks log level control
- ❌ Makes debugging difficult

---

## Problem

**What's broken?**
- MCP protocol violated by console output on stdout
- No way for MCP clients to control log verbosity
- No structured logging for debugging/monitoring
- Difficult to trace operations across components

**Why does it matter?**
- MCP clients (Claude Code CLI) cannot use console output safely
- Enterprise deployments need centralized log aggregation
- Large indexing operations generate overwhelming unstructured output
- Impossible to debug production issues without structured context

**What's the pain?**
- Users cannot control log levels in Claude Code CLI
- Engineers spend time parsing unstructured console output
- Performance suffers from 400+ console calls during indexing
- Scaling to enterprise use cases blocked by logging issues

---

## Goal

**Establish Pino logger infrastructure that enables:**
1. Component-specific structured logging
2. MCP protocol compliance (logging/setLevel handler)
3. Foundation for systematic console.* replacement
4. Pathway to <5% performance overhead with log sampling

**Success = Foundation is in place and tested**, ready for Phase 2 migration.

---

## Non-Goals

- ❌ Replace existing console.* calls (that's Phase 2)
- ❌ Implement log aggregation or shipping
- ❌ Add performance optimizations beyond infrastructure
- ❌ Change MCP server capabilities beyond logging

---

## Constraints

1. **No existing code modification**: Ensure backward compatibility during Phase 1
2. **stderr output only**: Keep stdout clean for MCP JSON-RPC
3. **Small PR**: <200 LOC changes for easy review
4. **Zero breaking changes**: Existing functionality unchanged
5. **New dependency**: Pino must be lightweight (<10KB gzipped)

---

## Solution Summary

### Architecture (3-Layer)

```
MCP Server
  ↓ (controls log level)
Logger Factory (createLogger)
  ↓ (creates component loggers)
Pino Core (JSON serialization, stderr output)
```

### Key Components

1. **Logger Factory** (`packages/core/src/utils/logger.ts`)
   - Global Pino instance
   - Component-specific child loggers
   - RFC 5424 log level support

2. **MCP Integration** (`packages/mcp/src/index.ts`)
   - `logging: {}` capability enabled
   - `logging/setLevel` request handler
   - Dynamic level control

3. **Unit Tests** (`packages/core/test/utils/logger.test.ts`)
   - Logger factory tests
   - Level change tests
   - Component logger tests

### Why Pino?

| Criteria | Pino | Winston | Bunyan |
|----------|------|---------|--------|
| Performance | ⭐⭐⭐⭐⭐ Fastest | ⭐⭐⭐ Slower | ⭐⭐⭐ Slower |
| JSON Output | ⭐⭐⭐⭐⭐ Native | ⭐⭐⭐ Good | ⭐⭐⭐⭐ Good |
| Bundle Size | ⭐⭐⭐⭐⭐ 5KB | ⭐⭐ 50KB | ⭐⭐ 40KB |
| TypeScript | ⭐⭐⭐⭐⭐ First-class | ⭐⭐⭐ Good | ⭐⭐ Basic |

Selected: **Pino** ✅ (best performance, smallest bundle, active maintenance)

---

## Deliverables

### Code
- ✅ `packages/core/src/utils/logger.ts` - Logger factory
- ✅ `packages/core/src/index.ts` - Export logger utilities
- ✅ `packages/mcp/src/index.ts` - Add logging capability & handler
- ✅ `packages/core/package.json` - Add Pino dependencies

### Tests
- ✅ `packages/core/test/utils/logger.test.ts` - 8+ unit tests
- ✅ `packages/mcp/test/integration/logging.integration.test.ts` - MCP integration tests

### Documentation
- ✅ `docs/develop/LOGGING.md` - Developer guide (new)
- ✅ `CLAUDE.md` - Logging standards section (updated)
- ✅ Code comments & JSDoc

### Verification
- ✅ `pnpm typecheck:core` passes
- ✅ `pnpm test:unit` passes (100%)
- ✅ `pnpm lint:fix` passes
- ✅ No breaking changes to existing code

---

## Acceptance Criteria

### Functional
- [ ] Logger factory exports `createLogger()`, `setLogLevel()`, `getGlobalLogger()`
- [ ] `createLogger('ComponentName')` returns logger with component binding
- [ ] `setLogLevel('debug'|'info'|'warn'|'error')` works without throwing
- [ ] `logging: {}` capability present in MCP server
- [ ] MCP server responds to `logging/setLevel` requests

### Quality
- [ ] 8+ unit tests all passing
- [ ] 2+ integration tests all passing
- [ ] Zero TypeScript errors
- [ ] Linter clean (no warnings)
- [ ] No existing code modified (backward compatible)

### Documentation
- [ ] `docs/develop/LOGGING.md` complete with examples
- [ ] CLAUDE.md updated with logging guidelines
- [ ] JSDoc comments on all public functions
- [ ] README references logging documentation

### Performance
- [ ] Logger factory creation <1ms
- [ ] Single log message <2ms
- [ ] Memory overhead <500KB

---

## Implementation Tasks

### Task 1: Add Dependencies (15 min)
- [ ] Add `pino` to `packages/core/package.json`
- [ ] Add `pino-pretty` to `packages/core/package.json`
- [ ] Run `pnpm install`

### Task 2: Create Logger Utilities (30 min)
- [ ] Create `packages/core/src/utils/logger.ts`
- [ ] Implement global logger with Pino
- [ ] Implement `createLogger()` factory
- [ ] Implement `setLogLevel()` function
- [ ] Add environment variable support (LOG_LEVEL, NODE_ENV)

### Task 3: Export from Core (10 min)
- [ ] Update `packages/core/src/index.ts`
- [ ] Export logger utilities

### Task 4: Enable MCP Logging (20 min)
- [ ] Add `logging: {}` capability to MCP server
- [ ] Implement `logging/setLevel` request handler
- [ ] Import `setLogLevel` from core

### Task 5: Create Unit Tests (45 min)
- [ ] Create `packages/core/test/utils/logger.test.ts`
- [ ] Test logger factory creation
- [ ] Test component name binding
- [ ] Test log level changes
- [ ] Test invalid log level rejection
- [ ] Test all log methods (debug/info/warn/error)

### Task 6: Create Integration Tests (20 min)
- [ ] Create `packages/mcp/test/integration/logging.integration.test.ts`
- [ ] Test MCP logging/setLevel handler
- [ ] Test level change propagation

### Task 7: Update Documentation (30 min)
- [ ] Create `docs/develop/LOGGING.md` with comprehensive guide
- [ ] Update CLAUDE.md with logging standards
- [ ] Add JSDoc comments throughout

### Task 8: Verification (15 min)
- [ ] Run `pnpm typecheck:core` ✅
- [ ] Run `pnpm test:unit` ✅
- [ ] Run `pnpm lint:fix` ✅
- [ ] Verify no console.* in logger code ✅

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Pino dependency bloat | Medium | Choose Pino (5KB) over Winston (50KB) |
| API incompatibility | Low | Use standard RFC 5424 levels (debug/info/warn/error) |
| MCP protocol issues | Low | Follow MCP spec, write integration tests |
| Learning curve for team | Low | Comprehensive docs, examples in LOGGING.md |

---

## Success Metrics

After Phase 1 completes:
- ✅ Logger factory code complete and tested
- ✅ MCP logging/setLevel working
- ✅ Team familiar with usage patterns
- ✅ Ready to begin Phase 2 systematic migration
- ✅ Zero regressions in existing code

---

## Dependencies & Blockers

**Blockers**: None (foundation task)
**Blocked By**: None (first phase)
**Enables**: Phase 2 (Migration)

---

## Timeline

| Task | Duration | Owner |
|------|----------|-------|
| Setup + Dependencies | 15 min | Developer |
| Logger Utils | 30 min | Developer |
| MCP Integration | 20 min | Developer |
| Tests | 65 min | Developer |
| Documentation | 30 min | Developer |
| Verification | 15 min | Developer |
| **Total** | **~3 hours** | **1 developer** |

**Actual Effort**: 2-3 days (includes review cycles, testing, iteration)

---

## PR Template

```markdown
## Description

Foundation work for issue #14: Replace console.log with MCP-compliant logging.

Adds Pino logger infrastructure to enable systematic replacement of 400+ console.* calls across the codebase. This PR establishes:
- Logger factory pattern for component-specific loggers
- MCP logging/setLevel capability
- Structured logging support
- Foundation for Phase 2 migration

## Type of Change

- [x] New feature (logger infrastructure)
- [ ] Bug fix
- [ ] Breaking change
- [x] Documentation update

## Changes

- Added `pino` and `pino-pretty` dependencies
- Created logger factory in `packages/core/src/utils/logger.ts`
- Enabled MCP `logging: {}` capability and `logging/setLevel` handler
- Added 8+ unit tests and 2+ integration tests
- Created `docs/develop/LOGGING.md` developer guide
- Updated CLAUDE.md with logging standards

## Testing

- [x] Unit tests passing (8 tests)
- [x] Integration tests passing (2 tests)
- [x] `pnpm typecheck:core` passes
- [x] `pnpm lint:fix` passes
- [x] No existing tests broken

## Related Issue

Fixes #14
```

---

## Next Steps (After Phase 1)

→ **Phase 2: Systematic Migration**
- Replace console.* calls systematically by component
- Add structured metadata to all log entries
- Implement log sampling for high-volume operations
- Estimated: 5-7 days

---

**Status**: Ready for Implementation ✅
**Last Updated**: 2025-10-19
**Related Documents**:
- ADR: `docs/architecture/adr/001-pino-logging-system.md`
- Spec: `docs/specifications/logging-system.md`
- Plan: `docs/plans/logging-migration-plan.md`
