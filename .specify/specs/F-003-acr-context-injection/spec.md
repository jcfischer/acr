---
id: "F-003"
feature: "ACR Context Injection"
status: "draft"
created: "2026-01-25"
council-source: "analysis/2026-01-25-acr-council-debate.md"
depends-on: ["F-001", "F-002"]
---

# Specification: ACR Context Injection

## Overview

Context Injection is the decision layer of Autonomous Contextual Recall (ACR). It receives results from Tier 1 (grep) and Tier 2 (Resona), applies confidence-based routing to decide whether to inject context automatically or ask the user, and manages token budgets and visible indicators.

This embodies Arbor's **Trust Grows Capability** principle balanced with the Skeptic's wisdom: autonomy with transparency, asking when uncertain rather than guessing.

## User Scenarios

### Scenario 1: High-Confidence Automatic Injection

**As a** PAI user who mentioned a known contact
**I want** PAI to automatically include relevant context about that person
**So that** I don't have to explain who they are or our history

**Acceptance Criteria:**
- [ ] When confidence >= 0.7, context injected automatically
- [ ] Injected context visible via indicator: `[context: source, confidence]`
- [ ] Context appears in system-reminder format
- [ ] User can review what was injected

### Scenario 2: Low-Confidence Ask Pattern

**As a** PAI user mentioning an ambiguous term
**I want** PAI to ask before injecting uncertain context
**So that** wrong context doesn't mislead the conversation

**Acceptance Criteria:**
- [ ] When confidence < 0.7, PAI asks: "I found context about X from Y - relevant here?"
- [ ] User can approve, reject, or see more options
- [ ] Rejection is remembered for this session (don't re-ask)
- [ ] Question uses AskUserQuestion with clear options

### Scenario 3: Token Budget Management

**As a** PAI system managing context window
**I want** injected context to respect token limits
**So that** user's prompt space isn't crowded out by retrieved context

**Acceptance Criteria:**
- [ ] Maximum 2000 tokens allocated for ACR context
- [ ] Context truncated intelligently (keep most relevant snippets)
- [ ] Truncation indicated: `[context: truncated, showing 3/7 matches]`
- [ ] Token count visible in debug mode

### Scenario 4: Multi-Source Context Merge

**As a** PAI user with context from multiple sources
**I want** results merged intelligently
**So that** I see a coherent context block, not fragmented snippets

**Acceptance Criteria:**
- [ ] Tier 1 and Tier 2 results merged into single context block
- [ ] Duplicates removed (same content from different sources)
- [ ] Sources prioritized: USER/ > Maestro sessions > Tana
- [ ] Each source labeled in the merged output

## Functional Requirements

### FR-1: Confidence-Based Routing

Decision logic for injection vs ask:
```typescript
function shouldInjectAutomatically(confidence: number, source: string): boolean {
  // High confidence from identity sources: always inject
  if (confidence >= 0.9 && source === 'user/daidentity') return true;

  // High confidence general: inject
  if (confidence >= 0.7) return true;

  // Medium confidence: ask user
  if (confidence >= 0.5) return false; // triggers ask

  // Low confidence: don't surface at all
  return false; // silently skip
}
```

**Validation:** Unit tests cover all confidence ranges and source types

### FR-2: Context Formatting

Format retrieved context for injection:
```markdown
<acr-context source="USER/CONTACTS/john-doe.md" confidence="0.85">
John Doe - Met at security conference 2024. Works at Acme Corp.
Previously discussed: API security architecture, threat modeling.
</acr-context>
```

**Validation:** Output format matches expected system-reminder structure

### FR-3: Ask Pattern Implementation

When confidence < 0.7, present options to user:
```typescript
AskUserQuestion({
  questions: [{
    header: "Prior Context",
    question: `I found context about "${entity}" from ${source} (${daysAgo} days ago). Is this relevant?`,
    options: [
      { label: "Yes, include it", description: "Add this context to current conversation" },
      { label: "No, skip it", description: "Don't include and don't ask again this session" },
      { label: "Show me first", description: "Preview the context before deciding" }
    ],
    multiSelect: false
  }]
})
```

**Validation:** Integration test verifies ask pattern triggers at correct threshold

### FR-4: Token Budget Enforcement

Manage token allocation:
- Parse all candidate context
- Count tokens using tiktoken (cl100k_base)
- If total > 2000 tokens:
  - Sort by confidence descending
  - Include highest confidence items first
  - Truncate last item if partial fit
  - Add truncation indicator

**Validation:** No injected context exceeds 2000 tokens in tests

### FR-5: Session Memory for Rejections

Track user rejections within session:
```typescript
interface SessionACRState {
  rejectedEntities: Set<string>;  // Don't re-ask about these
  acceptedSources: Map<string, number>;  // Approved sources with timestamps
  injectionCount: number;  // Total injections this session
}
```

**Validation:** Rejected entities not re-asked within same session

## Non-Functional Requirements

- **Performance:** Routing decision < 10ms; formatting < 20ms
- **User Experience:** Ask pattern must not feel intrusive (max 1 ask per session start)
- **Transparency:** User can always see what was injected and why
- **Failure Behavior:**
  - On formatting error: Inject raw text with error indicator
  - On ask pattern failure: Default to not injecting (safe failure)
  - On token counting error: Use conservative estimate (overcount by 20%)

## Key Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| InjectionDecision | Routing result | shouldInject, shouldAsk, confidence, source |
| FormattedContext | Ready-to-inject content | content, tokens, truncated, sources |
| SessionACRState | Per-session tracking | rejectedEntities, acceptedSources |

## Success Criteria

- [ ] High-confidence context injected without user friction
- [ ] Low-confidence context prompts user (measured: <5% of sessions have ask pattern)
- [ ] Zero token budget violations in production
- [ ] User satisfaction: context injection feels helpful, not intrusive

## Assumptions

| Assumption | What Would Invalidate It | Detection Strategy |
|-----------|-------------------------|-------------------|
| tiktoken cl100k_base matches Claude's tokenizer | Anthropic changes tokenizer | Compare counts periodically |
| 2000 tokens is appropriate budget | Users complain about too much/little context | User feedback, A/B testing |
| One ask per session start is acceptable UX | Users find it disruptive | Session feedback |

## System Context

### Upstream Dependencies

| System | What We Get | What Breaks If It Changes | Version/Contract |
|--------|-------------|---------------------------|------------------|
| F-001 Tier 1 | GrepResult | Interface change | GrepResult interface |
| F-002 Tier 2 | SemanticResult | Interface change | SemanticResult interface |
| tiktoken | Token counting | Model ID change | cl100k_base |

### Downstream Consumers

| System | What They Expect | Breaking Change Threshold |
|--------|-----------------|--------------------------|
| PAI Algorithm | <acr-context> in system prompt | Format change |
| Session transcript | ACR injection logged | Logging format change |

### Adjacent Systems (Implicit Coupling)

| System | Implicit Dependency | Risk |
|--------|---------------------|------|
| AskUserQuestion | UI for ask pattern | Low - stable API |
| System prompt structure | Where context is injected | Medium - format sensitive |

## Open Questions

- [ ] Should confidence threshold (0.7) be configurable per-user?
- [ ] Should we support "always inject from X source" preferences?
- [ ] How to handle conflicting context from multiple sources?

## Out of Scope

- Context persistence across sessions (handled by Tier 1/2 storage)
- Context modification or correction by user
- Learning from user feedback on injection quality (defer to v2)
- Real-time context updates during conversation
