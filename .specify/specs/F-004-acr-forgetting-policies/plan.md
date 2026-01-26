---
id: "F-004"
feature: "ACR Forgetting Policies"
phase: "plan"
created: "2026-01-26"
---

# Technical Plan: ACR Forgetting Policies

## Architecture Overview

Forgetting Policies are implemented as **Tier 4** in the ACR architecture, applying temporal decay to results from Tier 1 (grep) and Tier 2 (semantic search). Decay is applied at query time, not storage time, preserving original confidence scores for debugging.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Query Pipeline                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Query → Tier 1 (grep) → raw confidence                    │
│                    ↓                                            │
│              Tier 2 (semantic) → raw similarity                 │
│                    ↓                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              TIER 4: Forgetting Policies                │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │   │
│  │  │ Content Type │→ │ Decay Calc   │→ │ Integration │   │   │
│  │  │ Classifier   │  │ (half-life)  │  │ (apply)     │   │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘   │   │
│  │         ↑                                               │   │
│  │  ┌──────────────┐                                       │   │
│  │  │ Metadata     │                                       │   │
│  │  │ Parser (TTL) │                                       │   │
│  │  └──────────────┘                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                    ↓                                            │
│              decayed confidence → Tier 3 (injection)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Module Design

### Module 1: `tier4-types.ts`

**Purpose:** Type definitions and schemas for decay system.

**Key Types:**
- `ContentType`: Enum of content classifications (identity, contacts, projects, learnings, sessions, operational)
- `ContentMetadata`: Timestamps, TTL, content type
- `DecayedResult`: Raw + decayed confidence, age, decay factor
- `Tier4Config`: Enable/disable, archive threshold, historical mode
- `HALF_LIFE_DAYS`: Default half-lives per content type

### Module 2: `tier4-decay.ts`

**Purpose:** Core temporal decay calculation.

**Key Functions:**
- `calculateDecayFactor(ageDays, halfLifeDays)`: Returns 0.5^(age/halfLife)
- `applyTemporalDecay(confidence, ageDays, halfLifeDays)`: Multiply confidence by decay factor
- `applyDecayWithMetadata(confidence, metadata, config)`: Full pipeline with TTL handling
- `applyDecaySimple(confidence, contentType, ageDays)`: Simplified API

**Math:**
```
decayFactor = 0.5 ^ (ageDays / halfLifeDays)
decayedConfidence = rawConfidence * decayFactor
```

### Module 3: `tier4-content-type.ts`

**Purpose:** Classify content sources to determine half-life.

**Key Functions:**
- `classifyByPath(filePath)`: Classify by file path patterns
- `classifyBySourceType(sourceType)`: Classify by Tier 2 source type
- `getHalfLifeForPath(filePath)`: Shorthand for classification + lookup

**Classification Priorities:**
1. Identity: DAIDENTITY.md, ALGOPREFS.md → 180 days
2. Contacts: contacts/, people/ → 90 days
3. Projects: TELOS/PROJECTS.md → 60 days
4. Learnings: TELOS/LEARNED.md → 45 days
5. Sessions: sessions/, synopses → 30 days
6. Operational: work/, tasks/ → 14 days

### Module 4: `tier4-metadata.ts`

**Purpose:** Extract timestamps and TTL from content.

**Key Functions:**
- `extractFrontmatter(content)`: Parse YAML frontmatter
- `parseTTL(value)`: Parse TTL value (0, -1, N, "permanent", "30d")
- `extractMetadata(content, filePath)`: Full metadata extraction
- `isPermanent(metadata)`: Check if TTL=0 (never decay)

### Module 5: `tier4-integration.ts`

**Purpose:** Integrate decay with Tier 1 and Tier 2 results.

**Key Functions:**
- `applyDecayToMatch(match, timestampMs, config)`: Decay EntityMatch
- `applyDecayToRankedResult(result, timestampMs, config)`: Decay RankedResult
- `applyDecayToMatchesSync(matches, config)`: Batch decay for Tier 1
- `applyDecayToRankedResultsSync(results, config)`: Batch decay for Tier 2

**Integration Points:**
- After `scoreMatches()` in Tier 1 pipeline
- After `rankResults()` in Tier 2 pipeline

## Implementation Approach

### Phase 1: Types and Core Math (Day 1)
1. Create `tier4-types.ts` with all schemas
2. Create `tier4-decay.ts` with decay calculation
3. Write comprehensive unit tests for decay math

### Phase 2: Classification and Metadata (Day 1)
4. Create `tier4-content-type.ts` with path patterns
5. Create `tier4-metadata.ts` with frontmatter parsing
6. Write tests for classification and metadata extraction

### Phase 3: Integration (Day 2)
7. Create `tier4-integration.ts` with wrapper functions
8. Export all tier4 functions from `index.ts`
9. Integration tests with mock Tier 1/2 results

### Phase 4: Validation (Day 2)
10. Run full test suite
11. Update features.json status
12. Create SpecFlow artifacts (this document)

## Decisions Made

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Apply decay at query time | Preserves original scores, enables historical mode | Storage-time decay (loses original) |
| Half-life model | Intuitive, matches human memory | Linear decay, step functions |
| Default 30-day session half-life | Balances recency vs persistence | 14, 60, 90 days |
| Path-based classification | Works without metadata parsing | Frontmatter-only (requires reading content) |

## Deferred Work

- **FR-5: Cleanup Job** - Deferred to avoid complexity. Current scope handles decay only.
- **FR-6: Archive Access** - Deferred. Low confidence content simply ranks lower, not removed.
- **User-configurable half-lives** - Deferred. Start with sensible defaults.

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Decay slows queries | Calculation is O(1) per result, < 1ms total |
| Wrong content classification | Default to "operational" (fastest decay) - safer |
| TTL metadata rarely used | System works without it (uses default decay) |

## Test Strategy

1. **Unit Tests:** Decay math with known values (30d → 0.5, 60d → 0.25)
2. **Classification Tests:** All path patterns correctly classified
3. **Integration Tests:** Decay applied to mock Tier 1/2 results
4. **Edge Cases:** TTL=0 bypasses decay, historical mode, negative ages

## Dependencies

- Tier 1 (`scoreMatches`) provides EntityMatch[]
- Tier 2 (`rankResults`) provides RankedResult[]
- Zod for schema validation
- File system access for metadata extraction
