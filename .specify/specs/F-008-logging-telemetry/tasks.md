# F-008 Implementation Tasks

**Feature:** ACR Logging, Metrics & Debug Mode
**Status:** TASKS
**Created:** 2026-01-27

## Task List

### Phase 1: Config System Foundation

- [x] **T-001**: Create `src/logging-config.ts` with Zod schema
  - Define `LoggingConfigSchema` with debug, logging, metrics, tier1, tier2 sections
  - All fields have sensible defaults
  - Export `LoggingConfig` type
  - ✅ Completed 2026-01-27: Created with Zod v4 transform pattern for proper nested defaults

- [x] **T-002**: Implement `getLoggingConfig()` function
  - Config path: `~/.config/acr/config.json`
  - Create directory if missing
  - Parse JSON with Zod validation
  - Cache config (load once per process)
  - Write default config on first run
  - ✅ Completed 2026-01-27: Implemented with expandPath(), resetConfigCache(), and graceful error handling

- [x] **T-003**: Export helper functions
  - `isDebugEnabled()` - returns config.debug
  - `debug(...args)` - conditional stderr output
  - `expandPath(p)` - replace ~ with HOME
  - ✅ Completed 2026-01-27: All helpers implemented in logging-config.ts

- [x] **T-004**: Create `tests/logging-config.test.ts`
  - Test default values when no config file
  - Test partial config merging
  - Test validation error handling
  - Test path expansion
  - ✅ Completed 2026-01-27: 30+ tests covering schema, loading, and helpers

### Phase 2: Logger Module

- [x] **T-005**: Create `src/logger.ts` with Logger class
  - Define `QueryLogEntry` interface
  - Constructor loads config
  - ✅ Completed 2026-01-27: Created with TDD approach

- [x] **T-006**: Implement `log(entry)` method
  - Check if logging enabled
  - Expand path
  - Call rotateIfNeeded
  - Append JSONL entry
  - ✅ Completed 2026-01-27: JSONL append with directory creation

- [x] **T-007**: Implement `rotateIfNeeded(path)` method
  - Check file size against maxSize
  - Rotate files: path → path.1, path.1 → path.2, etc.
  - Keep only maxFiles rotated files
  - ✅ Completed 2026-01-27: Full rotation chain with maxFiles limit

- [x] **T-008**: Create `tests/logger.test.ts`
  - Test JSONL writing format
  - Test rotation at maxSize threshold
  - Test maxFiles limit enforcement
  - Test disabled logging no-op
  - ✅ Completed 2026-01-27: 13 tests covering all functionality + getRecentEntries()

### Phase 3: Metrics Module

- [x] **T-009**: Create `src/metrics.ts` with interfaces
  - Define `QueryMetrics` interface
  - Define `MetricsSummary` interface
  - ✅ Completed 2026-01-27: Both interfaces defined with full typing

- [x] **T-010**: Implement `MetricsStore` class constructor
  - Open SQLite at config path
  - Call migrate() on init
  - ✅ Completed 2026-01-27: Using bun:sqlite with auto-directory creation

- [x] **T-011**: Implement `migrate()` method
  - Create queries table with all columns
  - Create indexes on timestamp, query_hash
  - ✅ Completed 2026-01-27: Full schema with 12 columns + 2 indexes

- [x] **T-012**: Implement `record(metrics)` method
  - Check if metrics enabled
  - Insert row with all fields
  - Call cleanup() after insert
  - ✅ Completed 2026-01-27: Prepared statement with null handling

- [x] **T-013**: Implement `cleanup()` method
  - Calculate cutoff from retentionDays
  - Delete records older than cutoff
  - ✅ Completed 2026-01-27: Automatic cleanup on each record()

- [x] **T-014**: Implement `getSummary(days)` method
  - Aggregate query with AVG, COUNT
  - Return MetricsSummary object
  - ✅ Completed 2026-01-27: Full aggregation with conditional tier2 averages

- [x] **T-015**: Implement `reset()` method
  - Drop queries table
  - Re-run migrate()
  - ✅ Completed 2026-01-27: Clean reset with table recreation

- [x] **T-016**: Create `tests/metrics.test.ts`
  - Test record insertion
  - Test summary aggregation math
  - Test retention cleanup
  - Test reset functionality
  - ✅ Completed 2026-01-27: 14 tests covering all MetricsStore functionality

### Phase 4: Debug Module

- [x] **T-017**: Create `src/debug.ts` utilities
  - Re-export debug() from logging-config
  - `startTimer()` - returns Date.now()
  - `elapsed(start)` - returns ms difference
  - ✅ Completed 2026-01-27: Timing utilities with re-exports

- [x] **T-018**: Add formatted debug helpers
  - `debugQuery(query, entities)`
  - `debugTier1(matches, confidence, ms)`
  - `debugTier2(matches, topSim, ms)`
  - `debugTotal(ms)`
  - ✅ Completed 2026-01-27: All helpers + debugEmbedding() for completeness

### Phase 5: Integration - Tier 1

- [x] **T-019**: Add timing to Tier 1 search
  - Import debug utilities
  - Wrap grep operations with startTimer/elapsed
  - Return timing info from function
  - ✅ Completed 2026-01-27: tier1-grep.ts already had timing via performance.now()

- [x] **T-020**: Add debug output to Tier 1
  - debugQuery at start
  - debugTier1 after matches found
  - ✅ Completed 2026-01-27: Added debugQuery() and debugTier1() calls

- [x] **T-021**: Verify Tier 1 tests still pass
  - Run existing tier1 tests
  - Fix any regressions
  - ✅ Completed 2026-01-27: 126 tier1/tier2 tests pass

### Phase 6: Integration - Tier 2

- [x] **T-022**: Add timing to Tier 2 semantic search
  - Import debug utilities
  - Time embedding generation separately
  - Time vector search separately
  - ✅ Completed 2026-01-27: tier2-resona.ts already had timing via performance.now()

- [x] **T-023**: Add debug output to Tier 2
  - Debug escalation trigger
  - Debug embedding dimensions
  - Debug search result count
  - Debug top similarity score
  - ✅ Completed 2026-01-27: Added debug() and debugTier2() calls

- [x] **T-024**: Verify Tier 2 tests still pass
  - Run existing tier2/resona tests
  - Fix any regressions
  - ✅ Completed 2026-01-27: 126 tier1/tier2 tests pass

### Phase 7: Integration - Main Query Flow

- [x] **T-025**: Wire up Logger in CLI
  - Import Logger class
  - Create instance at startup
  - Build QueryLogEntry after query
  - Call logger.log()
  - ✅ Completed 2026-01-27: Logger integrated into cli.ts query flow

- [x] **T-026**: Wire up MetricsStore in CLI
  - Import MetricsStore class
  - Create instance at startup
  - Build QueryMetrics after query
  - Hash query with SHA256
  - Call metrics.record()
  - ✅ Completed 2026-01-27: MetricsStore integrated with SHA256 hashing

- [x] **T-027**: Add total time debug output
  - debugTotal(ms) at end of query
  - ✅ Completed 2026-01-27: debugTotal() called after query completion

### Phase 8: CLI Commands

- [x] **T-028**: Add `--metrics` command
  - Instantiate MetricsStore
  - Call getSummary(7)
  - Format and print summary table
  - ✅ Completed 2026-01-27: Shows 7-day metrics summary

- [x] **T-029**: Add `--log [n]` command
  - Read last n lines from log file (default 10)
  - Parse JSONL entries
  - Pretty-print with timestamps
  - ✅ Completed 2026-01-27: Uses Logger.getRecentEntries()

- [x] **T-030**: Add `--config` command
  - Call getLoggingConfig()
  - Print as formatted JSON
  - ✅ Completed 2026-01-27: Shows full config as JSON

- [x] **T-031**: Add `--metrics-reset` command
  - Instantiate MetricsStore
  - Call reset()
  - Print confirmation message
  - ✅ Completed 2026-01-27: Resets metrics with confirmation

- [x] **T-032**: Create CLI command tests
  - Test --metrics output format
  - Test --log with various n values
  - Test --config shows current settings
  - Test --metrics-reset confirmation
  - ✅ Completed 2026-01-27: 7 tests in tests/cli-commands.test.ts

### Phase 9: Config File Tier Overrides

- [ ] **T-033**: Modify tier1 config loading
  - Load logging config
  - Merge tier1 overrides from config file
  - Preserve env var support (lower priority)

- [ ] **T-034**: Modify tier2 config loading
  - Load logging config
  - Merge tier2 overrides from config file
  - Preserve env var support (lower priority)

- [ ] **T-035**: Create config override tests
  - Test config file overrides env vars
  - Test env vars override defaults
  - Test partial overrides work

## Verification Checklist

- [ ] All 35 tasks completed
- [ ] `bun test` passes all tests (existing + new)
- [ ] Config file auto-created on first run
- [ ] Debug output appears when enabled
- [ ] Log rotation works correctly
- [ ] Metrics aggregation is accurate
- [ ] All CLI commands functional

## Dependencies

```
T-001 → T-002 → T-003 → T-004 (Phase 1 sequential)
T-005 → T-006 → T-007 → T-008 (Phase 2 sequential)
T-009 → T-010 → T-011 → T-012 → T-013 → T-014 → T-015 → T-016 (Phase 3 sequential)
T-017 → T-018 (Phase 4 sequential)

Phase 1 blocks Phases 2, 3, 4, 5, 6, 7, 8, 9
Phase 2 blocks Phase 7
Phase 3 blocks Phases 7, 8
Phase 4 blocks Phases 5, 6, 7

Phases 5, 6 can run in parallel
Phase 7 requires Phases 5, 6
Phase 8 requires Phase 7
Phase 9 can run after Phase 1
```
