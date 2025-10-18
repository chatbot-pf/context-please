# feat(core): Add Pino logger infrastructure and MCP logging/setLevel support

**Related Epic**: [Epic] Replace console.log with MCP-compliant Pino logging system
**Phase**: Phase 1 of 3 (Foundation)
**Duration**: 2-3 days
**Type**: Enhancement

## Problem

The Context Please system has 400+ direct `console.log/warn/error` calls that:
- ❌ Violate MCP (Model Context Protocol) JSON-RPC specification
- ❌ Provide no structured logging for debugging
- ❌ Give MCP clients no way to control log levels
- ❌ Require a temporary stderr redirect workaround

This phase establishes the foundation for a three-phase migration to Pino-based structured logging.

## Solution

Establish Pino logger infrastructure that enables:
1. Component-specific structured logging
2. MCP `logging/setLevel` dynamic control
3. RFC 5424 compliant log levels (debug/info/warn/error)
4. Pathway for Phase 2 systematic console.* replacement

## Detailed Plan

See: `docs/plans/problem-1pagers/phase1-foundation.md`

## Tasks

### 1. Add Dependencies
- [ ] Add `pino` to `packages/core/package.json`
- [ ] Add `pino-pretty` to `packages/core/package.json`
- [ ] Run `pnpm install` and verify installation

**Commit**: `build(core): add pino and pino-pretty dependencies`

### 2. Create Logger Factory
- [ ] Create `packages/core/src/utils/logger.ts`
- [ ] Implement global Pino instance
- [ ] Implement `createLogger(componentName)` factory
- [ ] Implement `setLogLevel(level)` function
- [ ] Implement `getGlobalLogger()` function
- [ ] Add environment variable support (LOG_LEVEL, NODE_ENV)

**Commit**: `feat(core): add Pino logger factory with RFC 5424 levels`

### 3. Export Logger from Core
- [ ] Update `packages/core/src/index.ts`
- [ ] Export `createLogger`, `setLogLevel`, `getGlobalLogger`

**Commit**: `feat(core): export logger utilities from core package`

### 4. Enable MCP Logging Capability
- [ ] Add `logging: {}` capability to MCP server
- [ ] Implement `logging/setLevel` request handler in `packages/mcp/src/index.ts`
- [ ] Import and use `setLogLevel` from core

**Commit**: `feat(mcp): implement logging/setLevel request handler`

### 5. Create Unit Tests
- [ ] Create `packages/core/test/utils/logger.test.ts`
- [ ] Add 8+ unit test cases:
  - [ ] Logger factory creates child loggers
  - [ ] Component name appears in bindings
  - [ ] Log level changes dynamically
  - [ ] Invalid log levels rejected
  - [ ] All log methods work (debug/info/warn/error)
  - [ ] Environment variable support (LOG_LEVEL)
  - [ ] Development vs production mode
  - [ ] Global logger instance

**Commit**: `test(core): add unit tests for logger factory`

### 6. Create Integration Tests
- [ ] Create `packages/mcp/test/integration/logging.integration.test.ts`
- [ ] Test MCP `logging/setLevel` handler
- [ ] Test level propagation

**Commit**: `test(mcp): add MCP logging integration tests`

### 7. Update Documentation
- [ ] Create `docs/develop/LOGGING.md` with comprehensive developer guide
- [ ] Add logging guidelines section to `CLAUDE.md`
- [ ] Add JSDoc comments to logger functions

**Commits**:
- `docs(develop): add LOGGING.md developer guide`
- `docs: add logging guidelines to CLAUDE.md`

### 8. Verification
- [ ] Run: `pnpm typecheck:core` ✅
- [ ] Run: `pnpm typecheck:mcp` ✅
- [ ] Run: `pnpm test:unit` (all passing) ✅
- [ ] Run: `pnpm lint:fix` (clean) ✅
- [ ] Verify no console.* in logger code

**Commit**: `chore: verify Phase 1 foundation complete`

## Acceptance Criteria

### Functional
- [x] `createLogger()` factory works
- [x] `setLogLevel()` dynamic control works
- [x] MCP `logging: {}` capability enabled
- [x] `logging/setLevel` handler responds correctly
- [x] No breaking changes to existing API

### Quality
- [x] 8+ unit tests passing
- [x] 2+ integration tests passing
- [x] Zero TypeScript errors
- [x] Linter clean (no warnings)
- [x] No existing code modified

### Documentation
- [x] `docs/develop/LOGGING.md` complete with examples
- [x] CLAUDE.md updated with logging standards
- [x] JSDoc comments on all functions
- [x] README/docs reference LOGGING.md

### Performance
- [x] Logger factory creation <1ms
- [x] Single log message <2ms
- [x] Memory overhead <500KB

## Definition of Done

✅ **Code**:
- Logger factory created and tested
- MCP capability enabled
- No breaking changes

✅ **Tests**:
- All unit tests passing
- All integration tests passing
- 100% passing rate

✅ **Quality**:
- TypeScript clean
- Linter clean
- Conventional commit format

✅ **Documentation**:
- LOGGING.md complete
- Code comments added
- CLAUDE.md updated

## Related Links

- **Problem 1-Pager**: `docs/plans/problem-1pagers/phase1-foundation.md`
- **ADR**: `docs/architecture/adr/001-pino-logging-system.md`
- **Specification**: `docs/specifications/logging-system.md`
- **Migration Plan**: `docs/plans/logging-migration-plan.md`

## Dependencies

**Blocked By**: None (first phase)
**Blocks**: Phase 2 (Migration)
**Related**: Issue #14

## Effort Estimate

- **Estimated**: 2-3 days (1 developer)
- **Actual**: TBD (update during implementation)

## Success Metrics

- ✅ Logger infrastructure production-ready
- ✅ MCP logging/setLevel working
- ✅ Team ready for Phase 2 migration
- ✅ Documentation complete

---

**Status**: Ready for implementation
**Created**: 2025-10-19
**Phase**: 1 of 3

This is the foundation phase. Once complete, proceed to Phase 2 (Migration).
