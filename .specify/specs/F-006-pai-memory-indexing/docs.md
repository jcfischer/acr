# F-006 Documentation Updates

## Files Modified

### Core Implementation

| File | Changes |
|------|---------|
| `src/memory-types.ts` | New Zod schemas for MemoryEntry, MemoryIndexState, sync config/result types |
| `src/memory-parser.ts` | YAML frontmatter parsing, directory scanning, content extraction |
| `src/memory-indexer.ts` | State persistence, mtime-based change detection, incremental sync |

### Integration

| File | Changes |
|------|---------|
| `src/tier2-types.ts` | Added "memory" to SourceTypeSchema union |
| `src/resona-adapter.ts` | Updated `parseSourceType()` to handle `memory:TYPE:filename` format |
| `src/index.ts` | Exported F-006 modules: memory-types, memory-parser, memory-indexer |
| `src/cli.ts` | Added `--index-memory` and `--index-memory-full` commands |

### Tests

| File | Tests |
|------|-------|
| `tests/memory-types.test.ts` | 39 tests - Schema validation, edge cases |
| `tests/memory-parser.test.ts` | 28 tests - Frontmatter parsing, directory scanning |
| `tests/memory-indexer.test.ts` | 30 tests - State management, change detection, sync |
| `tests/resona-adapter.test.ts` | +4 tests - Memory source type parsing |

**Total new tests**: 97 (717 total passing)

## CLI Usage

```bash
# Incremental sync (only changed files)
acr --index-memory

# Full reindex (all files)
acr --index-memory-full
```

## Source ID Format

```
memory:{LEARNING|DECISION|RESEARCH}:{filename}
```

Examples:
- `memory:LEARNING:20260104T111437_LEARNING_perfect-the-tana-mcp`
- `memory:DECISION:2026-01-01_DECISION_architectural-choice`
- `memory:RESEARCH:2025-12-27_RESEARCH_saas-psychotherapists`

## State File

Location: `~/.config/acr/memory-index-state.json`

```json
{
  "lastSyncTimestamp": 1737891234567,
  "indexedFiles": {
    "/path/to/file.md": {
      "lastModified": 1737891234000,
      "captureType": "LEARNING"
    }
  }
}
```

## Decay Rates

| Capture Type | Category | Decay |
|--------------|----------|-------|
| LEARNING | reference | None (permanent) |
| DECISION | reference | None (permanent) |
| RESEARCH | project | 90-day half-life |

## No README Changes

F-006 is internal infrastructure. No public documentation updates required.
