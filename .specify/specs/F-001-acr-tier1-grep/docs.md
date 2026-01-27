# F-001 Documentation Updates

## Files Updated

### Source Files

| File | Purpose |
|------|---------|
| `src/types.ts` | Core TypeScript interfaces and Zod schemas |
| `src/config.ts` | Configuration constants and getTier1Config() |
| `src/entity-extractor.ts` | Proper noun and entity extraction from prompts |
| `src/grep-engine.ts` | File search with context extraction |
| `src/match-scorer.ts` | Confidence scoring for matches |
| `src/tier1-grep.ts` | Main entry point - runTier1Grep() |

### Test Files

| File | Tests |
|------|-------|
| `tests/types.test.ts` | Schema validation tests |
| `tests/entity-extractor.test.ts` | 15 tests for entity extraction |
| `tests/grep-engine.test.ts` | 22 tests for file search |
| `tests/match-scorer.test.ts` | 7 tests for confidence scoring |
| `tests/tier1-grep.test.ts` | 20 tests for full pipeline |

## API Documentation

### runTier1Grep(prompt: string, options?: Tier1Options): Tier1Result

Main entry point for Tier 1 grep-based search.

**Parameters:**
- `prompt` - User prompt to extract entities from
- `options.cwd` - Current working directory (optional)
- `options.timeout` - Timeout in ms (default: 75ms)

**Returns:**
```typescript
{
  matches: EntityMatch[];      // Array of matches with context
  aggregateConfidence: number; // 0-1 confidence score
  escalateToTier2: boolean;    // True if confidence < threshold
  latencyMs: number;           // Execution time
}
```

### extractEntities(prompt: string): string[]

Extracts proper nouns and entities from prompt text.

### grepFiles(entity: string, directory: string): GrepResult[]

Searches files for entity matches with context.

### scoreMatch(match: GrepResult, entity: string): number

Calculates confidence score (0-1) for a match.

## Usage Examples

```typescript
import { runTier1Grep } from './tier1-grep';

const result = await runTier1Grep("Help me with the Scuol project");
console.log(result.matches);           // [{file: 'PROJECTS.md', ...}]
console.log(result.aggregateConfidence); // 0.85
console.log(result.escalateToTier2);     // false
```

## Changelog

| Date | Change |
|------|--------|
| 2026-01-25 | Feature specified |
| 2026-01-26 | Implementation complete |
| 2026-01-27 | Documentation updated |
