# F-003 Documentation Updates

## Files Created

### Source Files

| File | Purpose |
|------|---------|
| `src/tier3-types.ts` | Type definitions and Zod schemas for injection |
| `src/tier3-confidence-router.ts` | Routes based on confidence thresholds |
| `src/tier3-formatter.ts` | Formats context for system-reminder output |
| `src/tier3-token-budget.ts` | Manages 2000-token allocation |
| `src/tier3-session-state.ts` | Tracks rejected suggestions per session |
| `src/tier3-ask-pattern.ts` | Implements ask-before-inject pattern |
| `src/tier3-injection.ts` | Main entry point for context injection |

### Test Files

| File | Tests |
|------|-------|
| `tests/tier3-types.test.ts` | Schema validation |
| `tests/tier3-confidence-router.test.ts` | Routing logic |
| `tests/tier3-formatter.test.ts` | Formatting output |
| `tests/tier3-token-budget.test.ts` | Budget management |
| `tests/tier3-session-state.test.ts` | Session tracking |
| `tests/tier3-ask-pattern.test.ts` | Ask pattern flow |
| `tests/tier3-injection.test.ts` | Integration tests |

## API Documentation

### runContextInjection(tier1Result, tier2Result, options?)

Main entry point for context injection decision.

**Parameters:**
- `tier1Result` - Result from runTier1Grep()
- `tier2Result` - Result from runTier2Semantic()
- `options.sessionId` - Session identifier for state tracking

**Returns:**
```typescript
{
  action: "inject" | "ask" | "skip";
  context?: string;           // Formatted system-reminder
  question?: AskUserQuestion; // If action is "ask"
  tokenCount: number;
  truncated: boolean;
}
```

### Configuration Constants

```typescript
INJECTION_CONFIG = {
  confidenceThreshold: 0.7,   // Auto-inject above this
  maxTokenBudget: 2000,       // Max tokens for ACR context
  minConfidence: 0.3,         // Skip below this
}
```

## Changelog

| Date | Change |
|------|--------|
| 2026-01-25 | Feature specified |
| 2026-01-26 | Implementation complete |
| 2026-01-27 | Documentation updated |
