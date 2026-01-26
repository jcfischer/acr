---
feature: "F-006 - PAI Memory Indexing"
status: "specified"
priority: 4
created: "2026-01-26"
author: "Kai"
---

# F-006: PAI Memory Indexing

## Overview

Index PAI's ~/.claude/MEMORY directory structure for ACR Tier 2 semantic search. This enables cross-session recall of learnings, decisions, and research artifacts accumulated by PAI over time.

## Problem Statement

PAI accumulates valuable knowledge in ~/.claude/MEMORY:
- **Learnings** - Patterns, insights, and lessons learned
- **Decisions** - Architectural decisions with context
- **Research** - Research findings and analysis

Currently this knowledge is only accessible via direct file search. Indexing it for semantic search would enable:
- "What did I learn about MCP servers?"
- "What decisions did we make about authentication?"
- "Find research on TypeScript patterns"

## Scope

### In Scope

| Directory | Files | Size | Content Type |
|-----------|-------|------|--------------|
| Learning/ | ~5,000 md | 5.8M | Structured learnings with [SUMMARY], [ANALYSIS] sections |
| Decisions/ | ~100 md | 356K | Architectural decisions |
| Research/ | ~200 md | 7.4M | Research artifacts |

### Out of Scope

| Directory | Reason |
|-----------|--------|
| Raw-outputs/ | 1.3GB, low signal-to-noise ratio |
| Work/ | Complex nested structure, needs separate analysis |
| Sessions/ | Already covered by session-indexer.ts |
| State/ | Runtime state, not knowledge |

## Requirements

### Functional Requirements

1. **FR-1**: Parse markdown files from Learning/, Decisions/, Research/ directories
2. **FR-2**: Extract frontmatter metadata (capture_type, timestamp, session_id)
3. **FR-3**: Support incremental sync based on file mtime
4. **FR-4**: Support full reindex option
5. **FR-5**: Apply content-type-aware decay rates:
   - Learning → "reference" (permanent, no decay)
   - Decisions → "reference" (permanent)
   - Research → "project" (90-day half-life)
6. **FR-6**: Generate source IDs in format `memory:{type}:{filename}`
7. **FR-7**: Integrate with existing Tier 2 search via "memory" source type

### Non-Functional Requirements

1. **NFR-1**: Graceful degradation - missing directories return empty, don't crash
2. **NFR-2**: Handle malformed frontmatter gracefully
3. **NFR-3**: Index 5,000+ files in <30 seconds (incremental <5s)
4. **NFR-4**: State file persistence at ~/.config/acr/memory-index-state.json

## Technical Design

### Source ID Format

```
memory:{capture_type}:{filename_without_ext}
```

Examples:
- `memory:LEARNING:20260104T111437_LEARNING_perfect-the-tana-mcp`
- `memory:DECISION:2026-01-01-100949_DECISION_architectural-choice`
- `memory:RESEARCH:2025-12-27-172635_RESEARCH_saas-psychotherapists`

### File Structure

```
src/
  memory-types.ts      # Types and Zod schemas
  memory-parser.ts     # Parse markdown with frontmatter
  memory-indexer.ts    # Incremental sync logic
tests/
  memory-types.test.ts
  memory-parser.test.ts
  memory-indexer.test.ts
```

### Integration Points

1. Add "memory" to `SourceTypeSchema` in `tier2-types.ts`
2. Update `ResonaAdapter.parseSourceType()` to handle memory format
3. Export new modules from `index.ts`
4. Add CLI commands: `acr --index-memory`, `acr --index-memory-full`

### Data Model

```typescript
interface MemoryEntry {
  filePath: string;
  captureType: "LEARNING" | "DECISION" | "RESEARCH";
  timestamp: number;
  sessionId?: string;
  title: string;
  content: string;
}

interface MemoryIndexState {
  lastSyncTimestamp: number;
  indexedFiles: Record<string, {
    lastModified: number;
    captureType: string;
  }>;
}
```

## Acceptance Criteria

- [ ] AC-1: `acr --index-memory` indexes Learning/, Decisions/, Research/ directories
- [ ] AC-2: `acr --index-memory-full` performs full reindex
- [ ] AC-3: `acr --status` shows memory index statistics
- [ ] AC-4: Semantic search returns memory results with correct source type
- [ ] AC-5: Decay rates applied based on capture type
- [ ] AC-6: All tests pass (target: 50+ new tests)
- [ ] AC-7: Graceful handling of missing directories and malformed files

## Dependencies

- F-005 Maestro Session Indexing (pattern to follow)
- Tier 2 infrastructure (ResonaAdapter, tier2-types)
- Tier 4 decay system (for content-type decay rates)

## Risks

| Risk | Mitigation |
|------|------------|
| Large file count (5,000+) | Batch processing, incremental sync |
| Varied frontmatter formats | Flexible parsing with defaults |
| Content quality variance | Filter by minimum content length |

## Open Questions

1. Should we index the full content or just summary sections?
2. What minimum content length filter should apply?
3. Should we support custom directories beyond the three defaults?
