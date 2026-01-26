---
feature: "ACR Tier 2 - Resona Semantic Retrieval"
spec: "./spec.md"
status: "draft"
created: "2026-01-25"
---

# Technical Plan: ACR Tier 2 - Resona Semantic Retrieval

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ACR TIER 2 SEMANTIC RETRIEVAL                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TIER 1 (F-001)              ACTIVATION                   TIER 2           │
│  ┌──────────┐               ┌───────────┐              ┌──────────────┐    │
│  │ GrepResult│──escalate?──▶│ Activation│──────────────▶│  Query       │    │
│  │          │               │   Gate    │              │  Constructor │    │
│  └──────────┘               └───────────┘              └──────┬───────┘    │
│                                   │                           │             │
│                                   │                           ▼             │
│                                   │                    ┌──────────────┐    │
│                                   │                    │ Resona       │    │
│                                   │                    │ EmbeddingAPI │    │
│                                   │                    └──────┬───────┘    │
│                                   │                           │             │
│                                   │                           ▼             │
│  SOURCES                         │                    ┌──────────────┐    │
│  ┌──────────┐                    │                    │ UnifiedSearch│    │
│  │ USER/    │────embedded────────┼────────────────────│ Service      │    │
│  └──────────┘                    │                    └──────┬───────┘    │
│  ┌──────────┐                    │                           │             │
│  │ Sessions │────embedded────────┼───────────────────────────┤             │
│  │ .jsonl   │                    │                           │             │
│  └──────────┘                    │                           ▼             │
│  ┌──────────┐                    │                    ┌──────────────┐    │
│  │ Tana     │────embedded────────┼───────────────────▶│   Result     │    │
│  │ exports  │                    │                    │   Ranker     │    │
│  └──────────┘                    │                    └──────┬───────┘    │
│                                   │                           │             │
│                                   │                           ▼             │
│                                   │                    ┌──────────────┐    │
│                                   │                    │ Semantic     │◀───┤
│                                   └───callback─────────│ Result       │    │
│                                                        └──────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Activation Gate

**Purpose:** Determine when to trigger Tier 2 semantic search

**Location:** `~/.claude/skills/CORE/src/acr/tier2-activation.ts`

```typescript
interface ActivationDecision {
  shouldActivate: boolean;
  reason: 'low_confidence' | 'no_results' | 'explicit_request' | 'disabled';
  tier1Result: GrepResult;
}

function shouldActivateTier2(
  tier1Result: GrepResult,
  prompt: string,
  config: ACRConfig
): ActivationDecision;
```

**Activation conditions:**
1. `tier1Result.aggregateConfidence < config.tier2Threshold` (default: 0.7)
2. `tier1Result.matches.length === 0`
3. Prompt contains trigger phrases: "remember when", "we discussed", "earlier session"
4. `ACR_TIER2_ENABLED !== 'false'`

### 2. Query Constructor

**Purpose:** Transform session context into optimal semantic query

**Location:** `~/.claude/skills/CORE/src/acr/tier2-query.ts`

```typescript
interface SemanticQuery {
  queryText: string;
  projectContext: string;
  temporalHint?: 'recent' | 'any';
  sourcePreference?: ('user' | 'session' | 'tana')[];
}

function constructSemanticQuery(
  prompt: string,
  context: SearchContext,
  tier1Matches: EntityMatch[]
): SemanticQuery;
```

**Query construction strategy:**
1. Extract key noun phrases from prompt (not just proper nouns)
2. Include project name for context grounding
3. Incorporate Tier 1 matched entities as query expansion
4. Apply temporal hints from prompt ("last week", "recently")

### 3. Resona Integration Layer

**Purpose:** Abstract Resona library for ACR-specific usage

**Location:** `~/.claude/skills/CORE/src/acr/resona-adapter.ts`

```typescript
interface ResonaAdapter {
  searchUnified(query: string, limit: number): Promise<UnifiedResult[]>;
  getSourceStats(): Promise<SourceStats>;
  isHealthy(): Promise<boolean>;
}

interface UnifiedResult {
  id: string;
  content: string;
  source: 'user' | 'session' | 'tana';
  sourceId: string;
  similarity: number;
  metadata: Record<string, unknown>;
}
```

**Integration points:**
- Uses `resona` library from `~/work/resona`
- Registers three sources: user, session, tana
- LanceDB path: `~/.claude/embeddings/acr.lance`

### 4. Session Synopsis Indexer

**Purpose:** Parse and embed Claude session synopses

**Location:** `~/.claude/skills/CORE/src/acr/session-indexer.ts`

```typescript
interface SessionSynopsis {
  sessionId: string;
  projectPath: string;
  synopsis: string;
  createdAt: Date;
  messageCount: number;
}

function parseSessionHistory(jsonlPath: string): SessionSynopsis[];
function indexSessions(sessions: SessionSynopsis[]): Promise<void>;
```

**Session history location:** `~/.claude/projects/*/*.jsonl`

**Synopsis extraction:**
- Look for compaction entries with `type: "summary"`
- Extract `summary.conversation_summary` or equivalent field
- Use first user message + tool count as fallback synopsis

### 5. Result Ranker

**Purpose:** Merge, deduplicate, and rank results from multiple sources

**Location:** `~/.claude/skills/CORE/src/acr/tier2-ranker.ts`

```typescript
interface RankedResult {
  content: string;
  source: 'user' | 'session' | 'tana';
  sourceId: string;
  similarity: number;
  rank: number;
  dedupHash: string;
}

function rankResults(
  results: UnifiedResult[],
  config: RankingConfig
): RankedResult[];
```

**Ranking algorithm:**
1. Sort by similarity descending
2. Apply source priority boost: user (+0.1), session (+0.05), tana (+0)
3. Deduplicate by content hash (first 500 chars + source)
4. Cap at `config.maxResults` (default: 10)

### 6. Main Entry Point

**Purpose:** Orchestrate full Tier 2 pipeline

**Location:** `~/.claude/skills/CORE/src/acr/tier2-resona.ts`

```typescript
interface SemanticResult {
  results: RankedResult[];
  queryLatencyMs: number;
  embeddingLatencyMs: number;
  totalLatencyMs: number;
  activated: boolean;
  activationReason?: string;
}

async function runTier2Semantic(
  tier1Result: GrepResult,
  prompt: string,
  config?: Partial<Tier2Config>
): Promise<SemanticResult>;
```

## Data Models

### SemanticResult Schema (Zod)

```typescript
const SemanticResultSchema = z.object({
  results: z.array(z.object({
    content: z.string(),
    source: z.enum(['user', 'session', 'tana']),
    sourceId: z.string(),
    similarity: z.number().min(0).max(1),
    rank: z.number().int().nonnegative(),
  })),
  queryLatencyMs: z.number().nonnegative(),
  embeddingLatencyMs: z.number().nonnegative(),
  totalLatencyMs: z.number().nonnegative(),
  activated: z.boolean(),
  activationReason: z.string().optional(),
});
```

### Embedding Storage Schema (LanceDB)

| Column | Type | Description |
|--------|------|-------------|
| id | string | Unique document ID |
| source | string | 'user' \| 'session' \| 'tana' |
| source_id | string | File path or session ID |
| content | string | Text content (max 2000 chars) |
| vector | vector[1024] | bge-m3 embedding |
| created_at | timestamp | Indexing timestamp |
| content_hash | string | SHA-256 of content (first 500 chars) |

## Integration Points

### Upstream: F-001 Tier 1

```typescript
// Import from Tier 1
import { GrepResult, SearchContext } from '../acr/types';

// Tier 1 provides escalation signal
if (tier1Result.escalateToTier2) {
  const tier2Result = await runTier2Semantic(tier1Result, prompt);
}
```

### Downstream: F-003 Context Injection

```typescript
// Export for context injection
export { SemanticResult, runTier2Semantic };

// F-003 will consume:
// - SemanticResult.results for context formatting
// - SemanticResult.activated for conditional injection
```

### External: Resona Library

```typescript
// Import from ~/work/resona (via bun link or relative path)
import { EmbeddingService, OllamaProvider, UnifiedSearchService } from 'resona';

// Provider: bge-m3 via Ollama
const provider = new OllamaProvider('bge-m3');
```

## Failure Mode Analysis

| Failure | Detection | Response | Recovery |
|---------|-----------|----------|----------|
| Ollama not running | Connection refused | Return empty result, log warning | Suggest `ollama serve` |
| LanceDB corrupted | Query throws | Return empty result, log error | Suggest `rm ~/.claude/embeddings/acr.lance` |
| bge-m3 not pulled | Model not found error | Return empty result, log | Suggest `ollama pull bge-m3` |
| Embedding timeout | >5s latency | Return partial results | Continue with available data |
| No session history | Empty directory | Skip session source | Log info, continue with user/tana |
| Resona not installed | Import fails | Fatal: ACR Tier 2 disabled | Install resona package |

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| P95 latency | <200ms | End-to-end from activation to results |
| P99 latency | <500ms | Including cold embedding model |
| Memory | <50MB | LanceDB memory-mapped, streaming results |
| Embedding batch | 100 docs/sec | Initial indexing throughput |

## Configuration

```typescript
interface Tier2Config {
  // Activation
  activationThreshold: number;  // default: 0.7
  enabled: boolean;             // default: true (env: ACR_TIER2_ENABLED)

  // Search
  maxResults: number;           // default: 10
  minSimilarity: number;        // default: 0.6
  searchTimeout: number;        // default: 5000ms

  // Sources
  sourcePriority: Record<'user' | 'session' | 'tana', number>;

  // Paths
  embeddingDbPath: string;      // default: ~/.claude/embeddings/acr.lance
  sessionHistoryPath: string;   // default: ~/.claude/projects
}
```

## Test Strategy

### Unit Tests
- Query constructor with various prompt types
- Result ranker deduplication and sorting
- Activation gate logic
- Session synopsis parsing

### Integration Tests
- Full pipeline with mock Resona
- LanceDB read/write cycle
- Session history parsing from real .jsonl files

### Performance Tests
- 100 queries benchmark for P95/P99
- Memory usage during large searches
- Embedding batch throughput

## Constitutional Compliance

| Principle | How This Feature Complies |
|-----------|--------------------------|
| **Care Compounds** | Memory accumulates via embeddings; sessions persist as searchable context |
| **Trust Grows Capability** | Autonomous retrieval without user prompting builds trust |
| **Relationship Cultivates Results** | Shared context from past sessions strengthens relationship |
| **Graceful Degradation** | All failures return empty results, never crash session |
| **Observability** | Latency metrics exposed; activation reasons logged |

## Open Decisions

| Decision | Options | Recommendation | Rationale |
|----------|---------|----------------|-----------|
| Embedding model | bge-m3, nomic-embed-text | bge-m3 | Better multilingual support, Resona default |
| Session indexing frequency | On-demand, daily cron, continuous | On-demand + daily | Balance freshness with performance |
| Content chunk size | 500, 1000, 2000 chars | 1000 | Optimal for bge-m3 context window |

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| resona | local (~/work/resona) | Embedding service |
| lancedb | (via resona) | Vector storage |
| ollama | system | bge-m3 model host |
| zod | ^3.22 | Schema validation |

## File Structure

```
~/.claude/skills/CORE/
├── src/acr/
│   ├── index.ts              # Exports both tiers
│   ├── tier2-activation.ts   # Activation gate
│   ├── tier2-query.ts        # Query construction
│   ├── tier2-ranker.ts       # Result ranking
│   ├── tier2-resona.ts       # Main entry point
│   ├── resona-adapter.ts     # Resona integration
│   └── session-indexer.ts    # Session parsing
├── tests/acr/
│   ├── tier2-activation.test.ts
│   ├── tier2-query.test.ts
│   ├── tier2-ranker.test.ts
│   └── tier2-resona.test.ts
└── embeddings/               # LanceDB storage (runtime)
    └── acr.lance/
```
