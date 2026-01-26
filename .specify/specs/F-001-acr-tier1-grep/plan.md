---
feature: "ACR Tier 1 - Grep-based Entity Detection"
spec: "./spec.md"
status: "draft"
created: "2026-01-25"
---

# Technical Plan: ACR Tier 1 - Grep-based Entity Detection

## Architecture Overview

Fast, synchronous grep-based entity detection that runs at session start. Extracts entities from session context, greps USER/ directory files, and returns scored matches within 50ms P95.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SESSION START HOOK                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ENTITY EXTRACTOR                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ User Prompt  │  │ Working Dir  │  │ Recent Files │  │ Proper Nouns │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ entities[]
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GREP ENGINE                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Parallel File Grep (ripgrep-style, but pure TS for portability)       │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ DAIDENTITY.md │ CONTACTS/* │ TELOS/LEARNED.md │ TELOS/PROJECTS.md │... │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ raw matches
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MATCH SCORER                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │ Exact: 1.0   │  │ Word: 0.8   │  │ Partial: 0.6 │                      │
│  └──────────────┘  └──────────────┘  └──────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ GrepResult
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESULT AGGREGATOR                                    │
│  • Sort by confidence descending                                            │
│  • Calculate aggregateConfidence (max)                                      │
│  • Set escalateToTier2 if aggregateConfidence < 0.7                        │
│  • Record latencyMs                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │ Return GrepResult │           │ Escalate to F-002 │
        │ to F-003 Injection│           │ (Tier 2 Resona)   │
        └───────────────────┘           └───────────────────┘
```

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | PAI standard, type safety for interfaces |
| Runtime | Bun | PAI standard, fast file I/O |
| File Search | Bun.file + regex | No external deps, <50ms achievable |
| Testing | bun:test | Integrated, fast |

**Why not ripgrep subprocess?**
- Subprocess spawn adds ~5-10ms overhead
- Pure TS is portable and testable
- USER/ directory is small (<1MB) - brute force is fine

## Constitutional Compliance

- [x] **CLI-First:** `acr-grep search <entity>` for testing/debugging
- [x] **Library-First:** `src/acr/tier1-grep.ts` exports pure functions
- [x] **Test-First:** Unit tests for each component, integration test for full pipeline
- [x] **Deterministic:** Same input → same output, no LLM calls in Tier 1
- [x] **Code Before Prompts:** All logic in TypeScript, no prompt engineering

## Data Model

### Entities

```typescript
// Input: Extracted search context
interface SearchContext {
  entities: string[];           // Terms to search for
  workingDir: string;           // Current directory name
  recentFiles: string[];        // Recently mentioned file paths
  rawPrompt: string;            // Original user prompt
}

// Output: Single match
interface EntityMatch {
  entity: string;               // What was searched
  source: string;               // File path (relative to USER/)
  snippet: string;              // ±3 lines context
  line: number;                 // Line number in file
  confidence: number;           // 0.0 - 1.0
}

// Output: Aggregated result
interface GrepResult {
  matches: EntityMatch[];
  aggregateConfidence: number;  // max(matches.confidence)
  latencyMs: number;
  escalateToTier2: boolean;     // aggregateConfidence < 0.7
  searchContext: SearchContext; // For debugging
}
```

### No Database Schema

Tier 1 is stateless - no persistence required. Results flow to F-003.

## API Contracts

### Internal APIs

```typescript
// Entity extraction from session context
function extractEntities(prompt: string, cwd: string): SearchContext;

// Grep a single file for entities
function grepFile(
  filePath: string,
  entities: string[]
): Promise<EntityMatch[]>;

// Score a single match
function scoreMatch(
  entity: string,
  matchedText: string,
  context: string
): number;

// Main entry point - run full Tier 1 pipeline
async function runTier1Grep(
  prompt: string,
  cwd: string,
  timeout?: number  // default 75ms
): Promise<GrepResult>;
```

### Hook Integration

```typescript
// Session-start hook handler
export async function onSessionStart(
  ctx: SessionContext
): Promise<void> {
  const result = await runTier1Grep(ctx.prompt, ctx.cwd);

  // Store for F-003 consumption
  ctx.acrContext = {
    tier1Result: result,
    tier2Result: null,  // F-002 will populate if escalated
  };
}
```

## Implementation Strategy

### Phase 1: Foundation (Core Types + Entity Extraction)

- [x] TypeScript interfaces (GrepResult, EntityMatch, SearchContext)
- [ ] Entity extraction from prompts
  - Proper noun detection (capitalized words)
  - Project name extraction (from cwd)
  - File path entity extraction
- [ ] Unit tests for entity extraction

### Phase 2: Grep Engine

- [ ] File reader with timeout protection
- [ ] Parallel file grep across USER/ directory
- [ ] Context window extraction (±3 lines)
- [ ] Match scoring algorithm
- [ ] Unit tests for grep and scoring

### Phase 3: Integration

- [ ] Result aggregation and sorting
- [ ] Tier 2 escalation logic
- [ ] Hook integration
- [ ] CLI debugging command
- [ ] Integration tests with real USER/ directory

## File Structure

```
~/.claude/skills/CORE/
├── src/
│   └── acr/
│       ├── tier1-grep.ts           # [New] Main entry point
│       ├── entity-extractor.ts     # [New] Extract entities from context
│       ├── grep-engine.ts          # [New] File search logic
│       ├── match-scorer.ts         # [New] Confidence scoring
│       └── types.ts                # [New] TypeScript interfaces
├── hooks/
│   └── session-start.ts            # [Modified] Add Tier 1 call
└── tests/
    └── acr/
        ├── tier1-grep.test.ts      # [New] Integration tests
        ├── entity-extractor.test.ts # [New] Unit tests
        ├── grep-engine.test.ts     # [New] Unit tests
        └── match-scorer.test.ts    # [New] Unit tests
```

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Grep exceeds 50ms on large USER/ | Medium | Low | Timeout at 75ms, skip to Tier 2 |
| False positives on common words | Medium | Medium | Minimum entity length (3 chars), stopword filter |
| Binary files in USER/ cause errors | Low | Low | File type detection, skip non-text |
| Entity extraction misses context | Medium | Medium | Iterative improvement based on production data |

## Failure Mode Analysis

### How This Code Can Fail

| Failure Mode | Trigger | Detection | Degradation | Recovery |
|-------------|---------|-----------|-------------|----------|
| Grep timeout | Large files, slow disk | Timer exceeded | Return empty, log warning | Proceed to Tier 2 |
| File read error | Permissions, corruption | fs.readFile throws | Skip file, continue others | Log and alert |
| Entity extraction empty | Unusual prompt format | entities.length === 0 | Skip grep, return empty | Proceed to Tier 2 |
| Memory pressure | Many large matches | Memory monitoring | Limit results to top 20 | GC after grep |

### Assumptions That Could Break

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| USER/ < 1MB | User stores large files | Measure on hook install, warn if >1MB |
| Files are UTF-8 text | Binary files added | Check magic bytes before read |
| Grep is faster than Resona | Very sparse USER/ | Compare latencies, adaptive routing |
| Entity extraction is good enough | Too many false negatives | Track escalation rate to Tier 2 |

### Blast Radius

- **Files touched:** ~6 new files, 1 modified
- **Systems affected:** Session start hook only
- **Rollback strategy:** Remove hook call, Tier 2 becomes primary

## Dependencies

### External

- None (pure Bun/TS)

### Internal

- `~/.claude/skills/CORE/USER/` - Directory to grep
- `~/.claude/skills/CORE/hooks/session-start.ts` - Integration point
- F-002 (Tier 2) - Receives escalation signal
- F-003 (Context Injection) - Receives GrepResult

## Migration/Deployment

- [ ] Database migrations needed? **No**
- [ ] Environment variables? **No**
- [ ] Breaking changes? **No** - additive only

**Deployment steps:**
1. Deploy new `src/acr/` files
2. Add hook integration (feature-flagged)
3. Enable flag, monitor latency
4. Remove flag once stable

## Estimated Complexity

- **New files:** ~5
- **Modified files:** ~1
- **Test files:** ~4
- **Estimated tasks:** ~12
- **Debt score:** 2 (low complexity, no external deps)

## Longevity Assessment

### Maintainability Indicators

| Indicator | Status | Notes |
|-----------|--------|-------|
| **Readability:** Can a developer understand this in 6 months? | Yes | Pure functions, clear interfaces |
| **Testability:** Can changes be verified without manual testing? | Yes | Full unit + integration coverage |
| **Documentation:** Is the "why" captured, not just the "what"? | Yes | Spec + plan document rationale |

### Evolution Vectors

| What Might Change | Preparation | Impact |
|------------------|-------------|--------|
| USER/ directory structure | Abstract file list discovery | Low |
| Scoring algorithm | Isolate in match-scorer.ts | Low |
| Threshold for Tier 2 | Config parameter | Low |
| Add caching layer | Wrap grep-engine | Medium |

### Deletion Criteria

When should this code be deleted?

- [ ] Feature superseded by: Tier 2 becomes fast enough to replace Tier 1
- [ ] Dependency deprecated: N/A (no external deps)
- [ ] User need eliminated: ACR disabled entirely
- [ ] Maintenance cost exceeds value when: False positive rate makes it harmful
