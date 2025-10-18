# chore: Finalize MCP logging migration - remove workarounds and verify compliance

**Related Epic**: [Epic] Replace console.log with MCP-compliant Pino logging system
**Phase**: Phase 3 of 3 (Verification)
**Duration**: 2-3 days
**Type**: Chore

## Problem

Phase 2 has successfully migrated all 400+ console.* calls to Pino logging. Now we need to:
- ❌ Remove the stderr redirect workaround (now redundant)
- ❌ Formally verify MCP protocol compliance
- ❌ Benchmark performance to ensure <5% overhead
- ❌ Close issue #14 with complete summary

## Solution

Complete the logging migration by:
1. Removing stderr redirect workaround (dead code)
2. Verifying zero console.* calls (grep + code review)
3. Integration testing with real MCP clients
4. Performance benchmarking
5. Final documentation updates
6. Closing issue #14

## Detailed Plan

See: `docs/plans/problem-1pagers/phase3-verification.md`

## Tasks

### 1. Remove Stderr Redirect Workaround (30 min)
**File**: `packages/mcp/src/index.ts`

- [ ] Delete lines 3-31 (stderr redirect block)
- [ ] Delete unused variables: `originalConsoleLog`, `originalConsoleWarn`
- [ ] Update top comment to explain Pino handling
- [ ] Verify no references to removed code
- [ ] Run: `pnpm typecheck:mcp` ✅
- [ ] Run: `pnpm test:integration:*` ✅

**Commit**: `refactor(mcp): remove stderr redirect workaround (Pino handles it)`

### 2. Verify Zero Console.* Calls (15 min)
- [ ] Run: `grep -r "console\." packages/core/src packages/mcp/src --include="*.ts" | wc -l`
- [ ] Result should be: **0**
- [ ] Cross-check 5 key files manually
- [ ] Document results with screenshot/log

**Commit**: `chore: verify zero console.* calls in production code`

### 3. Write MCP Compliance Tests (1 hour)
**File**: `packages/mcp/test/integration/mcp-protocol-compliance.integration.test.ts` (NEW)

- [ ] Test `logging/setLevel` request handling
- [ ] Test structured JSON log output
- [ ] Test stderr-only output (not stdout)
- [ ] Test log level changes propagate correctly
- [ ] Add 8+ test cases total

**Commit**: `test(mcp): add MCP protocol compliance integration tests`

### 4. Performance Benchmarking (1-2 hours)
**File**: `scripts/benchmark-logging.js` (NEW)

- [ ] Create benchmark script
- [ ] Generate test codebase (1000 files)
- [ ] Measure indexing time with Pino logging
- [ ] Calculate overhead per file
- [ ] Verify <5% overhead target met
- [ ] Document results

**Expected Results**:
- Total time: ~10-15 seconds
- Per-file overhead: <15ms
- Overall overhead: <5%

**Commit**: `perf(core): benchmark logging overhead - verify <5% target`

### 5. Update Documentation (1 hour)

#### 5.1 Update `docs/develop/LOGGING.md`
- [ ] Add section: "MCP Protocol Compliance"
- [ ] Add `logging/setLevel` example usage
- [ ] Update performance characteristics table
- [ ] Add troubleshooting section for common issues

#### 5.2 Update `docs/README.md`
- [ ] Add link to `docs/develop/LOGGING.md`
- [ ] Update logging system status (Complete ✅)
- [ ] Reference issue #14 resolution

#### 5.3 Update `CLAUDE.md`
- [ ] Remove references to stderr redirect workaround
- [ ] Confirm logging standards (already added in Phase 1)
- [ ] Add performance notes

#### 5.4 Create Implementation Summary (NEW)
**File**: `docs/plans/logging-implementation-summary.md`

- [ ] Document timeline (3 phases, 9-13 days)
- [ ] List all changes and files modified
- [ ] Document results and metrics
- [ ] Include learnings and best practices

**Commits**:
- `docs: update LOGGING.md with MCP compliance section`
- `docs: update documentation references and status`
- `docs: create logging implementation summary`

### 6. Close Issue #14 (15 min)
- [ ] Create GitHub comment with implementation summary
- [ ] Link to all PRs created (Phase 1, Phase 2, Phase 3)
- [ ] Link to documentation (ADR, spec, plan, guide)
- [ ] Close issue #14 with status "Complete ✅"

**Commit**: `docs: close issue #14 with implementation summary`

## Acceptance Criteria

### Functional
- [x] Stderr redirect workaround completely removed
- [x] MCP `logging/setLevel` handler working
- [x] All logs going to stderr (not stdout)
- [x] No console.* in production code

### Quality
- [x] 0 console.* calls (verified by grep)
- [x] 100% tests passing
- [x] Zero TypeScript errors
- [x] Linter clean (no warnings)

### Performance
- [x] <5% overhead on indexing (verified by benchmark)
- [x] <15ms per file processing
- [x] <500KB memory overhead
- [x] No memory leaks

### Documentation
- [x] LOGGING.md complete with MCP section
- [x] README.md links added
- [x] Implementation summary created
- [x] Issue #14 closed with details

## Definition of Done

✅ **Code**:
- Workaround removed (dead code)
- No console.* calls remaining
- All tests passing

✅ **Testing**:
- MCP compliance tests passing
- Integration tests passing
- Performance benchmarks documented

✅ **Quality**:
- TypeScript passes
- Linter clean
- Conventional commit format

✅ **Verification**:
- Grep: 0 console.* calls
- Benchmark: <5% overhead verified
- Issue #14 closed

## Verification Checklist

### Code Verification
- [ ] Removed stderr redirect (lines 22-31 gone)
- [ ] No orphaned variables
- [ ] Comments updated
- [ ] No other console.* in mcp/src

### Testing Verification
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] MCP compliance tests passing
- [ ] Performance within target

### Documentation Verification
- [ ] LOGGING.md complete
- [ ] README.md links work
- [ ] Implementation summary accurate
- [ ] All cross-references valid

### Issue Closure
- [ ] Issue #14 has resolution comment
- [ ] Links to PRs included
- [ ] Links to docs included
- [ ] Issue marked as closed

## Related Links

- **Problem 1-Pager**: `docs/plans/problem-1pagers/phase3-verification.md`
- **Migration Plan**: `docs/plans/logging-migration-plan.md`
- **Developer Guide**: `docs/develop/LOGGING.md`
- **Specification**: `docs/specifications/logging-system.md`
- **ADR**: `docs/architecture/adr/001-pino-logging-system.md`
- **Issue #14**: Original issue

## Dependencies

**Blocked By**: Phase 2 (Migration) ✅ Must be complete
**Enables**: Clean logging infrastructure for future development
**Completes**: Issue #14 resolution

## Effort Estimate

- **Estimated**: 2-3 days (1 developer)
- **Per-Task**: 30 min - 2 hours
- **Total**: ~5 hours active work + review cycles

## Success Metrics

After Phase 3:
- ✅ Zero console.* in production (verified by grep)
- ✅ Stderr redirect removed (clean code)
- ✅ MCP protocol compliance verified
- ✅ Performance benchmarks: <5% overhead ✅
- ✅ Issue #14 closed and documented
- ✅ Team ready to use structured logging

## PR Template

```markdown
## Description

Complete MCP logging migration with verification and cleanup (Phase 3 of issue #14).

Removes stderr redirect workaround, verifies zero console.* calls, confirms MCP protocol compliance, and benchmarks performance.

## Type of Change

- [ ] New feature
- [x] Bug fix (removes workaround code)
- [ ] Breaking change
- [x] Documentation update

## Changes

- Removed stderr redirect workaround from MCP server
- Added MCP protocol compliance integration tests
- Added performance benchmarking script
- Updated logging documentation with MCP section
- Documented implementation summary

## Testing

- [x] MCP compliance tests passing (8+ tests)
- [x] All existing tests passing
- [x] `pnpm typecheck:mcp` passes
- [x] `pnpm lint:fix` passes
- [x] Performance benchmark: <5% overhead ✅

## Verification

- [x] Grep: 0 console.* calls (verified)
- [x] MCP protocol compliance verified
- [x] Performance: <5% overhead (benchmarked)
- [x] No regressions (all tests passing)

## Closes

Closes #14
```

## Next Steps (After Phase 3)

→ **Logging System Complete** ✅

The structured logging system is now:
- ✅ Production-ready
- ✅ MCP-compliant
- ✅ Well-documented
- ✅ Performance-validated

**Future Enhancements** (out of scope for issue #14):
- [ ] Log aggregation and shipping
- [ ] Enhanced metrics and tracing
- [ ] Performance optimization beyond sampling
- [ ] Distributed tracing support

---

**Status**: Blocked by Phase 2 (pending completion)
**Created**: 2025-10-19
**Phase**: 3 of 3 (Final)

Start after Phase 2 is merged. This phase closes issue #14 upon completion.
