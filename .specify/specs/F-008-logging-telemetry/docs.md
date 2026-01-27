# F-008 Documentation Updates

## Files Updated

### README.md
No changes needed - this is an internal feature that doesn't change user-facing behavior.

### CLI Help (src/cli.ts)
Added new commands to help text:
```
acr --metrics             Show query metrics summary (7 days)
acr --log [n]             Show last n query log entries (default 10)
acr --config              Show current configuration
acr --metrics-reset       Reset all metrics data
```

### Configuration File
New config file at `~/.config/acr/config.json` with structure:
```json
{
  "debug": false,
  "logging": {
    "enabled": true,
    "path": "~/.config/acr/acr.log",
    "maxSize": 10000000,
    "maxFiles": 3
  },
  "metrics": {
    "enabled": true,
    "path": "~/.config/acr/metrics.db",
    "retentionDays": 30
  },
  "tier1": {
    "enabled": true,
    "grepTimeoutMs": 75,
    "maxMatches": 20
  },
  "tier2": {
    "enabled": true,
    "activationThreshold": 0.7,
    "searchTimeout": 5000,
    "maxResults": 10,
    "minSimilarity": 0.6
  }
}
```

## New Source Files

| File | Purpose |
|------|---------|
| `src/logging-config.ts` | Config schema and loading with Zod validation |
| `src/logger.ts` | JSONL logger with file rotation |
| `src/metrics.ts` | SQLite metrics storage with aggregation |
| `src/debug.ts` | Timing utilities and formatted debug output |

## New Test Files

| File | Tests |
|------|-------|
| `tests/logging-config.test.ts` | 30+ tests for schema, loading, helpers |
| `tests/logger.test.ts` | 13 tests for JSONL writing and rotation |
| `tests/metrics.test.ts` | 14 tests for SQLite storage |
| `tests/cli-commands.test.ts` | 7 tests for new CLI commands |
| `tests/config-overrides.test.ts` | 11 tests for config priority |

## Integration Points

### Tier 1 (src/tier1-grep.ts)
- Added `debugQuery()` after entity extraction
- Added `debugTier1()` after results aggregation

### Tier 2 (src/tier2-resona.ts)
- Added `debug()` for activation logging
- Added `debugTier2()` after search results

### CLI (src/cli.ts)
- Logger records every query
- MetricsStore records query metrics
- `debugTotal()` shows total time when debug enabled
