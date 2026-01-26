---
id: "F-005"
feature: "Maestro Session Indexing"
status: "draft"
created: "2026-01-26"
depends-on: ["F-002"]
---

# Specification: F-005 - Maestro Session Indexing

## Overview

Implement semantic embedding of Maestro session history for ACR Tier 2 retrieval. This feature enables PAI to recall context from previous Maestro-managed Claude sessions, surfacing relevant prior work when users reference past conversations indirectly.

This embodies Arbor's **Care Compounds Over Time** principle: work accumulates across sessions, enabling continuity without manual context-setting.

## User Scenarios

### Scenario 1: Recall Prior Session Work

**As a** PAI user continuing related work from a previous Maestro session
**I want** PAI to recognize the connection and surface relevant context
**So that** I don't have to re-explain what we worked on before

**Example:**
> User: "Let's continue the API refactoring"
> ACR finds: Session from yesterday with summary "Refactored auth API endpoints to use middleware pattern"

**Acceptance Criteria:**
- [ ] Maestro session entries are embedded in Resona
- [ ] Semantic search returns matching sessions by topic similarity
- [ ] Results include session date, agent name, and summary snippet
- [ ] Minimum similarity threshold of 0.70 for session matches

### Scenario 2: Cross-Session Knowledge Transfer

**As a** PAI user working on a project across multiple sessions
**I want** accumulated session knowledge to be searchable
**So that** decisions and context from past work inform current work

**Example:**
> User: "What approach did we decide on for the caching layer?"
> ACR finds: Three sessions discussing caching, ranked by relevance

**Acceptance Criteria:**
- [ ] Multiple sessions on same topic surface together
- [ ] Sessions ranked by similarity, recency as tiebreaker
- [ ] Maximum 5 sessions returned per query
- [ ] Source attribution shows session ID and project path

### Scenario 3: Incremental Indexing

**As a** PAI system
**I want** new Maestro sessions indexed automatically
**So that** recent work is immediately searchable without manual intervention

**Acceptance Criteria:**
- [ ] New sessions detected and indexed within 5 minutes of completion
- [ ] Indexing is idempotent (re-indexing same session is safe)
- [ ] Index maintains last-indexed timestamp per session file
- [ ] Failed indexing logged but doesn't block other sessions

## Functional Requirements

### FR-1: Maestro History Parsing

Parse Maestro session history files:

**Source:** `~/Library/Application Support/maestro/history/*.json`

**Schema per file:**
```typescript
interface MaestroHistoryFile {
  entries: Array<{
    summary: string;      // Task description (embed this)
    timestamp: number;    // Unix ms
    type: 'AUTO' | 'USER';
    success: boolean;
  }>;
}
```

**Extraction:**
- One embedding per entry (not per file)
- Include metadata: session file ID, timestamp, type, success
- Filter: Only embed entries with `summary.length > 10`

**Validation:** Unit tests for JSON parsing with edge cases

### FR-2: Embedding Pipeline

Index Maestro entries into Resona:

```typescript
interface MaestroEmbedding {
  content: string;        // The summary text
  source: 'maestro';
  sourceId: string;       // Format: "maestro:{fileId}:{entryIndex}"
  sessionFile: string;    // Original filename
  timestamp: Date;
  entryType: 'AUTO' | 'USER';
  success: boolean;
}
```

**Pipeline:**
1. Scan history directory for JSON files
2. Parse each file, extract entries
3. Skip already-indexed entries (by sourceId)
4. Batch embed via Resona (max 100 per batch)
5. Store in LanceDB with full metadata

**Validation:** Integration test verifies round-trip: index → search → retrieve

### FR-3: Incremental Sync

Track indexing state to enable incremental updates:

```typescript
interface IndexState {
  lastSyncTimestamp: number;
  indexedFiles: Record<string, {
    lastModified: number;
    entryCount: number;
  }>;
}
```

**Storage:** `~/.config/acr/maestro-index-state.json`

**Sync logic:**
1. Load index state
2. Scan history directory
3. Identify new/modified files (mtime > lastModified)
4. Index only changed files
5. Update state file

**Validation:** Test incremental sync with mock file changes

### FR-4: CLI Interface

Provide CLI commands for manual control:

```bash
# Full reindex
acr maestro index --full

# Incremental sync (default)
acr maestro index

# Show index status
acr maestro status

# Clear index
acr maestro clear
```

**Validation:** CLI integration tests

### FR-5: Integration with Tier 2

Modify `ResonaAdapter.searchUnified()` to include Maestro results:

**Current sources:** USER/, Tana
**New sources:** USER/, Tana, Maestro

**Result format:**
```typescript
{
  content: "Refactored auth API endpoints to use middleware pattern",
  source: "maestro",
  sourceId: "maestro:5c538d0e:3",
  similarity: 0.82,
  metadata: {
    timestamp: "2026-01-25T14:30:00Z",
    entryType: "USER",
    sessionFile: "5c538d0e-ef49-4a99-ba42-715d8327c8d3.json"
  }
}
```

**Validation:** Verify Maestro results appear in unified search

## Non-Functional Requirements

### Performance
- Indexing: Process 1000 entries in < 30 seconds
- Search: No added latency to existing Tier 2 (Maestro in same LanceDB index)
- Startup: No blocking on index sync

### Reliability
- Malformed JSON files: Skip with warning, continue
- Missing history directory: Return empty, log info
- Resona unavailable: Queue for later, don't crash

### Storage
- Estimated size: ~1KB per entry (embedding + metadata)
- 10,000 sessions ≈ 10MB index growth

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| MaestroEntry | Single task from session history | summary, timestamp, type, success |
| MaestroEmbedding | Indexed entry in Resona | content, sourceId, timestamp, metadata |
| IndexState | Sync tracking state | lastSyncTimestamp, indexedFiles |

## Success Criteria

- [ ] 100% of Maestro entries with summary > 10 chars are indexed
- [ ] Semantic search for past session topics returns relevant results
- [ ] Incremental sync indexes only new/changed files
- [ ] P95 search latency unchanged from baseline (< 200ms)
- [ ] Zero data loss on re-indexing (idempotent)

## Implementation Notes

### File Locations

| Purpose | Path |
|---------|------|
| Maestro history | `~/Library/Application Support/maestro/history/*.json` |
| Index state | `~/.config/acr/maestro-index-state.json` |
| Resona DB | Uses existing Resona LanceDB location |

### Source Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/maestro-indexer.ts` | CREATE | Parsing and indexing logic |
| `src/maestro-types.ts` | CREATE | Type definitions |
| `src/resona-adapter.ts` | MODIFY | Add Maestro to unified search |
| `src/index.ts` | MODIFY | Export CLI commands |
| `tests/maestro-indexer.test.ts` | CREATE | Unit tests |

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| Maestro history format stable | Maestro schema change | JSON parse failures |
| History files are valid JSON | Corrupted files | Try-catch on parse |
| Resona bge-m3 model available | Model not installed | Health check |
| User has Maestro sessions | Fresh install | Check directory exists |

## Open Questions

- [ ] Should we index ALL entries or filter by success=true only?
  - **Proposed:** Index all (failed tasks still provide context)
- [ ] What's the retention policy for old embeddings?
  - **Proposed:** Keep forever, let F-004 forgetting policies handle decay
- [ ] Should we enrich embeddings with project path from session?
  - **Proposed:** Yes, include working directory in metadata

## Out of Scope

- Real-time streaming indexing (batch only)
- Full transcript embedding (summaries only)
- Cross-machine session sync
- Maestro history file management (Maestro's responsibility)
- UI for browsing indexed sessions
