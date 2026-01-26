---
feature: "F-005 - Maestro Session Indexing"
spec: "./spec.md"
plan: "./plan.md"
---

# Documentation: Maestro Session Indexing

## Overview

F-005 enables ACR to index Maestro desktop app session history for semantic search. This allows cross-session recall of previous coding conversations.

## Usage

### Programmatic API

```typescript
import {
  syncMaestroIndex,
  clearMaestroIndex,
  loadIndexState,
  MAESTRO_CONFIG,
} from 'acr';

// Incremental sync (default) - only index changed files
const result = await syncMaestroIndex(
  MAESTRO_CONFIG.historyDir,
  MAESTRO_CONFIG.stateFile
);

// Full reindex - ignore previous state
const fullResult = await syncMaestroIndex(
  MAESTRO_CONFIG.historyDir,
  MAESTRO_CONFIG.stateFile,
  { full: true }
);

// Clear all indexed data
await clearMaestroIndex(MAESTRO_CONFIG.stateFile);

// Check current state
const state = await loadIndexState(MAESTRO_CONFIG.stateFile);
console.log(state.totalEntries);
```

### Parser Functions

```typescript
import {
  parseMaestroHistoryFile,
  parseHistoryDirectory,
  filterIndexableEntries,
  toEmbeddingInputs,
} from 'acr';

// Parse a single file
const entries = await parseMaestroHistoryFile('/path/to/session.json');

// Parse all files in directory
const allFiles = await parseHistoryDirectory(MAESTRO_CONFIG.historyDir);

// Filter by minimum length
const indexable = filterIndexableEntries(entries, 10);

// Convert to embedding inputs
const inputs = toEmbeddingInputs(indexable, 'session.json');
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `historyDir` | `~/Library/Application Support/maestro/history` | Location of Maestro history files |
| `stateFile` | `~/.config/acr/maestro-index-state.json` | Persistent index state |
| `minSummaryLength` | 10 | Minimum entry length to index |
| `batchSize` | 100 | Entries per embedding batch |
| `minSimilarity` | 0.70 | Minimum search similarity |
| `maxResults` | 5 | Max results per search |

## Source ID Format

Maestro search results use this format:
```
maestro:{fileId}:{entryIndex}
```

Example: `maestro:abc123-def456:42`
- `abc123-def456` - Session file ID (filename without .json)
- `42` - Entry index within the file

## Type Definitions

### MaestroEntry

```typescript
interface MaestroEntry {
  summary: string;        // Task summary text
  timestamp: number;      // Unix timestamp (ms)
  type: 'USER' | 'AUTO';  // Entry type
  success: boolean;       // Whether task succeeded
}
```

### MaestroIndexState

```typescript
interface MaestroIndexState {
  version: number;        // Schema version
  lastSync: number;       // Last sync timestamp
  totalEntries: number;   // Total indexed entries
  files: Record<string, MaestroFileState>;
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| History dir missing | Returns empty, logs warning |
| Malformed JSON | Skips file, continues |
| Ollama unavailable | No-op (graceful degradation) |
| Invalid entry | Skipped during filtering |

## Integration with Tier 2

Maestro results appear alongside other Tier 2 sources (user, session, tana). The `source` field will be `"maestro"` for results from this indexer.
