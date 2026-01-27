# F-003 Technical Plan

**Feature:** ACR Context Injection
**Status:** COMPLETE

## Architecture Overview

Tier 3 (Context Injection) is the decision layer that receives results from Tier 1 (grep) and Tier 2 (semantic), applies confidence-based routing, and manages context injection into Claude sessions.

## Components

### Core Modules

1. **tier3-types.ts** - Type definitions and Zod schemas
2. **tier3-confidence-router.ts** - Routes based on confidence thresholds
3. **tier3-formatter.ts** - Formats context for injection
4. **tier3-token-budget.ts** - Manages token allocation
5. **tier3-session-state.ts** - Tracks session rejections
6. **tier3-ask-pattern.ts** - Implements ask-before-inject pattern
7. **tier3-injection.ts** - Main entry point

### Data Flow

```
Tier 1 Results + Tier 2 Results
            ↓
    Confidence Router
            ↓
    ┌───────┴───────┐
    ↓               ↓
Auto-Inject    Ask Pattern
    ↓               ↓
    └───────┬───────┘
            ↓
    Token Budget Check
            ↓
    Context Formatter
            ↓
    System Reminder Output
```

## Configuration

- `CONFIDENCE_THRESHOLD`: 0.7 (auto-inject above, ask below)
- `MAX_TOKEN_BUDGET`: 2000 tokens for ACR context
- `TRUNCATION_STRATEGY`: Keep highest-confidence matches

## API

### runContextInjection(tier1Result, tier2Result, options)

Main entry point that:
1. Merges results from both tiers
2. Routes based on confidence
3. Applies token budget
4. Returns formatted context or ask question

## Testing Strategy

- Unit tests for each module
- Integration tests for full pipeline
- Mock tier1/tier2 results for isolation
