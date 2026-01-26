# ACR - Autonomous Contextual Recall

Two-tier architecture for automatic context retrieval in Claude Code sessions.

## Overview

ACR automatically detects entities in user prompts and retrieves relevant context from multiple sources:

- **Tier 1 (Grep)**: Fast pattern matching for explicit entity mentions
- **Tier 2 (Resona)**: Semantic search when Tier 1 confidence is low

## Architecture

```
User Prompt
     │
     ▼
┌─────────────┐
│   Tier 1    │  Fast grep-based entity detection
│   (Grep)    │  Searches: project files, user context, Tana exports
└─────┬───────┘
      │
      ├─── High Confidence (≥0.7) ──→ Return grep matches
      │
      ▼
┌─────────────┐
│   Tier 2    │  Semantic search via Resona embeddings
│  (Resona)   │  Sources: user docs, session history, Tana
└─────────────┘
```

## Quick Start

```typescript
import { runTier1Grep, runTier2Semantic } from './acr';

// Tier 1: Fast grep search
const tier1Result = await runTier1Grep(prompt, projectPath);

// Check if should escalate to Tier 2
if (tier1Result.escalateToTier2) {
  const tier2Result = await runTier2Semantic(tier1Result, prompt);
  console.log('Semantic results:', tier2Result.results);
} else {
  console.log('Grep matches:', tier1Result.matches);
}
```

## Tier 1 - Grep-Based Detection

### Entry Point
- `runTier1Grep(prompt, projectPath)` - Main function

### Features
- Entity extraction from prompts (proper nouns, technical terms)
- Pattern matching across project files
- Confidence scoring based on match quality
- Escalation decision for Tier 2

### Files
| File | Purpose |
|------|---------|
| `tier1-grep.ts` | Main grep orchestration |
| `entity-extractor.ts` | NLP-based entity extraction |
| `context-loader.ts` | Load user/project context |
| `config.ts` | Tier 1 configuration |
| `types.ts` | Shared type definitions |

## Tier 2 - Semantic Search

### Entry Point
- `runTier2Semantic(tier1Result, prompt, options?)` - Main function

### Activation Conditions
Tier 2 activates when:
1. Tier 1 confidence < 0.7 (configurable)
2. Tier 1 returns no results
3. Explicit trigger phrases detected ("remember when", "we discussed", etc.)

### Pipeline
```
Activation Gate → Query Construction → Resona Search → Result Ranking
```

### Files
| File | Purpose |
|------|---------|
| `tier2-resona.ts` | Main orchestration entry point |
| `tier2-types.ts` | TypeScript interfaces + Zod schemas |
| `tier2-config.ts` | Configuration + trigger phrases |
| `tier2-activation.ts` | Activation decision logic |
| `tier2-query.ts` | Semantic query construction |
| `resona-adapter.ts` | Resona library integration |
| `session-indexer.ts` | Session history parsing |
| `tier2-ranker.ts` | Result ranking + deduplication |

### Source Priority
Results are boosted by source type:
- **User context**: +0.1 (highest priority)
- **Session history**: +0.05
- **Tana exports**: +0.0 (baseline)

### Configuration

```typescript
// Default configuration (tier2-config.ts)
{
  activationThreshold: 0.7,  // Tier 1 confidence below this triggers Tier 2
  searchTimeout: 5000,       // Max search time in ms
  maxResults: 10,            // Maximum results to return
  minSimilarity: 0.6,        // Minimum similarity score
}
```

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `ACR_ENABLED` | `true` | Enable/disable all ACR |
| `ACR_TIER2_ENABLED` | `true` | Enable/disable Tier 2 only |

## Graceful Degradation

Tier 2 is designed to fail gracefully:

| Failure | Behavior |
|---------|----------|
| Ollama not running | Returns empty results, logs warning |
| LanceDB unavailable | Returns empty results, logs error |
| bge-m3 not pulled | Returns empty results, suggests fix |
| Search timeout | Returns partial/empty results |
| Any exception | Returns empty results, logs error |

## Testing

```bash
# Run all ACR tests
cd ~/.claude/skills/CORE && bun test tests/acr/

# Run Tier 1 tests only
bun test tests/acr/tier1-*.test.ts

# Run Tier 2 tests only
bun test tests/acr/tier2-*.test.ts
```

### Test Coverage
- **Tier 1**: 94 tests
- **Tier 2**: 114 tests
- **Total**: 208 tests

## Dependencies

| Dependency | Purpose | Fallback |
|------------|---------|----------|
| Resona (`~/work/resona`) | Embedding service | Return empty |
| Ollama | Host bge-m3 model | Return empty |
| LanceDB | Vector storage | Return empty |

## Performance Targets

| Metric | Target |
|--------|--------|
| P95 latency | <200ms |
| P99 latency | <500ms |
| Memory | <50MB |

## Feature Flags

Disable Tier 2 completely:
```bash
export ACR_TIER2_ENABLED=false
```

Disable all ACR:
```bash
export ACR_ENABLED=false
```
