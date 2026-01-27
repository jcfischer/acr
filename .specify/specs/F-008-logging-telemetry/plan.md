# F-008 Implementation Plan

**Feature:** ACR Logging, Metrics & Debug Mode
**Status:** PLAN
**Created:** 2026-01-27

## Overview

This plan implements configurable logging, metrics collection, and debug mode for ACR. The implementation follows a bottom-up approach: first building the foundational modules (config, logger, metrics), then integrating them into existing code, and finally adding CLI commands.

## Implementation Phases

### Phase 1: Config System Foundation

**Goal:** Create the configuration loading system with Zod validation.

**Files to create:**
- `src/logging-config.ts` - Config schema, loading, validation, caching

**Key implementation details:**
1. Define `LoggingConfigSchema` using Zod with all defaults
2. Implement `getLoggingConfig()` with:
   - Config file path: `~/.config/acr/config.json`
   - Directory creation if missing
   - JSON parsing with Zod validation
   - Fallback to defaults on parse error
   - Config caching (load once per process)
3. Export `isDebugEnabled()` helper
4. Export `debug()` function for conditional stderr output
5. Write default config file on first run for user reference

**Dependencies:** None (foundational module)

**Tests:** `tests/logging-config.test.ts`
- Test default values when no config file
- Test partial config merging
- Test validation error handling
- Test path expansion (~)

---

### Phase 2: Logger Module

**Goal:** Create JSONL logger with file rotation.

**Files to create:**
- `src/logger.ts` - Logger class with rotation support

**Key implementation details:**
1. Define `QueryLogEntry` interface matching spec format
2. Implement `Logger` class:
   - `log(entry)` - Append JSONL entry to file
   - `rotateIfNeeded(path)` - Check size, rotate .1, .2, etc.
   - `expandPath(p)` - Replace ~ with HOME
3. Rotation logic:
   - Check file size against `config.logging.maxSize`
   - Rename existing files (path.1 -> path.2, etc.)
   - Keep only `config.logging.maxFiles` rotated files

**Dependencies:** Phase 1 (logging-config.ts)

**Tests:** `tests/logger.test.ts`
- Test JSONL writing
- Test file rotation at maxSize
- Test maxFiles limit
- Test disabled logging

---

### Phase 3: Metrics Module

**Goal:** Create SQLite metrics storage with retention.

**Files to create:**
- `src/metrics.ts` - MetricsStore class with SQLite

**Key implementation details:**
1. Define `QueryMetrics` interface
2. Define `MetricsSummary` interface
3. Implement `MetricsStore` class:
   - Constructor: Open SQLite at config path, run migrations
   - `migrate()` - Create queries table with indexes
   - `record(metrics)` - Insert row, trigger cleanup
   - `cleanup()` - Delete records older than retentionDays
   - `getSummary(days)` - Aggregate stats query
   - `reset()` - Drop and recreate table
4. Use `bun:sqlite` for database access
5. Hash queries (SHA256) for privacy in storage

**Dependencies:** Phase 1 (logging-config.ts)

**Tests:** `tests/metrics.test.ts`
- Test record insertion
- Test summary aggregation
- Test retention cleanup
- Test reset functionality
- Test disabled metrics

---

### Phase 4: Debug Module

**Goal:** Create debug output utilities.

**Files to create:**
- `src/debug.ts` - Debug output utilities

**Key implementation details:**
1. Re-export `debug()` from logging-config for convenience
2. Add timing utilities:
   - `startTimer()` - Returns timestamp
   - `elapsed(start)` - Returns ms elapsed
3. Add formatted debug helpers:
   - `debugQuery(query, entities)` - Log query start
   - `debugTier1(matches, confidence, ms)` - Log Tier 1 results
   - `debugTier2(matches, topSim, ms)` - Log Tier 2 results
   - `debugTotal(ms)` - Log total time

**Dependencies:** Phase 1 (logging-config.ts)

**Tests:** Inline with logging-config tests

---

### Phase 5: Integration - Tier 1

**Goal:** Add timing and logging to Tier 1 search.

**Files to modify:**
- `src/tier1.ts` (or equivalent Tier 1 module)

**Key implementation details:**
1. Import debug and logger modules
2. Add timing around grep operations
3. Call `debug()` at key points:
   - Query start
   - Matches found
   - Confidence calculated
4. Return timing info from Tier 1 function for logger

**Dependencies:** Phase 1, 2, 4

**Tests:** Verify existing tier1 tests still pass

---

### Phase 6: Integration - Tier 2

**Goal:** Add timing and logging to Tier 2 semantic search.

**Files to modify:**
- `src/tier2-resona.ts` (or main Tier 2 module)
- `src/resona-adapter.ts`

**Key implementation details:**
1. Import debug and logger modules
2. Add timing around:
   - Embedding generation
   - Vector search
   - Result ranking
3. Call `debug()` at key points:
   - Escalation trigger
   - Embedding dimensions
   - Search results count
   - Top similarity score
4. Return timing info from Tier 2 function for logger

**Dependencies:** Phase 1, 2, 4

**Tests:** Verify existing tier2 tests still pass

---

### Phase 7: Integration - Main Query Flow

**Goal:** Wire up logging and metrics in main query handler.

**Files to modify:**
- `src/cli.ts` (or main query entry point)

**Key implementation details:**
1. Import Logger, MetricsStore, debug modules
2. Create instances at startup
3. After query completes:
   - Call `logger.log()` with QueryLogEntry
   - Call `metrics.record()` with QueryMetrics
   - Call `debug()` for total time
4. Hash query for metrics (SHA256)

**Dependencies:** Phase 1-6

**Tests:** Integration test with mock query

---

### Phase 8: CLI Commands

**Goal:** Add --metrics, --log, --config, --metrics-reset commands.

**Files to modify:**
- `src/cli.ts`

**Key implementation details:**
1. `--metrics` command:
   - Instantiate MetricsStore
   - Call getSummary(7)
   - Format and print summary
2. `--log [n]` command:
   - Read last n lines from log file
   - Parse and pretty-print JSONL entries
3. `--config` command:
   - Call getLoggingConfig()
   - Print as formatted JSON
4. `--metrics-reset` command:
   - Instantiate MetricsStore
   - Call reset()
   - Print confirmation

**Dependencies:** Phase 1-7

**Tests:** CLI command tests

---

### Phase 9: Config File Tier Overrides

**Goal:** Allow tier1/tier2 settings to be overridden via config.

**Files to modify:**
- `src/tier1-config.ts` (create if needed)
- `src/tier2-config.ts`

**Key implementation details:**
1. Modify getConfig() functions to:
   - Load logging config
   - Merge tier1/tier2 overrides from config file
   - Preserve existing env var support (lower priority than config file)
2. Order of precedence:
   - Config file (highest)
   - Environment variables
   - Hardcoded defaults (lowest)

**Dependencies:** Phase 1

**Tests:** Test config override merging

---

## Test Plan

| Phase | Test File | Coverage |
|-------|-----------|----------|
| 1 | tests/logging-config.test.ts | Config loading, defaults, validation |
| 2 | tests/logger.test.ts | JSONL writing, rotation |
| 3 | tests/metrics.test.ts | SQLite ops, aggregation, cleanup |
| 4 | (inline) | Debug output |
| 5-7 | Existing tests | Regression verification |
| 8 | tests/cli.test.ts | New CLI commands |
| 9 | tests/tier-config.test.ts | Override merging |

## Verification Checklist

- [ ] `bun test` passes all existing tests
- [ ] Config file created at `~/.config/acr/config.json` on first run
- [ ] Debug output appears when `debug: true` in config
- [ ] Log file created at configured path
- [ ] Log rotation works at maxSize
- [ ] Metrics database created at configured path
- [ ] `acr --metrics` shows summary
- [ ] `acr --log` shows recent queries
- [ ] `acr --config` shows current settings
- [ ] Tier config overrides work from config file

## Risk Mitigation

1. **Breaking changes:** All new features are additive. Existing behavior unchanged when config file absent.
2. **Performance:** Logging/metrics are async-safe and file I/O is minimal.
3. **Privacy:** Queries are hashed before metrics storage.
4. **Disk space:** Retention and rotation limits prevent unbounded growth.

## Estimated Complexity

| Phase | New Lines | Modified Lines | Complexity |
|-------|-----------|----------------|------------|
| 1 | ~80 | 0 | Low |
| 2 | ~60 | 0 | Low |
| 3 | ~120 | 0 | Medium |
| 4 | ~30 | 0 | Low |
| 5 | 0 | ~30 | Low |
| 6 | 0 | ~40 | Low |
| 7 | 0 | ~50 | Medium |
| 8 | 0 | ~80 | Medium |
| 9 | 0 | ~30 | Low |
| **Total** | ~290 | ~230 | Medium |
