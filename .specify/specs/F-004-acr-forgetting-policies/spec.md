---
id: "F-004"
feature: "ACR Forgetting Policies"
status: "draft"
created: "2026-01-25"
council-source: "analysis/2026-01-25-acr-council-debate.md"
depends-on: ["F-001", "F-002", "F-003"]
---

# Specification: ACR Forgetting Policies

## Overview

Forgetting Policies implement the Skeptic's wisdom: "Graceful forgetting is a feature, not a bug." This feature manages temporal decay of retrieved context, ensuring operational details fade while emotional truth persists. It prevents retrieval pollution from stale context and implements the 30-day half-life default.

This embodies the balance between Arbor's **Care Compounds Over Time** and the recognition that natural memory forgets gracefully.

## User Scenarios

### Scenario 1: Temporal Decay of Operational Context

**As a** PAI user returning to a topic after a month
**I want** PAI to remember the essence but not stale details
**So that** outdated operational context doesn't mislead current work

**Acceptance Criteria:**
- [ ] Context older than 30 days has confidence reduced by 50% (half-life)
- [ ] Context older than 90 days has confidence reduced by 87.5%
- [ ] Decay applies multiplicatively to retrieval confidence scores
- [ ] Decay is configurable per content type

### Scenario 2: Emotional Context Preservation

**As a** PAI user with long-term relationships and projects
**I want** relationship context to persist longer than task details
**So that** PAI remembers who people are even if specific conversations fade

**Acceptance Criteria:**
- [ ] Identity context (CONTACTS/, DAIDENTITY.md) has 90-day half-life
- [ ] Project context (TELOS/PROJECTS.md) has 60-day half-life
- [ ] Session synopses have 30-day half-life
- [ ] Learned preferences (ALGOPREFS.md) have 180-day half-life

### Scenario 3: Explicit TTL Override

**As a** PAI user marking specific context as permanent or temporary
**I want** to override default decay policies
**So that** important context persists and temporary context expires quickly

**Acceptance Criteria:**
- [ ] Content can be marked with explicit TTL in metadata
- [ ] TTL=0 means never expires (permanent)
- [ ] TTL=-1 means use default decay
- [ ] TTL=N means expire after N days (hard delete)

### Scenario 4: Stale Context Cleanup

**As a** PAI system managing storage and relevance
**I want** very old context automatically archived or deleted
**So that** the index stays relevant and performant

**Acceptance Criteria:**
- [ ] Context with effective confidence < 0.1 after decay is archived
- [ ] Archived content removed from active search index
- [ ] Archive accessible for explicit historical queries
- [ ] Weekly cleanup job processes expired content

## Functional Requirements

### FR-1: Temporal Decay Calculation

Apply decay to confidence scores:
```typescript
function applyTemporalDecay(
  confidence: number,
  contentAge: number,  // days since creation/last update
  halfLifeDays: number
): number {
  const decayFactor = Math.pow(0.5, contentAge / halfLifeDays);
  return confidence * decayFactor;
}
```

**Validation:** Unit tests verify decay math for known age/half-life combinations

### FR-2: Content Type Classification

Classify content for appropriate half-life:
```typescript
const HALF_LIFE_DAYS: Record<ContentType, number> = {
  'identity': 180,      // DAIDENTITY.md, core preferences
  'contacts': 90,       // CONTACTS/ directory
  'projects': 60,       // TELOS/PROJECTS.md
  'learnings': 45,      // TELOS/LEARNED.md
  'sessions': 30,       // Maestro synopses
  'operational': 14,    // Task-specific context
};
```

**Validation:** Content classification correctly identifies all USER/ file types

### FR-3: Decay Application at Query Time

Apply decay during retrieval, not storage:
- Store original timestamps with content
- Calculate effective confidence at query time
- Include both raw and decayed confidence in results
- Allow user to request "historical" mode (no decay)

**Validation:** Same query returns different confidence over time for aging content

### FR-4: TTL Metadata Support

Parse and apply explicit TTL overrides:
```typescript
interface ContentMetadata {
  created: Date;
  updated: Date;
  ttl?: number;  // 0=permanent, -1=default, N=days
  contentType: ContentType;
  preserveReason?: string;  // Why marked permanent
}
```

**Validation:** TTL overrides correctly bypass or accelerate decay

### FR-5: Cleanup Job

Weekly job to archive stale content:
1. Scan all indexed content
2. Calculate effective confidence with decay
3. If confidence < 0.1: move to archive
4. If TTL expired: hard delete
5. Log cleanup statistics

**Validation:** Cleanup job runs without error, correctly archives/deletes expected content

### FR-6: Archive Access

Provide access to archived content:
- Separate archive index (not searched by default)
- Explicit flag to include archive: `--include-archived`
- Archive query shows original confidence + decay reason
- Restore from archive possible

**Validation:** Archived content retrievable with explicit flag

## Non-Functional Requirements

- **Performance:** Decay calculation adds < 1ms per result
- **Storage:** Archive storage grows at most 10% per year
- **Reliability:** Cleanup job is idempotent and resumable
- **Failure Behavior:**
  - On decay calculation error: Use raw confidence (no decay)
  - On cleanup job failure: Retry next week, alert if 3 consecutive failures
  - On archive corruption: Rebuild from source files

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| ContentMetadata | Timestamp and TTL info | created, updated, ttl, contentType |
| DecayedResult | Result with temporal adjustment | rawConfidence, decayedConfidence, age |
| ArchiveEntry | Stale content in cold storage | content, metadata, archivedAt, reason |
| CleanupReport | Weekly job results | processed, archived, deleted, errors |

## Success Criteria

- [ ] 30-day old session synopses have ~50% original confidence
- [ ] Contact information remains relevant for 90+ days
- [ ] No retrieval pollution from very old operational context
- [ ] Users report context feels appropriately current

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| Half-life values are appropriate | User feedback suggests different timing | Track retrieval helpfulness over time |
| Decay at query time is fast enough | Performance regression | Monitor query latency |
| Weekly cleanup is sufficient | Storage growth exceeds limits | Monitor index size |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| F-001 Tier 1 | Raw confidence scores | Score range changes | 0.0-1.0 normalized |
| F-002 Tier 2 | Raw similarity scores | Score range changes | 0.0-1.0 normalized |
| Content timestamps | Created/updated dates | Format changes | ISO 8601 |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| F-003 Context Injection | Decayed confidence scores | Score interpretation change |

### Adjacent Systems (Implicit Coupling)

| System | Implicit Dependency | Risk |
|--------|---------------------|------|
| Cron/scheduler | Weekly cleanup execution | Medium - needs monitoring |
| Archive storage | Disk space for cold storage | Low - compressed text |

## Open Questions

- [ ] Should users be able to configure half-life values in settings.json?
- [ ] How to handle content that's frequently re-accessed (reset decay)?
- [ ] Should decay be based on creation date or last access date?

## Out of Scope

- Machine learning-based relevance decay (use fixed half-life)
- Per-entity decay customization (use per-type)
- Real-time decay visualization for users
- Cross-user decay policy sharing
- Automatic content importance detection
