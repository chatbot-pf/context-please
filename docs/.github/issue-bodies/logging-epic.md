# [Epic] Replace console.log with MCP-compliant Pino logging system

## Overview

Replace 400+ `console.log/warn/error` calls across the codebase with structured Pino logging to achieve full MCP (Model Context Protocol) compliance and enable dynamic log level control.

**Issue**: See original issue #14 for context and discussion.

## Problem Summary

- ❌ 400+ console.* calls violate MCP JSON-RPC protocol
- ❌ Console output on stdout corrupts protocol message stream
- ❌ No structured logging for debugging/monitoring
- ❌ No way for MCP clients to control log verbosity
- ❌ Temporary workaround in place (stderr redirect) doesn't scale

## Solution

Implement three-phase migration to Pino-based structured logging:
1. **Phase 1 (Foundation)**: Logger infrastructure (2-3 days)
2. **Phase 2 (Migration)**: Replace console.* calls (5-7 days)
3. **Phase 3 (Verification)**: Cleanup and MCP compliance testing (2-3 days)

## Success Criteria

✅ **Functional**:
- 400+ console.* calls replaced with Pino logging
- MCP `logging/setLevel` handler working
- Structured metadata on all logs
- Log sampling for high-volume operations

✅ **Quality**:
- 0 console.* calls in production code (verified by grep)
- 100% of tests passing
- <5% performance overhead (with sampling)
- Full MCP protocol compliance

✅ **Documentation**:
- `docs/develop/LOGGING.md` complete with examples
- ADR created and approved
- Specification documented
- Migration plan documented

## Related Documentation

- **ADR**: `docs/architecture/adr/001-pino-logging-system.md` - Architecture decision and rationale
- **Specification**: `docs/specifications/logging-system.md` - Technical design and implementation
- **Plan**: `docs/plans/logging-migration-plan.md` - Detailed migration strategy
- **1-Pagers**:
  - `docs/plans/problem-1pagers/phase1-foundation.md`
  - `docs/plans/problem-1pagers/phase2-migration.md`
  - `docs/plans/problem-1pagers/phase3-verification.md`
- **Guide**: `docs/develop/LOGGING.md` - Developer guide with examples

## Timeline & Phases

### Phase 1: Foundation (2-3 days)
- Add Pino dependencies
- Create logger factory (`createLogger()`)
- Enable MCP `logging/setLevel` capability
- Create unit tests (8+ tests)
- Document logging guidelines

**Outcome**: Ready for Phase 2 migration

### Phase 2: Migration (5-7 days)
- Replace 400+ console.* calls systematically
- Add structured metadata to all logs
- Implement log sampling for high-volume operations
- Verify all tests pass (0 regressions)

**Outcome**: 400+ console.* → 0 (verified by grep)

### Phase 3: Verification (2-3 days)
- Remove stderr redirect workaround
- Verify MCP protocol compliance
- Integration test with real MCP clients
- Performance benchmarking
- Close issue #14

**Outcome**: Production-ready logging system

## Deliverables

### Phase 1
- [ ] Pino logger infrastructure (`packages/core/src/utils/logger.ts`)
- [ ] MCP `logging/setLevel` handler
- [ ] Unit tests (8+ tests)
- [ ] Developer guide (`docs/develop/LOGGING.md`)
- [ ] PR #XXX merged

### Phase 2
- [ ] All console.* calls replaced (~15 PRs)
- [ ] Structured metadata on all logs
- [ ] Log sampling implemented
- [ ] All tests passing (100%)
- [ ] PRs #XXX-#YYY merged

### Phase 3
- [ ] Stderr redirect removed
- [ ] MCP compliance verified
- [ ] Performance benchmarks documented
- [ ] Issue #14 closed
- [ ] PR #ZZZ merged

## Metrics

| Metric | Target | Status |
|--------|--------|--------|
| console.* calls removed | 400+ → 0 | Pending |
| PRs created | 12-19 total | Pending |
| Tests passing | 100% | Pending |
| Performance overhead | <5% | Pending |
| MCP compliance | Full | Pending |

## Effort Estimate

- **Total**: 9-13 days (3 weeks)
- **Phase 1**: 2-3 days (1 developer)
- **Phase 2**: 5-7 days (can parallelize)
- **Phase 3**: 2-3 days (1 developer)

## Acceptance Criteria

- [x] Documentation complete (ADR, spec, plan, 1-pagers, guide)
- [ ] Phase 1 PRs merged
- [ ] Phase 2 PRs merged
- [ ] Phase 3 PRs merged
- [ ] Issue #14 closed with summary

## Related Issues

- Issue #14: Replace console.log with MCP-compliant logging system (original issue)

## Labels

- `epic`
- `enhancement`
- `priority:high`
- `logging`
- `mcp`

## Assignees

- TBD (assign Phase leads)

## References

- [MCP Logging Tutorial](https://www.mcpevals.io/blog/mcp-logging-tutorial)
- [MCP Protocol Spec](https://modelcontextprotocol.io/)
- [Pino Documentation](https://getpino.io/)
- [RFC 5424 - Syslog Protocol](https://tools.ietf.org/html/rfc5424)

---

**Status**: Approved ✅
**Created**: 2025-10-19
**Last Updated**: 2025-10-19

This epic tracks the complete logging system migration from issue #14. See sub-issues for individual phase work.
