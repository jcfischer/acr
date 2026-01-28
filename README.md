---
name: ACR - Autonomous Contextual Recall
pack-id: jcfischer-acr-v1.0.0
version: 1.0.0
author: jcfischer
description: Two-tier hybrid retrieval (grep + semantic) for automatic context injection
type: infrastructure
purpose-type: [context-retrieval, memory, session-history]
platform: claude-code
dependencies: []
optional-dependencies: [ollama]
keywords: [acr, context, recall, semantic-search, grep, embeddings, memory]
---

# ACR - Autonomous Contextual Recall

> *"The metric is not 'did we find relevant context?' but 'did the AI act like someone who knows you?'"*
> — ACR Council Debate, January 2026

Two-tier architecture for automatic context retrieval in AI assistant sessions.

## Pack Installation

See [INSTALL.md](./INSTALL.md) for AI-guided installation.
See [VERIFY.md](./VERIFY.md) for verification checklist.

### Quick Install

```bash
# Clone the repo
git clone https://github.com/jcfischer/acr.git
cd acr

# Install dependencies and build
bun install
bun build src/cli.ts --compile --outfile ~/bin/acr

# Install hook
cp pack/hooks/ACR.hook.ts ~/.claude/hooks/
chmod +x ~/.claude/hooks/ACR.hook.ts

# Add to ~/.claude/settings.json (merge with existing hooks):
# "UserPromptSubmit": [{"type": "command", "command": "bun run $HOME/.claude/hooks/ACR.hook.ts"}]

# Index session history (optional, for Tier 2)
~/bin/acr --index-sessions
```

## Philosophy

ACR is built on the [Arbor Three Principles](https://azmaveth.com/posts/arbor-three-principles/):

### Trust Grows Capability

ACR acts autonomously. It surfaces context proactively rather than waiting to be asked. A system that stays silent until 95% certain is a search engine. A partner who sometimes brings up the wrong memory is still a partner.

When confidence is low, ACR asks rather than guesses—trust is earned through transparency, not hidden autonomy.

### Relationship Cultivates Results

Shared history eliminates re-explanation. ACR remembers previous conversations, preferences, and patterns. When you mention "that security discussion from last month," ACR should understand what you mean—not just pattern-match keywords.

The goal is semantic understanding, not string matching.

### Care Compounds Over Time

Memory accumulates across sessions. ACR doesn't just store facts—it builds understanding of how you think, what connections matter to you, which patterns recur. This compounding is what transforms an assistant into a partner.

Graceful forgetting is wisdom, not a bug. Operational details decay while emotional truth persists.

## Goals

From the [council consensus](https://github.com/jcfischer/kai-improvement-roadmap/blob/main/analysis/2026-01-25-acr-council-debate.md):

1. **Essential infrastructure** — ACR is core functionality, not optional enhancement
2. **Hybrid retrieval** — Fast grep for explicit matches + semantic search for meaning
3. **Confidence-based routing** — Escalate between tiers based on match quality
4. **Transparency by default** — User knows what context was retrieved
5. **Performance targets** — <50ms grep, <200ms semantic (P95)
6. **Build on existing systems** — No new infrastructure, orchestrate what exists

### Success Metrics

| Type | Metric |
|------|--------|
| Quantitative | Retrieval precision at P95 latency |
| Qualitative | "Did the AI respond like someone who truly knows you?" |

## Architecture

```
User Prompt
     │
     ▼
┌─────────────┐
│   Tier 1    │  Fast grep-based entity detection
│   (Grep)    │  Searches: project files, user context, exports
└─────┬───────┘
      │
      ├─── High Confidence (≥0.7) ──→ Return grep matches
      │
      ▼
┌─────────────┐
│   Tier 2    │  Semantic search via embeddings
│ (Semantic)  │  Sources: user docs, session history
└─────────────┘
```

### Design Principles

- **Grep-first, semantic fallback** — O(1) before O(log n)
- **Ask when uncertain** — Confidence < 0.7 prompts clarification
- **Visible context indicators** — `[context: source, confidence]`
- **Graceful degradation** — Missing dependencies return empty, not errors

## Quick Start

### CLI

```bash
# Install: symlink to ~/bin
ln -sf /path/to/acr/src/cli.ts ~/bin/acr

# Search for context
acr "Daniel's project preferences"

# Force Tier 2 semantic search
acr --tier2 "remember that security discussion"

# Index Maestro session history
acr --index-maestro
acr --index-maestro-full  # Full reindex

# Check status
acr --status
```

### Library

```typescript
import { runTier1Grep, runTier2Semantic } from 'acr';

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
Activation Gate → Query Construction → Semantic Search → Result Ranking
```

### Files
| File | Purpose |
|------|---------|
| `tier2-resona.ts` | Main orchestration entry point |
| `tier2-types.ts` | TypeScript interfaces + Zod schemas |
| `tier2-config.ts` | Configuration + trigger phrases |
| `tier2-activation.ts` | Activation decision logic |
| `tier2-query.ts` | Semantic query construction |
| `resona-adapter.ts` | Embedding service integration |
| `session-indexer.ts` | Session history parsing |
| `tier2-ranker.ts` | Result ranking + deduplication |

### Source Priority
Results are boosted by source type:
- **User context**: +0.1 (highest priority)
- **Session history**: +0.05
- **Exports**: +0.0 (baseline)

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
| Embedding service unavailable | Returns empty results, logs warning |
| Vector DB unavailable | Returns empty results, logs error |
| Model not available | Returns empty results, suggests fix |
| Search timeout | Returns partial/empty results |
| Any exception | Returns empty results, logs error |

## Testing

```bash
# Run all ACR tests
bun test

# Run Tier 1 tests only
bun test tests/tier1-*.test.ts

# Run Tier 2 tests only
bun test tests/tier2-*.test.ts
```

### Test Coverage
- **Tier 1**: 94 tests
- **Tier 2**: 114 tests
- **Tier 3**: 200+ tests
- **Tier 4**: 100+ tests
- **Maestro**: 67 tests
- **Total**: 618 tests

## Performance Targets

| Metric | Target |
|--------|--------|
| P95 latency (Tier 1) | <50ms |
| P95 latency (Tier 2) | <200ms |
| Memory | <50MB |

## Maestro Session Indexing (F-005)

ACR can index Maestro desktop app session history for cross-session recall. This enables semantic search across previous coding sessions.

### Location
Maestro stores session history in:
```
~/Library/Application Support/maestro/history/*.json
```

### Usage (Programmatic)

```typescript
import {
  syncMaestroIndex,
  clearMaestroIndex,
  loadIndexState,
  MAESTRO_CONFIG,
} from 'acr';

// Incremental sync (only changed files)
const result = await syncMaestroIndex(
  MAESTRO_CONFIG.historyDir,
  MAESTRO_CONFIG.stateFile
);
console.log(`Indexed ${result.entriesIndexed} new entries`);

// Full reindex (ignore previous state)
const fullResult = await syncMaestroIndex(
  MAESTRO_CONFIG.historyDir,
  MAESTRO_CONFIG.stateFile,
  { full: true }
);

// Clear index and state
await clearMaestroIndex(MAESTRO_CONFIG.stateFile);

// Check index status
const state = await loadIndexState(MAESTRO_CONFIG.stateFile);
console.log(`Total entries indexed: ${state.totalEntries}`);
console.log(`Files tracked: ${Object.keys(state.files).length}`);
```

### Configuration

```typescript
// Default config in maestro-types.ts
MAESTRO_CONFIG = {
  historyDir: "~/Library/Application Support/maestro/history",
  stateFile: "~/.config/acr/maestro-index-state.json",
  minSummaryLength: 10,   // Entries shorter than this are skipped
  batchSize: 100,         // Entries per embedding batch
  minSimilarity: 0.70,    // Minimum similarity for search results
  maxResults: 5,          // Max maestro results to return
}
```

### Files
| File | Purpose |
|------|---------|
| `maestro-types.ts` | Type definitions and Zod schemas |
| `maestro-parser.ts` | History file parsing and filtering |
| `maestro-indexer.ts` | Incremental sync and state management |

### Source ID Format
Maestro results use this source ID format:
```
maestro:{sessionFileId}:{entryIndex}
```

Example: `maestro:abc123-def456:42` refers to entry index 42 in session file `abc123-def456.json`.

### Graceful Degradation

| Failure | Behavior |
|---------|----------|
| History dir missing | Returns empty, logs warning |
| Malformed JSON file | Skips file, continues with others |
| Ollama unavailable | Queues for later, no crash |
| Missing summary field | Entry skipped |

## Future: Forgetting Policies (v2)

Per council consensus, future versions will implement:
- Explicit TTL for operational context (30-day half-life)
- Preserve "emotional truth" longer than details
- Graceful forgetting as a feature, not a bug

## License

MIT
