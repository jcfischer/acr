# F-007: Resona Integration - Implementation Plan

## Current State Analysis

### What's Built (95%)
- ✅ Type schemas and Zod validation for all data structures
- ✅ Maestro history parsing and filtering logic
- ✅ Memory markdown parsing with frontmatter extraction
- ✅ Incremental sync with state persistence
- ✅ ResonaAdapter interface/abstraction layer
- ✅ CLI commands for indexing
- ✅ Tier 2 activation gate and query construction
- ✅ Result ranking and deduplication
- ✅ Ollama health checks

### What's Missing (5%)
- ❌ Actual Resona/embedding library dependency
- ❌ LanceDB vector storage integration
- ❌ Ollama embedding API calls
- ❌ Search source registration from indexers
- ❌ CLI `dryRun: false` enablement

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI (cli.ts)                            │
│  --index-maestro  --index-memory  --index-all  --tier2  --status│
└──────────────┬───────────────────────────┬──────────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│   maestro-indexer.ts     │   │   memory-indexer.ts      │
│   syncMaestroIndex()     │   │   syncMemoryIndex()      │
│        │                 │   │        │                 │
│        ▼                 │   │        ▼                 │
│   MaestroEmbeddingInput  │   │   MemoryEmbeddingInput   │
└──────────┬───────────────┘   └──────────┬───────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
            ┌─────────────────────────┐
            │   embedding-service.ts  │  ← NEW
            │   embedBatch()          │
            │   deleteBySourceId()    │
            └───────────┬─────────────┘
                        │
           ┌────────────┴────────────┐
           ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│  Ollama API      │      │  LanceDB         │
│  nomic-embed-text│      │  ~/.claude/      │
│  localhost:11434 │      │  embeddings/     │
└──────────────────┘      │  acr.lance       │
                          └──────────────────┘
                                   │
                                   ▼
            ┌─────────────────────────┐
            │   resona-adapter.ts     │
            │   searchUnified()       │
            │        │                │
            │        ▼                │
            │   vector similarity     │
            │   search via LanceDB    │
            └─────────────────────────┘
```

## Implementation Approach

### Option A: Direct LanceDB + Ollama (Recommended)
- Add `@lancedb/lancedb` and `ollama` packages directly
- Build thin wrapper for embedding and search
- Full control, minimal dependencies

### Option B: Use Resona Library
- Import existing Resona library from ~/work/resona
- Leverage existing EmbeddingService and VectorStore
- More features but external dependency

**Decision: Option A** - Direct integration gives us control and avoids external dependency management.

## Data Models

### LanceDB Schema
```typescript
interface EmbeddingRecord {
  id: string;           // sourceId (maestro:... or memory:...)
  vector: Float32Array; // 768-dim nomic-embed-text embedding
  content: string;      // Original text for display
  source: string;       // "maestro" | "memory"
  metadata: string;     // JSON-encoded additional data
  timestamp: number;    // Unix timestamp for decay
  created_at: number;   // When indexed
}
```

### Embedding Input (Unified)
```typescript
interface EmbeddingInput {
  sourceId: string;
  content: string;
  source: "maestro" | "memory";
  metadata: Record<string, unknown>;
  timestamp: number;
}
```

## Key Integration Points

### 1. maestro-indexer.ts (Line 201-226)
```typescript
// Current: indexEntries() just counts
// Change: Call embedding service
async function indexEntries(entries, embeddingService) {
  const inputs = entries.map(e => ({
    sourceId: e.sourceId,
    content: e.content,
    source: "maestro",
    metadata: { entryType: e.entryType, sessionFile: e.sessionFile },
    timestamp: e.timestamp.getTime(),
  }));
  return await embeddingService.embedBatch(inputs);
}
```

### 2. memory-indexer.ts (Line 219-224)
```typescript
// Current: console.log with TODO
// Change: Call embedding service
if (!config.dryRun && embeddingInputs.length > 0) {
  const inputs = embeddingInputs.map(e => ({
    sourceId: e.sourceId,
    content: e.content,
    source: "memory",
    metadata: e.metadata,
    timestamp: e.metadata.timestamp,
  }));
  await embeddingService.embedBatch(inputs);
}
```

### 3. cli.ts (Line 92)
```typescript
// Current: dryRun: true
// Change: dryRun: false (after embedding service ready)
```

### 4. resona-adapter.ts (searchUnified)
```typescript
// Current: Searches registered sources (empty)
// Change: Query LanceDB directly for vector similarity
async searchUnified(query: string, limit: number) {
  const queryVector = await this.embed(query);
  const results = await this.vectorStore.search(queryVector, limit);
  return results.map(r => this.toUnifiedResult(r));
}
```

## Module Structure

### New Files
```
src/
├── embedding-service.ts    # Ollama API wrapper
├── vector-store.ts         # LanceDB operations
└── embedding-types.ts      # Shared types
```

### Modified Files
```
src/
├── maestro-indexer.ts      # Add embedding calls
├── memory-indexer.ts       # Add embedding calls
├── resona-adapter.ts       # LanceDB search
├── cli.ts                  # Remove dryRun, add --index-all
└── index.ts                # Export new modules
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| Ollama not running | Log warning, skip embedding, continue state tracking |
| LanceDB locked | Retry with backoff, fail gracefully after 3 attempts |
| Embedding timeout | Skip entry, log error, continue batch |
| Invalid content | Skip entry, log warning, continue |
| Disk full | Fail loudly, don't corrupt state |

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Single embedding | <100ms | Ollama local |
| Batch 100 entries | <5s | Parallel where possible |
| Full maestro index | <30s | ~70 entries |
| Full memory index | <5min | ~2100 entries |
| Incremental sync | <1s | When no changes |
| Vector search | <50ms | LanceDB is fast |

## Testing Strategy

### Unit Tests
- Embedding service mock (don't require Ollama)
- Vector store operations with temp DB
- Source registration and search flow

### Integration Tests
- Requires Ollama running
- End-to-end indexing
- Search result verification

### Test Fixtures
- Sample maestro history JSON
- Sample memory markdown files
- Pre-computed embeddings for mocking

## Rollout Plan

### Phase 1: Infrastructure
1. Add dependencies (lancedb, ollama)
2. Create embedding-service.ts
3. Create vector-store.ts
4. Unit tests with mocks

### Phase 2: Indexer Integration
1. Wire maestro-indexer to embedding service
2. Wire memory-indexer to embedding service
3. Integration tests

### Phase 3: Search Integration
1. Update resona-adapter to use vector store
2. Auto-register sources on search
3. End-to-end search tests

### Phase 4: CLI & Polish
1. Remove dryRun flags
2. Add --index-all command
3. Update --status with embedding counts
4. Documentation

## Dependencies to Add

```json
{
  "dependencies": {
    "@lancedb/lancedb": "^0.4.0",
    "apache-arrow": "^15.0.0"
  }
}
```

Note: Ollama API is HTTP-based, no package needed.

## Configuration

### Environment Variables
```bash
ACR_OLLAMA_URL=http://localhost:11434  # Default
ACR_EMBEDDING_MODEL=nomic-embed-text   # Default
ACR_VECTOR_DB_PATH=~/.claude/embeddings/acr.lance
```

### TIER2_CONFIG Updates
```typescript
export const TIER2_CONFIG = {
  // Existing...
  ollamaUrl: process.env.ACR_OLLAMA_URL || "http://localhost:11434",
  embeddingModel: process.env.ACR_EMBEDDING_MODEL || "nomic-embed-text",
  embeddingDbPath: process.env.ACR_VECTOR_DB_PATH || "~/.claude/embeddings/acr.lance",
  embeddingBatchSize: 50,
  embeddingTimeout: 30000,
};
```

## Success Criteria

1. **Functional**: `acr --tier2 "query"` returns relevant semantic matches
2. **Performance**: Full index <5min, incremental <1s
3. **Reliability**: Graceful degradation when Ollama unavailable
4. **Observability**: Clear status output with embedding counts
