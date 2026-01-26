# F-007: Resona Integration - Tasks

## Task Groups

### Group 1: Infrastructure (T-1.x)
Dependencies, types, and core modules.

### Group 2: Embedding Service (T-2.x)
Ollama API integration for generating embeddings.

### Group 3: Vector Store (T-3.x)
LanceDB integration for storing and searching embeddings.

### Group 4: Indexer Integration (T-4.x)
Wire embedding service into existing indexers.

### Group 5: Search Integration (T-5.x)
Update ResonaAdapter to use vector store for search.

### Group 6: CLI & Polish (T-6.x)
CLI updates, status improvements, documentation.

---

## Group 1: Infrastructure

### T-1.1: Add Dependencies
**File**: `package.json`
**Tests**: Build verification

Add required packages:
```bash
bun add @lancedb/lancedb apache-arrow
```

**Acceptance**:
- Packages install without errors
- `bun test` still passes

### T-1.2: Create Embedding Types
**File**: `src/embedding-types.ts`
**Tests**: `tests/embedding-types.test.ts` (~15 tests)

```typescript
// Types
EmbeddingInputSchema        // Unified input for embedding
EmbeddingRecordSchema       // LanceDB record schema
EmbeddingConfigSchema       // Configuration options

// Constants
EMBEDDING_CONFIG = {
  ollamaUrl: "http://localhost:11434",
  model: "nomic-embed-text",
  dimensions: 768,
  batchSize: 50,
  timeout: 30000,
  dbPath: "~/.claude/embeddings/acr.lance",
}
```

**Acceptance**:
- All schemas validate correctly
- Config has sensible defaults
- Tests pass

---

## Group 2: Embedding Service

### T-2.1: Create Embedding Service - Core
**File**: `src/embedding-service.ts`
**Tests**: `tests/embedding-service.test.ts` (~20 tests)

```typescript
class EmbeddingService {
  constructor(config?: Partial<EmbeddingConfig>)

  // Health check
  async isHealthy(): Promise<boolean>

  // Single embedding
  async embed(text: string): Promise<Float32Array | null>

  // Batch embedding
  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]>
}
```

**Acceptance**:
- Health check detects Ollama availability
- Returns null gracefully when Ollama unavailable
- Batch respects configured batch size
- Timeout handling works

### T-2.2: Embedding Service - Error Handling
**File**: `src/embedding-service.ts`
**Tests**: Additional tests in `tests/embedding-service.test.ts` (~10 tests)

Handle edge cases:
- Empty text input
- Very long text (truncation)
- Network timeouts
- Invalid responses
- Ollama model not found

**Acceptance**:
- Graceful degradation for all error cases
- Clear error messages logged
- Never throws, returns null on failure

---

## Group 3: Vector Store

### T-3.1: Create Vector Store - Schema
**File**: `src/vector-store.ts`
**Tests**: `tests/vector-store.test.ts` (~15 tests)

```typescript
// LanceDB table schema
interface EmbeddingRecord {
  id: string;            // sourceId
  vector: Float32Array;  // 768-dim embedding
  content: string;       // Original text
  source: string;        // "maestro" | "memory"
  metadata: string;      // JSON string
  timestamp: number;     // For decay
  created_at: number;    // Index time
}

class VectorStore {
  constructor(dbPath: string)
  async initialize(): Promise<void>
  async getTableStats(): Promise<{ count: number; sources: Record<string, number> }>
}
```

**Acceptance**:
- Creates LanceDB database if not exists
- Schema matches EmbeddingRecord
- Stats query works

### T-3.2: Vector Store - Write Operations
**File**: `src/vector-store.ts`
**Tests**: Additional tests (~15 tests)

```typescript
class VectorStore {
  // Insert/update
  async upsert(records: EmbeddingRecord[]): Promise<number>

  // Delete by source ID
  async delete(sourceIds: string[]): Promise<number>

  // Delete by source type
  async deleteBySource(source: "maestro" | "memory"): Promise<number>
}
```

**Acceptance**:
- Upsert handles new and existing records
- Delete operations return count of affected records
- Batch operations respect limits

### T-3.3: Vector Store - Search Operations
**File**: `src/vector-store.ts`
**Tests**: Additional tests (~15 tests)

```typescript
class VectorStore {
  // Vector similarity search
  async search(
    queryVector: Float32Array,
    limit: number,
    filter?: { source?: string; minTimestamp?: number }
  ): Promise<SearchResult[]>

  // Get by ID
  async get(sourceId: string): Promise<EmbeddingRecord | null>
}

interface SearchResult {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  similarity: number;
  timestamp: number;
}
```

**Acceptance**:
- Search returns results sorted by similarity
- Filter by source works
- Similarity scores in 0-1 range

---

## Group 4: Indexer Integration

### T-4.1: Create Unified Indexing Function
**File**: `src/embedding-indexer.ts`
**Tests**: `tests/embedding-indexer.test.ts` (~20 tests)

```typescript
interface IndexingResult {
  processed: number;
  embedded: number;
  failed: number;
  errors: string[];
}

async function indexEmbeddings(
  inputs: EmbeddingInput[],
  embeddingService: EmbeddingService,
  vectorStore: VectorStore,
  options?: { batchSize?: number; onProgress?: (n: number) => void }
): Promise<IndexingResult>
```

**Acceptance**:
- Batches inputs according to config
- Reports progress via callback
- Handles partial failures gracefully
- Returns accurate counts

### T-4.2: Integrate with Maestro Indexer
**File**: `src/maestro-indexer.ts`
**Tests**: Update existing tests (~5 tests)

Modify `syncMaestroIndex()`:
1. After parsing entries, call `indexEmbeddings()`
2. Pass embedding service and vector store
3. Update result to include embedding counts

**Acceptance**:
- `acr --index-maestro` generates real embeddings
- State file tracks embedding status
- Graceful fallback if Ollama unavailable

### T-4.3: Integrate with Memory Indexer
**File**: `src/memory-indexer.ts`
**Tests**: Update existing tests (~5 tests)

Modify `syncMemoryIndex()`:
1. Remove `dryRun` logic (or make it optional)
2. Call `indexEmbeddings()` with parsed entries
3. Update result to include embedding counts

**Acceptance**:
- `acr --index-memory` generates real embeddings
- State file tracks embedding status
- Graceful fallback if Ollama unavailable

---

## Group 5: Search Integration

### T-5.1: Update ResonaAdapter for Vector Search
**File**: `src/resona-adapter.ts`
**Tests**: Update `tests/resona-adapter.test.ts` (~10 tests)

```typescript
class ResonaAdapter {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;

  constructor(config?: ResonaAdapterConfig)

  // Updated to use vector store
  async searchUnified(query: string, limit: number): Promise<UnifiedResult[]>

  // Updated to return real stats
  async getSourceStats(): Promise<SourceStats>
}
```

**Acceptance**:
- Search queries vector store with embedded query
- Results include similarity scores
- Stats reflect actual embedding counts

### T-5.2: Source Filtering
**File**: `src/resona-adapter.ts`
**Tests**: Additional tests (~5 tests)

Add source filtering to search:
```typescript
async searchUnified(
  query: string,
  limit: number,
  options?: { sources?: SourceType[]; minSimilarity?: number }
): Promise<UnifiedResult[]>
```

**Acceptance**:
- Can filter by source type (maestro, memory)
- Minimum similarity threshold works
- Empty sources array means search all

---

## Group 6: CLI & Polish

### T-6.1: CLI --index-all Command
**File**: `src/cli.ts`
**Tests**: Manual testing

Add command to index both sources:
```bash
acr --index-all        # Incremental
acr --index-all-full   # Full reindex
```

**Acceptance**:
- Indexes maestro then memory
- Reports combined stats
- Handles errors from either source

### T-6.2: CLI --status Embedding Counts
**File**: `src/cli.ts`
**Tests**: Manual testing

Update status output:
```
ACR Status
==========

Maestro Sessions:
  Entries indexed: 68
  Embeddings stored: 68
  Files tracked: 14
  Last sync: 2026-01-26T14:00:00Z

PAI Memory:
  Files indexed: 2126
  Embeddings stored: 2126
  Last sync: 2026-01-26T14:00:00Z

Vector Database:
  Total embeddings: 2194
  Database size: 12.3 MB
  Path: ~/.claude/embeddings/acr.lance
```

**Acceptance**:
- Shows embedding counts from vector store
- Shows database size
- Graceful output if DB doesn't exist

### T-6.3: Export New Modules
**File**: `src/index.ts`
**Tests**: Import verification

Export:
- EmbeddingService class and types
- VectorStore class and types
- indexEmbeddings function

**Acceptance**:
- All new exports accessible from package
- No circular dependencies

---

## Test Summary

| Group | New Tests | Modified Tests | Total |
|-------|-----------|----------------|-------|
| G1: Infrastructure | 15 | 0 | 15 |
| G2: Embedding Service | 30 | 0 | 30 |
| G3: Vector Store | 45 | 0 | 45 |
| G4: Indexer Integration | 20 | 10 | 30 |
| G5: Search Integration | 15 | 10 | 25 |
| G6: CLI & Polish | 0 | 0 | 0 |
| **Total** | **125** | **20** | **145** |

---

## Implementation Order

```
T-1.1 → T-1.2 → T-2.1 → T-2.2 → T-3.1 → T-3.2 → T-3.3
                                          ↓
T-6.3 ← T-6.2 ← T-6.1 ← T-5.2 ← T-5.1 ← T-4.1 → T-4.2 → T-4.3
```

**Critical Path**: T-1.1 → T-1.2 → T-2.1 → T-3.1 → T-4.1 → T-5.1

---

## Risk Mitigation

| Task | Risk | Mitigation |
|------|------|------------|
| T-1.1 | LanceDB native deps | Use pure JS fallback if needed |
| T-2.1 | Ollama not installed | Mock in tests, graceful runtime fallback |
| T-3.2 | Large batch writes | Chunk into smaller batches |
| T-4.2/T-4.3 | Breaking existing behavior | Feature flag for embedding |
| T-5.1 | Search performance | Add caching layer if needed |
