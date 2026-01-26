---
id: "F-001"
feature: "ACR Tier 1 - Grep-based Entity Detection"
status: "draft"
created: "2026-01-25"
council-source: "analysis/2026-01-25-acr-council-debate.md"
---

# Specification: ACR Tier 1 - Grep-based Entity Detection

## Overview

The first tier of Autonomous Contextual Recall (ACR) provides fast, synchronous entity detection at session start. It greps the USER/ directory for entities mentioned in the current conversation context, returning matches with source paths and confidence scores within 50ms P95.

This embodies Arbor's **Relationship Cultivates Results** principle: shared context eliminates re-explanation by surfacing relevant prior knowledge automatically.

## User Scenarios

### Scenario 1: Session Start with Known Entity

**As a** PAI user starting a new session
**I want** PAI to automatically detect when I mention known entities (contacts, projects, concepts)
**So that** relevant context is available without me having to explain or reference previous work

**Acceptance Criteria:**
- [ ] When session starts, grep scans USER/ for entities matching conversation context
- [ ] Matches return within 50ms P95
- [ ] Each match includes: entity name, source file path, match snippet, confidence score
- [ ] Results are sorted by confidence descending

### Scenario 2: No Entity Match

**As a** PAI user discussing a new topic
**I want** the system to quickly determine no prior context exists
**So that** there's no delay or false context injection

**Acceptance Criteria:**
- [ ] When no matches found, returns empty result set within 50ms
- [ ] Empty result triggers Tier 2 (Resona) evaluation
- [ ] No user-visible indication when nothing found (silent pass-through)

### Scenario 3: Ambiguous Entity Match

**As a** PAI user mentioning a common term (e.g., "security")
**I want** multiple potential matches returned with context
**So that** downstream routing can disambiguate or ask for clarification

**Acceptance Criteria:**
- [ ] Multiple matches returned when term appears in different contexts
- [ ] Each match includes surrounding context (±3 lines)
- [ ] Confidence score reflects match specificity (exact vs partial)
- [ ] Low aggregate confidence (<0.7) triggers Tier 2 escalation

## Functional Requirements

### FR-1: Entity Extraction from Session Context

Extract searchable entities from the current session context:
- User's initial prompt
- Current working directory name
- Recent file paths mentioned
- Proper nouns and capitalized terms

**Validation:** Unit tests with sample prompts verify correct entity extraction

### FR-2: USER/ Directory Grep

Synchronous grep of USER/ directory files:
- DAIDENTITY.md - Personal identity and preferences
- CONTACTS/ - Known people and relationships
- TELOS/LEARNED.md - Accumulated learnings
- TELOS/PROJECTS.md - Active and past projects
- ALGOPREFS.md - Algorithm preferences

**Validation:** Integration test greps all USER/ files and returns results within latency target

### FR-3: Match Scoring

Calculate confidence score for each match:
- 1.0: Exact phrase match
- 0.8: Exact word match
- 0.6: Partial word match (prefix/suffix)
- 0.4: Related term (via simple stemming)

**Validation:** Unit tests verify scoring algorithm produces expected scores for test cases

### FR-4: Result Aggregation

Aggregate results into structured response:
```typescript
interface GrepResult {
  matches: Array<{
    entity: string;
    source: string;  // file path
    snippet: string; // context window
    line: number;
    confidence: number;
  }>;
  aggregateConfidence: number;  // max of individual scores
  latencyMs: number;
  escalateToTier2: boolean;  // true if aggregateConfidence < 0.7
}
```

**Validation:** Schema validation on all grep results

## Non-Functional Requirements

- **Performance:** P95 latency < 50ms; P99 < 100ms
- **Reliability:** Must not block session start on failure; timeout after 75ms
- **Scalability:** Must handle USER/ directories up to 1MB total
- **Failure Behavior:**
  - On grep timeout: Return empty result, log warning, proceed to Tier 2
  - On file read error: Skip file, continue with remaining files
  - On malformed USER/ structure: Degrade gracefully, return partial results

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| GrepResult | Aggregated search results | matches[], aggregateConfidence, escalateToTier2 |
| EntityMatch | Single file match | entity, source, snippet, line, confidence |
| SearchContext | Extracted session context | entities[], workingDir, recentFiles |

## Success Criteria

- [ ] P95 latency < 50ms measured over 1000 session starts
- [ ] Correctly identifies known contacts with >0.9 confidence when mentioned by name
- [ ] Returns empty in <20ms when no entities match
- [ ] Zero false positives in USER/ path exposure (only return content, not paths with secrets)

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| USER/ directory is <1MB | User stores large files in USER/ | Measure directory size at hook install |
| Files are UTF-8 text | Binary files in USER/ | File type detection before grep |
| Grep is faster than Resona | Edge cases where embedding lookup wins | Compare latencies in production |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| PAI USER/ Directory | Identity, contacts, learnings | Structure changes break grep patterns | USER/README.md |
| Session Lifecycle Hooks | Trigger point for ACR | Hook removal disables feature | THEHOOKSYSTEM.md |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| F-003 Context Injection | GrepResult interface | Any schema change |
| F-002 Resona Tier 2 | escalateToTier2 signal | Threshold change |

### Adjacent Systems (Implicit Coupling)

| System | Implicit Dependency | Risk |
|--------|---------------------|------|
| File system performance | macOS fs grep speed | Low - SSD assumed |
| Node.js child_process | grep subprocess spawning | Low - standard API |

## Open Questions

- [ ] Should we cache USER/ file contents in memory for faster repeated access?
- [ ] What's the right confidence threshold for Tier 2 escalation (0.7 proposed)?
- [ ] Should we index USER/ incrementally rather than grep on every session?

## Out of Scope

- Semantic understanding of entities (Tier 2 handles this)
- Cross-session entity linking (Tier 3/Maestro handles this)
- Entity relationship inference
- USER/ directory modification
- Caching between sessions (defer to v2)
