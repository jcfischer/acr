# F-002 Documentation Updates

## Files Created

### Source Files (`~/.claude/skills/CORE/src/acr/`)

| File | Purpose |
|------|---------|
| `tier2-types.ts` | TypeScript interfaces + Zod schemas for Tier 2 |
| `tier2-config.ts` | Configuration constants + trigger phrase detection |
| `tier2-activation.ts` | Activation gate logic (shouldActivateTier2) |
| `tier2-query.ts` | Semantic query construction from prompts |
| `resona-adapter.ts` | Resona library integration adapter |
| `session-indexer.ts` | Session history JSONL parsing |
| `tier2-ranker.ts` | Result ranking + deduplication |
| `tier2-resona.ts` | Main orchestration entry point |

### Test Files (`~/.claude/skills/CORE/tests/acr/`)

| File | Tests |
|------|-------|
| `tier2-types.test.ts` | 19 |
| `tier2-config.test.ts` | 21 |
| `tier2-activation.test.ts` | 18 |
| `tier2-query.test.ts` | 16 |
| `resona-adapter.test.ts` | 18 |
| `session-indexer.test.ts` | 13 |
| `tier2-ranker.test.ts` | 18 |
| `tier2-resona.test.ts` | 12 |

### Documentation Files

| File | Purpose |
|------|---------|
| `~/.claude/skills/CORE/src/acr/README.md` | Architecture, API docs, usage examples |
| `~/.claude/skills/CORE/DEBT-LEDGER.md` | Technical debt tracking (3 entries for F-002) |

## Files Modified

### `~/.claude/skills/CORE/src/acr/index.ts`

Added Tier 2 exports:

```typescript
// Tier 2 - Resona semantic search
export { runTier2Semantic } from "./tier2-resona";
export type { Tier2Options } from "./tier2-resona";

// Types
export type {
  SemanticQuery,
  UnifiedResult,
  RankedResult,
  ActivationDecision,
  SemanticResult,
  Tier2Config,
  SourceType,
} from "./tier2-types";

// ... (additional exports)
```

## API Reference

### Main Entry Point

```typescript
import { runTier2Semantic } from '~/.claude/skills/CORE/src/acr';

const result = await runTier2Semantic(tier1Result, prompt, {
  enabled: true,           // default: true
  activationThreshold: 0.7, // default: 0.7
  maxResults: 10,          // default: 10
  minSimilarity: 0.6,      // default: 0.6
  searchTimeout: 5000,     // default: 5000ms
});

if (result.activated) {
  console.log('Semantic results:', result.results);
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACR_ENABLED` | `true` | Enable/disable all ACR |
| `ACR_TIER2_ENABLED` | `true` | Enable/disable Tier 2 only |

## Usage Notes

1. **Tier 2 activates automatically** when Tier 1 confidence < 0.7
2. **Explicit triggers** ("remember when", "we discussed") force activation
3. **Graceful degradation** - returns empty results if Resona/Ollama unavailable
4. **Source priority** - user context (+0.1) > session history (+0.05) > Tana (+0)

## Dependencies

- Resona library (`~/work/resona`) - embedding service
- Ollama with bge-m3 model - embedding generation
- LanceDB - vector storage (via Resona)
