---
id: "F-002"
feature: "ACR Tier 2 - Resona Semantic Retrieval"
status: "draft"
created: "2026-01-25"
council-source: "analysis/2026-01-25-acr-council-debate.md"
depends-on: ["F-001"]
---

# Specification: ACR Tier 2 - Resona Semantic Retrieval

## Overview

The second tier of Autonomous Contextual Recall (ACR) provides asynchronous semantic retrieval when Tier 1 grep returns low-confidence results. It uses Resona's bge-m3 embeddings and LanceDB to find semantically similar content, including Maestro session synopses.

This embodies Arbor's **Care Compounds Over Time** principle: memory accumulates across sessions through semantic understanding that goes beyond keyword matching.

## User Scenarios

### Scenario 1: Low-Confidence Grep Triggers Semantic Search

**As a** PAI user mentioning a concept without exact keywords
**I want** PAI to find semantically related prior context
**So that** relevant work is surfaced even when I use different terminology

**Acceptance Criteria:**
- [ ] When Tier 1 returns aggregateConfidence < 0.7, Tier 2 activates automatically
- [ ] Semantic search completes within 200ms P95
- [ ] Results ranked by similarity score (0.0-1.0)
- [ ] Top 5 results returned with source attribution

### Scenario 2: Prior Session Recall

**As a** PAI user continuing related work from a previous session
**I want** PAI to recognize the connection to prior sessions
**So that** I don't have to re-explain context from past conversations

**Acceptance Criteria:**
- [ ] Maestro session synopses are embedded and searchable
- [ ] Similar sessions surfaced with session ID, date, and synopsis snippet
- [ ] Similarity threshold of 0.75 for session recommendations
- [ ] Maximum 3 prior sessions surfaced per query

### Scenario 3: Multi-Source Retrieval

**As a** PAI user with context spread across USER/, Tana, and sessions
**I want** unified semantic search across all embedded sources
**So that** relevant context is found regardless of where it was stored

**Acceptance Criteria:**
- [ ] Resona's unified index searched (USER/, Tana exports, Maestro synopses)
- [ ] Results include source type indicator
- [ ] Deduplication when same content appears in multiple sources
- [ ] Source priority: USER/ > Maestro > Tana (for tie-breaking)

## Functional Requirements

### FR-1: Tier 2 Activation Logic

Activate Tier 2 when:
- Tier 1 grep returns aggregateConfidence < 0.7
- Tier 1 returns empty result set
- Query explicitly requests semantic search ("remember when we...")

**Validation:** Integration test verifies Tier 2 activates under correct conditions

### FR-2: Maestro Synopsis Embedding

Index Maestro session synopses for semantic search:
- Parse `~/Library/Application Support/maestro/history/*.json`
- Extract `entries[].summary` fields with session metadata
- Embed using bge-m3 via Resona
- Store in LanceDB with session ID, date, project path

**Validation:** Verify embedding count matches session count in Maestro history

### FR-3: Semantic Query Construction

Transform session context into semantic query:
- Extract key concepts from user prompt
- Include current project context
- Weight recent mentions higher
- Construct natural language query for embedding

**Validation:** Manual review of query construction for diverse prompts

### FR-4: Result Ranking and Filtering

Process raw similarity results:
```typescript
interface SemanticResult {
  results: Array<{
    content: string;
    source: 'user' | 'maestro' | 'tana';
    sourceId: string;  // file path or session ID
    similarity: number;
    timestamp?: Date;
  }>;
  queryLatencyMs: number;
  embeddingLatencyMs: number;
  totalLatencyMs: number;
}
```

Apply filters:
- Minimum similarity: 0.6
- Maximum results: 10
- Deduplicate by content hash

**Validation:** Schema validation and deduplication tests

### FR-5: Asynchronous Execution

Run Tier 2 asynchronously while session proceeds:
- Start semantic search immediately after Tier 1 signals escalation
- Return results via callback when ready
- If results arrive mid-conversation, inject via context update mechanism

**Validation:** Verify async execution doesn't block user interaction

## Non-Functional Requirements

- **Performance:** P95 latency < 200ms; P99 < 500ms
- **Reliability:** Failure returns empty result, logs error, doesn't crash session
- **Scalability:** Must handle 10,000+ embedded documents
- **Failure Behavior:**
  - On LanceDB unavailable: Return empty, log error, suggest `resona sync`
  - On embedding timeout: Return partial results if available
  - On malformed synopsis: Skip document, continue with valid entries

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| SemanticResult | Ranked similarity results | results[], queryLatencyMs, totalLatencyMs |
| EmbeddedDocument | Indexed content item | content, source, sourceId, embedding, timestamp |
| MaestroSynopsis | Session summary from Maestro | sessionId, summary, projectPath, date |

## Success Criteria

- [ ] P95 latency < 200ms measured over 500 semantic queries
- [ ] Recall: 80%+ of relevant prior sessions found when user references them indirectly
- [ ] Precision: <20% of surfaced results are irrelevant to current context
- [ ] Maestro synopses indexed within 24 hours of session completion

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| Resona already installed and configured | Fresh PAI install | Check for Resona config at startup |
| bge-m3 model available | Model not downloaded | Verify model exists in Resona cache |
| LanceDB accessible | Database corruption | Health check query on startup |
| Maestro history directory exists | User not using Maestro | Check directory existence |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| F-001 Tier 1 | escalateToTier2 signal | Interface change | GrepResult interface |
| Resona | Embedding and search | API changes | Resona CLI contract |
| Maestro | Session synopses | History format changes | Maestro history schema |
| LanceDB | Vector storage | Schema migration | LanceDB table schema |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| F-003 Context Injection | SemanticResult interface | Any schema change |

### Adjacent Systems (Implicit Coupling)

| System | Implicit Dependency | Risk |
|--------|---------------------|------|
| Ollama | Local embedding model hosting | Medium - model availability |
| File system | Maestro history access | Low - standard paths |

## Open Questions

- [ ] How often should Maestro synopses be re-indexed? (Proposed: daily cron)
- [ ] Should we embed full session transcripts or just synopses? (Proposed: synopses only)
- [ ] What's the optimal chunk size for USER/ content embedding?

## Out of Scope

- Real-time Maestro indexing (batch indexing only)
- Cross-user session search
- Session transcript search (synopses only)
- Resona infrastructure changes (use as-is)
- Training or fine-tuning embedding models
