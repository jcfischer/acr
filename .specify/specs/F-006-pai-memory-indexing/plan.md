---
feature: "F-006 - PAI Memory Indexing"
phase: "plan"
created: "2026-01-26"
---

# Implementation Plan: PAI Memory Indexing

## Architecture Overview

```
~/.claude/MEMORY/
├── Learning/          ─┐
├── Decisions/          │──→ memory-parser.ts ──→ memory-indexer.ts ──→ Resona/LanceDB
└── Research/          ─┘
                              │
                              ▼
                    ~/.config/acr/memory-index-state.json
```

## Data Flow

1. **Discovery**: Scan configured directories for .md files
2. **Parsing**: Extract frontmatter + content from each file
3. **Filtering**: Skip files below minimum content length
4. **Classification**: Determine capture type (LEARNING, DECISION, RESEARCH)
5. **Transformation**: Convert to embedding inputs with source IDs
6. **Indexing**: Send to Resona for embedding (batched)
7. **State**: Persist indexed file state for incremental sync

## File Structure

```
src/
  memory-types.ts       # Types, schemas, config constants
  memory-parser.ts      # Frontmatter extraction, content parsing
  memory-indexer.ts     # Sync logic, state management
tests/
  memory-types.test.ts
  memory-parser.test.ts
  memory-indexer.test.ts
```

## Data Models

### MemoryCaptureType

```typescript
const MemoryCaptureTypeSchema = z.enum(["LEARNING", "DECISION", "RESEARCH"]);
```

### MemoryEntry

```typescript
const MemoryEntrySchema = z.object({
  filePath: z.string(),
  captureType: MemoryCaptureTypeSchema,
  timestamp: z.number(),           // Unix ms from frontmatter or mtime
  sessionId: z.string().optional(), // From frontmatter
  title: z.string(),               // First heading or filename
  content: z.string(),             // Full markdown content
});
```

### MemoryEmbeddingInput

```typescript
const MemoryEmbeddingInputSchema = z.object({
  sourceId: z.string(),  // memory:{type}:{filename}
  content: z.string(),   // Content for embedding
  metadata: z.object({
    captureType: MemoryCaptureTypeSchema,
    timestamp: z.number(),
    filePath: z.string(),
  }),
});
```

### MemoryIndexState

```typescript
const MemoryIndexStateSchema = z.object({
  lastSyncTimestamp: z.number(),
  indexedFiles: z.record(z.object({
    lastModified: z.number(),
    captureType: z.string(),
    contentHash: z.string().optional(),  // For content change detection
  })),
});
```

### MEMORY_CONFIG

```typescript
const MEMORY_CONFIG = {
  baseDir: join(homedir(), ".claude/MEMORY"),
  directories: ["Learning", "Decisions", "Research"],
  stateFile: join(homedir(), ".config/acr/memory-index-state.json"),
  minContentLength: 50,   // Skip very short files
  batchSize: 50,          // Smaller batches than Maestro (larger content)
  fileExtensions: [".md"],
};
```

## Source ID Format

```
memory:{captureType}:{filename_stem}
```

Examples:
- `memory:LEARNING:20260104T111437_LEARNING_tana-mcp-zombie-processes`
- `memory:DECISION:2026-01-01-100949_DECISION_auth-approach`
- `memory:RESEARCH:2025-12-27-172635_RESEARCH_saas-analysis`

## Frontmatter Parsing

Expected frontmatter format:
```yaml
---
capture_type: LEARNING
timestamp: 2026-01-04 12:14:37
session_id: 52c3464f-c6d5-4b8b-9766-831b1086802e
executor: main
---
```

Parsing strategy:
1. Extract YAML between `---` markers
2. Parse capture_type (required, infer from path if missing)
3. Parse timestamp (optional, fall back to file mtime)
4. Parse session_id (optional)
5. Title from first `# ` heading or filename

## Content Type Decay Integration

Map capture types to Tier 4 content types:

| Capture Type | Content Type | Half-Life |
|--------------|--------------|-----------|
| LEARNING | reference | Permanent |
| DECISION | reference | Permanent |
| RESEARCH | project | 90 days |

## CLI Integration

Add to `src/cli.ts`:

```typescript
if (args[0] === "--index-memory" || args[0] === "--index-memory-full") {
  const full = args[0] === "--index-memory-full";
  const result = await syncMemoryIndex(MEMORY_CONFIG, { fullReindex: full });
  console.log(`Indexed ${result.entriesIndexed} entries from ${result.filesProcessed} files`);
}
```

Update `--status` to show memory stats.

## Integration Points

### 1. tier2-types.ts
Add "memory" to SourceTypeSchema:
```typescript
export const SourceTypeSchema = z.enum(["user", "session", "tana", "maestro", "memory"]);
```

### 2. resona-adapter.ts
Update parseSourceType():
```typescript
if (sourceId.startsWith("memory:")) {
  return "memory";
}
```

### 3. index.ts
Export new modules:
```typescript
export * from "./memory-types";
export * from "./memory-parser";
export * from "./memory-indexer";
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| MEMORY dir missing | Return empty, log warning |
| Subdirectory missing | Skip, continue with others |
| Malformed frontmatter | Use defaults (type from path, mtime) |
| File read error | Skip file, continue |
| Empty content | Skip file |
| Embedding failure | Log error, continue with others |

## Performance Considerations

1. **File count**: ~5,300 files across 3 directories
2. **Batch size**: 50 files per batch (larger content than Maestro)
3. **Incremental sync**: Only process files with mtime > last indexed
4. **Content hash**: Optional - detect content changes without mtime change
5. **Target**: Full index <30s, incremental <5s

## Testing Strategy

Following F-005 TDD pattern:

1. **memory-types.test.ts** (~20 tests)
   - Schema validation
   - Config constants
   - Source ID generation/parsing

2. **memory-parser.test.ts** (~25 tests)
   - Frontmatter extraction
   - Content parsing
   - Title extraction
   - Directory scanning
   - Error handling

3. **memory-indexer.test.ts** (~25 tests)
   - State persistence
   - Change detection
   - Incremental sync
   - Full reindex
   - Graceful degradation

4. **Integration tests** (~10 tests)
   - Source type in tier2-types
   - parseSourceType in resona-adapter
   - CLI commands

## Constitutional Compliance

- **Trust Grows Capability**: Index all learnings/decisions for proactive recall
- **Relationship Cultivates Results**: Remember past insights across sessions
- **Care Compounds Over Time**: Permanent storage for reference content

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Large file count | Batching + incremental sync |
| Varied frontmatter | Flexible parsing with defaults |
| Content quality | Minimum length filter |
| Disk space | State file only stores metadata |

## Dependencies

- F-005 pattern (completed) - follow same structure
- Tier 2 types (exists)
- Tier 4 decay (exists)
