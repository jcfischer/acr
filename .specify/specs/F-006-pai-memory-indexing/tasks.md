---
feature: "F-006 - PAI Memory Indexing"
phase: "tasks"
created: "2026-01-26"
---

# Implementation Tasks: PAI Memory Indexing

## Task Groups

| Group | Description | Tasks | Dependencies |
|-------|-------------|-------|--------------|
| G-1 | Type Definitions | T-1.1, T-1.2 | None |
| G-2 | Parser Module | T-2.1, T-2.2, T-2.3 | G-1 |
| G-3 | Indexer Module | T-3.1, T-3.2, T-3.3 | G-1, G-2 |
| G-4 | Integration | T-4.1, T-4.2 | G-1 |
| G-5 | CLI & Exports | T-5.1, T-5.2 | G-3, G-4 |

## Group 1: Type Definitions

### T-1.1: Create memory-types.ts with Zod schemas [T]

**File**: `src/memory-types.ts`

**Schemas**:
```typescript
MemoryCaptureTypeSchema = z.enum(["LEARNING", "DECISION", "RESEARCH"])

MemoryEntrySchema = z.object({
  filePath: z.string(),
  captureType: MemoryCaptureTypeSchema,
  timestamp: z.number(),
  sessionId: z.string().optional(),
  title: z.string(),
  content: z.string(),
})

MemoryEmbeddingInputSchema = z.object({
  sourceId: z.string(),
  content: z.string(),
  metadata: z.object({
    captureType: MemoryCaptureTypeSchema,
    timestamp: z.number(),
    filePath: z.string(),
  }),
})

MemoryFileStateSchema = z.object({
  lastModified: z.number(),
  captureType: z.string(),
})

MemoryIndexStateSchema = z.object({
  lastSyncTimestamp: z.number(),
  indexedFiles: z.record(MemoryFileStateSchema),
})
```

**Config**:
```typescript
MEMORY_CONFIG = {
  baseDir: join(homedir(), ".claude/MEMORY"),
  directories: ["Learning", "Decisions", "Research"],
  stateFile: join(homedir(), ".config/acr/memory-index-state.json"),
  minContentLength: 50,
  batchSize: 50,
  fileExtensions: [".md"],
}
```

**Functions**:
- `generateSourceId(captureType, filename)` → `memory:{type}:{stem}`
- `parseSourceId(sourceId)` → `{ captureType, filename }`
- `createEmptyIndexState()` → empty state object
- `captureTypeFromPath(filePath)` → infer type from directory

**Tests**: ~20 tests
- Schema validation (valid/invalid)
- Source ID generation/parsing
- Config constants
- Empty state creation
- Type inference from path

---

### T-1.2: Add "memory" to SourceTypeSchema [T]

**File**: `src/tier2-types.ts`

**Change**:
```typescript
// Before
export const SourceTypeSchema = z.enum(["user", "session", "tana", "maestro"]);

// After
export const SourceTypeSchema = z.enum(["user", "session", "tana", "maestro", "memory"]);
```

**Tests**: Update existing tests to include "memory"

---

## Group 2: Parser Module

### T-2.1: Create frontmatter extraction [T]

**File**: `src/memory-parser.ts`

**Functions**:
```typescript
extractFrontmatter(content: string): { frontmatter: Record<string, unknown>, body: string }
parseFrontmatterTimestamp(value: string): number | null
extractTitle(content: string, filename: string): string
```

**Behavior**:
- Extract YAML between `---` markers
- Parse `capture_type`, `timestamp`, `session_id`
- Fallback: infer capture_type from path, use null for timestamp
- Title: first `# ` heading or cleaned filename

**Tests**: ~10 tests
- Valid frontmatter extraction
- Missing frontmatter (return empty)
- Malformed YAML (return empty)
- Timestamp parsing (various formats)
- Title extraction (heading vs filename)

---

### T-2.2: Create file parser [T]

**File**: `src/memory-parser.ts`

**Functions**:
```typescript
parseMemoryFile(filePath: string): Promise<MemoryEntry | null>
```

**Behavior**:
1. Read file content
2. Extract frontmatter
3. Determine capture type (frontmatter or path)
4. Parse timestamp (frontmatter or file mtime)
5. Extract title
6. Return MemoryEntry or null if invalid

**Tests**: ~8 tests
- Parse valid file with frontmatter
- Parse file without frontmatter (use defaults)
- Skip file below min content length
- Handle file read error (return null)
- Handle non-existent file (return null)

---

### T-2.3: Create directory scanner [T]

**File**: `src/memory-parser.ts`

**Functions**:
```typescript
scanMemoryDirectory(dir: string): Promise<string[]>
scanAllMemoryDirectories(baseDir: string, dirs: string[]): Promise<Map<string, string[]>>
toEmbeddingInputs(entries: MemoryEntry[]): MemoryEmbeddingInput[]
```

**Behavior**:
- Recursively find all .md files in directory
- Handle nested month directories (e.g., `Learning/2026-01/`)
- Return absolute paths
- Convert entries to embedding inputs with source IDs

**Tests**: ~7 tests
- Scan directory with files
- Handle nested directories
- Skip non-.md files
- Handle missing directory (return empty)
- Convert entries to embedding inputs

---

## Group 3: Indexer Module

### T-3.1: Create state management [T]

**File**: `src/memory-indexer.ts`

**Functions**:
```typescript
loadMemoryIndexState(stateFile: string): Promise<MemoryIndexState>
saveMemoryIndexState(stateFile: string, state: MemoryIndexState): Promise<void>
```

**Behavior**:
- Load state from JSON file
- Return empty state if file missing/invalid
- Ensure parent directory exists on save

**Tests**: ~6 tests
- Load existing state
- Load missing file (return empty)
- Load corrupt file (return empty)
- Save and reload state
- Create parent directory

---

### T-3.2: Create change detection [T]

**File**: `src/memory-indexer.ts`

**Functions**:
```typescript
detectChangedFiles(
  files: Map<string, string[]>,
  state: MemoryIndexState
): Promise<ChangedMemoryFile[]>

interface ChangedMemoryFile {
  filePath: string;
  filename: string;
  mtime: number;
  isNew: boolean;
  captureType: MemoryCaptureType;
}
```

**Behavior**:
- Compare file mtime against indexed state
- Return files where mtime > lastModified
- Include new files not in state
- Determine capture type from path

**Tests**: ~8 tests
- Detect new files
- Detect modified files
- Skip unchanged files
- Handle mixed (new + modified + unchanged)
- Capture type inference

---

### T-3.3: Create sync operations [T]

**File**: `src/memory-indexer.ts`

**Functions**:
```typescript
syncMemoryIndex(
  config: MemoryConfig,
  options?: { fullReindex?: boolean; verbose?: boolean }
): Promise<MemorySyncResult>

clearMemoryIndex(stateFile: string): Promise<void>

interface MemorySyncResult {
  filesProcessed: number;
  filesIndexed: number;
  entriesIndexed: number;
  durationMs: number;
  fullReindex: boolean;
}
```

**Behavior**:
- Scan all configured directories
- Detect changed files (or all files if fullReindex)
- Parse and filter entries
- Update state with new file info
- Return statistics

**Tests**: ~10 tests
- Incremental sync (only changed)
- Full reindex (all files)
- Skip invalid files
- Update state correctly
- Clear index
- Handle empty directories
- Report accurate statistics

---

## Group 4: Integration

### T-4.1: Update ResonaAdapter for memory source [T]

**File**: `src/resona-adapter.ts`

**Change**:
```typescript
private parseSourceType(sourceId: string): SourceType {
  if (sourceId.startsWith("memory:")) {
    return "memory";
  }
  if (sourceId.startsWith("maestro:") || sourceId === "maestro") {
    return "maestro";
  }
  // ... rest unchanged
}
```

**Tests**: ~3 tests
- Parse memory source ID
- Distinguish from other source types
- Handle edge cases

---

### T-4.2: Verify Tier 2 search returns memory results [T]

**Tests**: Integration test verifying:
- Memory source type appears in search results
- Source field correctly set to "memory"
- Results ranked appropriately

---

## Group 5: CLI & Exports

### T-5.1: Add memory exports to index.ts

**File**: `src/index.ts`

**Exports**:
```typescript
// Memory Indexing (F-006)
export type { MemoryCaptureType, MemoryEntry, MemoryEmbeddingInput, ... } from "./memory-types";
export { MEMORY_CONFIG, generateSourceId, parseSourceId, ... } from "./memory-types";
export { parseMemoryFile, scanMemoryDirectory, ... } from "./memory-parser";
export { syncMemoryIndex, clearMemoryIndex, ... } from "./memory-indexer";
```

---

### T-5.2: Add CLI commands for memory indexing

**File**: `src/cli.ts`

**Commands**:
- `acr --index-memory` - Incremental sync
- `acr --index-memory-full` - Full reindex
- Update `acr --status` to show memory stats

**Help text update**:
```
acr --index-memory       Index PAI memory (Learning, Decisions, Research)
acr --index-memory-full  Full reindex of PAI memory
```

---

## Task Summary

| Task | Description | Type | Est. Tests |
|------|-------------|------|------------|
| T-1.1 | memory-types.ts schemas | [T] | 20 |
| T-1.2 | Add memory to SourceType | [T] | 3 |
| T-2.1 | Frontmatter extraction | [T] | 10 |
| T-2.2 | File parser | [T] | 8 |
| T-2.3 | Directory scanner | [T] | 7 |
| T-3.1 | State management | [T] | 6 |
| T-3.2 | Change detection | [T] | 8 |
| T-3.3 | Sync operations | [T] | 10 |
| T-4.1 | ResonaAdapter update | [T] | 3 |
| T-4.2 | Tier 2 integration test | [T] | 3 |
| T-5.1 | index.ts exports | - | 0 |
| T-5.2 | CLI commands | - | 0 |

**Total**: 12 tasks, ~78 tests

## Execution Order

```
T-1.1 → T-1.2 → T-2.1 → T-2.2 → T-2.3 → T-3.1 → T-3.2 → T-3.3 → T-4.1 → T-4.2 → T-5.1 → T-5.2
```

All [T] tasks follow TDD: RED (failing test) → GREEN (implementation) → BLUE (refactor)
