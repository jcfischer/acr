---
id: "F-004"
feature: "ACR Forgetting Policies"
phase: "docs"
created: "2026-01-26"
---

# API Reference: ACR Forgetting Policies (Tier 4)

## Overview

Tier 4 implements temporal decay for ACR context retrieval. Older content receives lower confidence scores, ensuring stale operational context fades while important identity/relationship context persists longer.

## Quick Start

```typescript
import {
  applyDecayToMatch,
  applyDecayToRankedResult,
  classifyByPath,
  HALF_LIFE_DAYS,
  createDefaultTier4Config,
} from 'acr';

// Apply decay to a Tier 1 match
const match = { entity: 'Daniel', source: 'sessions/meeting.md', confidence: 0.9, ... };
const timestampMs = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
const decayed = applyDecayToMatch(match, timestampMs);
// decayed.confidence ≈ 0.45 (50% decay at 30 days for sessions)

// Check half-life for a path
const halfLife = HALF_LIFE_DAYS[classifyByPath('DAIDENTITY.md')];
// halfLife = 180 (identity content persists longest)
```

## Content Types and Half-Lives

| Content Type | Half-Life | Example Sources |
|--------------|-----------|-----------------|
| `identity` | 180 days | DAIDENTITY.md, ALGOPREFS.md, preferences.md |
| `contacts` | 90 days | contacts/, people/ |
| `projects` | 60 days | TELOS/PROJECTS.md, projects/ |
| `learnings` | 45 days | TELOS/LEARNED.md, learning/ |
| `sessions` | 30 days | sessions/, synopsis.md, history.json |
| `operational` | 14 days | work/, tasks/, todo.md, unknown |

## Core Functions

### `calculateDecayFactor(ageDays, halfLifeDays)`

Calculate the decay multiplier using exponential decay.

```typescript
function calculateDecayFactor(ageDays: number, halfLifeDays: number): number
```

**Formula:** `factor = 0.5 ^ (ageDays / halfLifeDays)`

**Examples:**
- `calculateDecayFactor(0, 30)` → `1.0` (no decay)
- `calculateDecayFactor(30, 30)` → `0.5` (one half-life)
- `calculateDecayFactor(60, 30)` → `0.25` (two half-lives)
- `calculateDecayFactor(90, 30)` → `0.125` (87.5% decay)

### `applyTemporalDecay(confidence, ageDays, halfLifeDays)`

Apply decay to a confidence score.

```typescript
function applyTemporalDecay(
  confidence: number,
  ageDays: number,
  halfLifeDays: number
): number
```

**Returns:** `confidence * decayFactor`

### `applyDecaySimple(confidence, contentType, ageDays, config?)`

Simplified decay with automatic half-life lookup.

```typescript
function applyDecaySimple(
  confidence: number,
  contentType: ContentType,
  ageDays: number,
  config?: Tier4Config
): DecayedResult
```

**Returns:** Full `DecayedResult` with raw and decayed confidence.

## Classification Functions

### `classifyByPath(filePath)`

Classify content type from file path.

```typescript
function classifyByPath(filePath: string): ContentType
```

**Pattern Priority:**
1. Identity patterns (daidentity.md, algoprefs.md)
2. Contacts patterns (contacts/, people/)
3. Projects patterns (telos/projects.md, projects/)
4. Learnings patterns (telos/learned.md, learning/)
5. Sessions patterns (sessions/, synopsis)
6. Operational patterns (work/, tasks/)
7. Default: `operational`

### `classifyBySourceType(sourceType)`

Classify from Tier 2 source type string.

```typescript
function classifyBySourceType(sourceType: string): ContentType
```

**Mapping:**
- `user/identity` → `identity`
- `user/contacts` → `contacts`
- `user/projects` → `projects`
- `session` → `sessions`
- `user`, `tana` → `operational`

## Integration Functions

### `applyDecayToMatch(match, timestampMs, config?)`

Apply decay to a Tier 1 EntityMatch.

```typescript
function applyDecayToMatch(
  match: EntityMatch,
  fileTimestampMs: number,
  config?: Tier4Config
): DecayedEntityMatch
```

**Returns:** Extended match with:
- `confidence` - Decayed confidence (replaces original)
- `rawConfidence` - Original confidence
- `ageDays` - Age of content
- `decayFactor` - Multiplier applied
- `contentType` - Classified type
- `decayBypassed` - True if decay was skipped

### `applyDecayToMatchesSync(matches, config?)`

Batch apply decay to multiple matches.

```typescript
function applyDecayToMatchesSync(
  matches: Array<{ match: EntityMatch; timestampMs: number }>,
  config?: Tier4Config
): DecayedEntityMatch[]
```

**Returns:** Matches sorted by decayed confidence (descending).

### `applyDecayToRankedResult(result, timestampMs, config?)`

Apply decay to a Tier 2 RankedResult.

```typescript
function applyDecayToRankedResult(
  result: RankedResult,
  timestampMs: number,
  config?: Tier4Config
): DecayedRankedResult
```

### `applyDecayToRankedResultsSync(results, config?)`

Batch apply decay with re-ranking.

```typescript
function applyDecayToRankedResultsSync(
  results: Array<{ result: RankedResult; timestampMs: number }>,
  config?: Tier4Config
): DecayedRankedResult[]
```

**Returns:** Results re-sorted and re-ranked by decayed similarity.

## Metadata Functions

### `extractFrontmatter(content)`

Parse YAML frontmatter from content.

```typescript
function extractFrontmatter(content: string): Record<string, string> | null
```

### `parseTTL(value)`

Parse TTL value from various formats.

```typescript
function parseTTL(value: string | number | undefined): number | undefined
```

**Accepted Formats:**
- Numbers: `0`, `30`, `-1`
- Strings: `"permanent"`, `"never"` → `0`
- Strings: `"default"`, `"auto"` → `-1`
- Strings: `"30d"`, `"30 days"` → `30`

### `extractMetadataSync(content, filePath, referenceDate?)`

Extract full metadata from content.

```typescript
function extractMetadataSync(
  content: string,
  filePath: string,
  referenceDate?: Date
): ContentMetadata
```

## Configuration

### `Tier4Config`

```typescript
interface Tier4Config {
  enabled: boolean;           // Default: true
  archiveThreshold: number;   // Default: 0.1
  historicalMode: boolean;    // Default: false (disables all decay)
  halfLifeOverrides?: {       // Override defaults per type
    identity?: number;
    contacts?: number;
    projects?: number;
    learnings?: number;
    sessions?: number;
    operational?: number;
  };
}
```

### Environment Variables

- `ACR_DECAY_ENABLED=false` - Disable decay globally
- `ACR_HISTORICAL_MODE=true` - Enable historical mode (no decay)

## Types

### `ContentType`

```typescript
type ContentType =
  | 'identity'
  | 'contacts'
  | 'projects'
  | 'learnings'
  | 'sessions'
  | 'operational';
```

### `DecayedResult`

```typescript
interface DecayedResult {
  rawConfidence: number;      // Original confidence
  decayedConfidence: number;  // After decay
  ageDays: number;            // Content age
  decayFactor: number;        // Multiplier (0.0-1.0)
  contentType: ContentType;   // Classified type
  halfLifeDays: number;       // Half-life used
  decayBypassed: boolean;     // Was decay skipped?
}
```

### `ContentMetadata`

```typescript
interface ContentMetadata {
  created: Date;
  updated: Date;
  ttl?: number;              // 0=permanent, -1=default, N=days
  contentType: ContentType;
  preserveReason?: string;   // Why marked permanent
}
```

## Utility Functions

### `shouldArchive(decayedConfidence, threshold?)`

Check if content should be archived based on decayed confidence.

```typescript
function shouldArchive(decayedConfidence: number, threshold?: number): boolean
```

Default threshold: 0.1

### `daysUntilConfidence(currentConfidence, targetConfidence, halfLifeDays)`

Calculate days until confidence reaches target level.

```typescript
function daysUntilConfidence(
  currentConfidence: number,
  targetConfidence: number,
  halfLifeDays: number
): number
```

### `getDecaySummary(result)`

Get human-readable decay summary.

```typescript
function getDecaySummary(result: DecayedResult): string
// "100.0% → 50.0% (50.0% decay over 30 days)"
// "No decay (bypassed): 100.0%"
```

### `timestampDaysAgo(days)`

Create timestamp for N days ago.

```typescript
function timestampDaysAgo(days: number): number
```

### `getDecayStats(results)`

Get statistics for a set of decayed results.

```typescript
function getDecayStats(
  results: Array<{ decayFactor: number; decayBypassed: boolean }>
): {
  totalResults: number;
  decayedCount: number;
  bypassedCount: number;
  avgDecayFactor: number;
  minDecayFactor: number;
  maxDecayFactor: number;
}
```
