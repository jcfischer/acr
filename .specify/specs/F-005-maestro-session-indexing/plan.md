---
feature: "F-005 - Maestro Session Indexing"
spec: "./spec.md"
status: "approved"
---

# Technical Plan: Maestro Session Indexing

## Architecture Overview

Semantic embedding of Maestro session history entries for ACR Tier 2 retrieval. Enables cross-session context recall by indexing task summaries from completed Maestro sessions.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Maestro Session Indexing                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ~/Library/Application Support/maestro/history/*.json            │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              MaestroIndexer                              │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │   Parser    │→ │  Filter     │→ │  Batcher        │  │    │
│  │  │ (JSON→Entry)│  │ (>10 chars) │  │ (100/batch)     │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Resona/LanceDB                              │    │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐   │    │
│  │  │ bge-m3 embed    │  │ maestro source collection   │   │    │
│  │  └─────────────────┘  └─────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              ACR Tier 2 Unified Search                   │    │
│  │  Sources: [user] [session] [tana] [maestro] ← NEW        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | PAI standard, existing codebase |
| Runtime | Bun | PAI standard, used throughout ACR |
| Embedding | Ollama + bge-m3 | Already used in Tier 2 via Resona |
| Vector DB | LanceDB | Already used in Tier 2, unified index |
| Validation | Zod | PAI standard, pattern in ACR codebase |
| State Storage | JSON file | Simple, human-readable, fits use case |

## Constitutional Compliance

- [x] **CLI-First:** Exposes `acr maestro index|status|clear` commands
- [x] **Library-First:** Core logic in `maestro-indexer.ts`, CLI wraps it
- [x] **Test-First:** TDD with unit tests for parser, integration tests for pipeline
- [x] **Deterministic:** No probabilistic behavior; same input = same index
- [x] **Code Before Prompts:** All logic in TypeScript, no LLM calls

## Data Model

### Entities

```typescript
// Maestro history file structure (external, read-only)
interface MaestroHistoryFile {
  entries: MaestroEntry[];
}

interface MaestroEntry {
  summary: string;      // Task description (embedded)
  timestamp: number;    // Unix ms
  type: 'AUTO' | 'USER';
  success: boolean;
}

// ACR internal representation
interface MaestroEmbeddingInput {
  content: string;        // The summary text
  source: 'maestro';
  sourceId: string;       // Format: "maestro:{fileId}:{entryIndex}"
  sessionFile: string;    // Original filename (UUID.json)
  timestamp: Date;
  entryType: 'AUTO' | 'USER';
  success: boolean;
  workingDirectory?: string;  // If extractable from session
}

// Index state for incremental sync
interface MaestroIndexState {
  lastSyncTimestamp: number;
  indexedFiles: Record<string, {
    lastModified: number;
    entryCount: number;
  }>;
}
```

### No Database Schema Required

Uses existing LanceDB index via ResonaAdapter. State file is JSON:

```json
{
  "lastSyncTimestamp": 1706270400000,
  "indexedFiles": {
    "5c538d0e-ef49-4a99-ba42-715d8327c8d3.json": {
      "lastModified": 1706270300000,
      "entryCount": 15
    }
  }
}
```

## API Contracts

### Internal APIs

```typescript
// maestro-indexer.ts - Core indexing logic

/**
 * Parse a single Maestro history file
 */
function parseMaestroHistoryFile(
  filePath: string
): Promise<MaestroEntry[]>;

/**
 * Filter entries eligible for indexing
 */
function filterIndexableEntries(
  entries: MaestroEntry[]
): MaestroEntry[];

/**
 * Convert entries to embedding inputs
 */
function toEmbeddingInputs(
  entries: MaestroEntry[],
  sessionFile: string
): MaestroEmbeddingInput[];

/**
 * Index entries into Resona
 */
function indexMaestroEntries(
  inputs: MaestroEmbeddingInput[],
  adapter: ResonaAdapter
): Promise<IndexResult>;

/**
 * Run incremental sync
 */
function syncMaestroIndex(
  historyDir: string,
  stateFile: string,
  options?: SyncOptions
): Promise<SyncResult>;

/**
 * Get current index status
 */
function getMaestroIndexStatus(
  stateFile: string
): Promise<IndexStatus>;

/**
 * Clear Maestro entries from index
 */
function clearMaestroIndex(
  adapter: ResonaAdapter,
  stateFile: string
): Promise<void>;
```

### SearchSource Interface (for ResonaAdapter)

```typescript
// Implements existing SearchSource interface
const maestroSearchSource: SearchSource = {
  sourceId: 'maestro',
  description: 'Maestro session history',
  search: async (query: string, k: number) => SearchResult[],
  getItem: async (id: string) => { preview: string; url?: string } | null
};
```

## Implementation Strategy

### Phase 1: Foundation (Types + Parser)

Build the data structures and parsing logic first.

- [ ] Create `src/maestro-types.ts` with Zod schemas
- [ ] Create `src/maestro-parser.ts` with JSON parsing
- [ ] Unit tests for parsing edge cases (empty, malformed, large files)

### Phase 2: Core Features (Indexing + State)

Implement the embedding pipeline and state management.

- [ ] Create `src/maestro-indexer.ts` with indexing logic
- [ ] Implement incremental sync with state tracking
- [ ] Integration tests for round-trip: index → search → retrieve

### Phase 3: Integration (Tier 2 + CLI)

Wire into existing systems.

- [ ] Register Maestro SearchSource in ResonaAdapter
- [ ] Add 'maestro' to SourceType enum
- [ ] Create CLI commands in `src/index.ts`
- [ ] End-to-end tests

## File Structure

```
src/
├── maestro-types.ts      # [NEW] Type definitions + Zod schemas
├── maestro-parser.ts     # [NEW] JSON parsing logic
├── maestro-indexer.ts    # [NEW] Indexing + sync logic
├── resona-adapter.ts     # [MODIFY] Add maestro source type
├── tier2-types.ts        # [MODIFY] Add 'maestro' to SourceType
└── index.ts              # [MODIFY] Export new modules

tests/
├── maestro-types.test.ts     # [NEW] Schema validation tests
├── maestro-parser.test.ts    # [NEW] Parser unit tests
└── maestro-indexer.test.ts   # [NEW] Indexer integration tests
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Maestro schema changes | Medium | Low | Zod validation fails fast, version check |
| Large history files (>1000 entries) | Low | Medium | Batch processing, pagination |
| Ollama unavailable | Low | Medium | Graceful skip, queue for later |
| File permission issues | Medium | Low | Try-catch, clear error messages |

## Failure Mode Analysis

### How This Code Can Fail

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| Malformed JSON | Corrupted history file | JSON.parse throws | Skip file, log warning, continue | Manual fix or ignore |
| Ollama timeout | Embedding service down | Fetch timeout | Return empty results | Automatic retry on next sync |
| State file corrupted | Disk issues, concurrent writes | JSON parse fails | Full reindex | Delete state file, start fresh |
| Permission denied | MacOS sandbox changes | EACCES error | Skip, notify user | User fixes permissions |
| Schema mismatch | Maestro update | Zod validation fails | Skip invalid entries | Update schema |

### Assumptions That Could Break

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| History files are UTF-8 JSON | Maestro changes format | JSON.parse failure |
| Entries have summary field | Schema change | Zod validation |
| Files are readable | Sandbox restrictions | EACCES error |
| Ollama has bge-m3 model | Model not installed | Model check on init |
| History dir exists | Fresh Maestro install | Directory check |

### Blast Radius

- **Files touched:** 6 files (3 new, 3 modified)
- **Systems affected:** ACR Tier 2 only (isolated)
- **Rollback strategy:** Remove Maestro source from ResonaAdapter, delete state file

## Dependencies

### External

- None new (uses existing Ollama/LanceDB via Resona)

### Internal

- `src/resona-adapter.ts` - SearchSource registration
- `src/tier2-types.ts` - SourceType enum
- `src/tier2-config.ts` - Configuration constants

## Migration/Deployment

- [ ] No database migrations needed (uses existing LanceDB)
- [ ] No new environment variables
- [ ] No breaking changes (additive only)
- [ ] State file created on first run

## Estimated Complexity

- **New files:** 3 (types, parser, indexer)
- **Modified files:** 3 (resona-adapter, tier2-types, index)
- **Test files:** 3 (one per new module)
- **Estimated tasks:** 12-15
- **Debt score:** 2 (low complexity, isolated, well-bounded)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** Can a developer understand this in 6 months? | Yes | Follows existing ACR patterns |
| **Testability:** Can changes be verified without manual testing? | Yes | Unit + integration tests |
| **Documentation:** Is the "why" captured, not just the "what"? | Yes | Spec.md captures rationale |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| Maestro schema update | Zod schema versioning | Low - update types |
| New Maestro metadata fields | Extensible metadata record | Low - additive |
| Different embedding model | Abstract behind Resona | None - transparent |
| Multiple Maestro installations | Config for custom paths | Low - config change |

### Deletion Criteria

When should this code be deleted?

- [ ] Feature superseded by: Native Maestro context system
- [ ] Dependency deprecated: Maestro removes history files
- [ ] User need eliminated: Session continuity solved differently
- [ ] Maintenance cost exceeds value when: < 100 sessions ever indexed
