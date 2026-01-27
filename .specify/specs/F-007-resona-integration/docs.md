# F-007 Documentation Updates

## Files Updated

### Source Files

| File | Purpose |
|------|---------|
| `src/embedding-types.ts` | Zod schemas for embedding configuration |
| `src/embedding-service.ts` | Ollama API integration for embeddings |
| `src/vector-store.ts` | LanceDB vector storage and search |
| `src/embedding-indexer.ts` | Unified indexing function |
| `src/resona-adapter.ts` | Updated for vector search |

### Test Files

| File | Tests |
|------|-------|
| `tests/embedding-types.test.ts` | Schema validation |
| `tests/embedding-service.test.ts` | Ollama integration tests |
| `tests/vector-store.test.ts` | LanceDB operations |
| `tests/embedding-indexer.test.ts` | Indexing pipeline |
| `tests/resona-adapter.test.ts` | Search integration |

## API Documentation

### EmbeddingService

```typescript
class EmbeddingService {
  constructor(config?: Partial<EmbeddingConfig>)
  async isHealthy(): Promise<boolean>
  async embed(text: string): Promise<Float32Array | null>
  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]>
}
```

### VectorStore

```typescript
class VectorStore {
  constructor(dbPath: string)
  async initialize(): Promise<void>
  async upsert(records: EmbeddingRecord[]): Promise<number>
  async search(queryVector: Float32Array, limit: number): Promise<SearchResult[]>
  async getTableStats(): Promise<{ count: number }>
}
```

### indexEmbeddings

```typescript
async function indexEmbeddings(
  inputs: EmbeddingInput[],
  embeddingService: EmbeddingService,
  vectorStore: VectorStore,
  options?: { batchSize?: number }
): Promise<IndexingResult>
```

## Configuration

Default embedding config in `src/embedding-types.ts`:
```typescript
EMBEDDING_CONFIG = {
  ollamaUrl: "http://localhost:11434",
  model: "nomic-embed-text",
  dimensions: 768,
  batchSize: 50,
  timeout: 30000,
  dbPath: "~/.claude/embeddings/acr.lance",
}
```

## Changelog

| Date | Change |
|------|--------|
| 2026-01-26 | Feature specified and planned |
| 2026-01-26 | Implementation complete |
| 2026-01-27 | Documentation updated |
