---
id: "F-004"
feature: "ACR Forgetting Policies"
phase: "tasks"
created: "2026-01-26"
---

# Implementation Tasks: ACR Forgetting Policies

## Task List

### T-1: Create tier4-types.ts
**File:** `src/tier4-types.ts`
**Status:** ✅ Complete

- [x] Define ContentTypeSchema enum (identity, contacts, projects, learnings, sessions, operational)
- [x] Define HALF_LIFE_DAYS constant with values per spec
- [x] Define ContentMetadataSchema with created, updated, ttl, contentType
- [x] Define DecayedResultSchema with raw/decayed confidence, age, factor
- [x] Define Tier4ConfigSchema with enabled, archiveThreshold, historicalMode
- [x] Define DecayOptionsSchema for query-time options
- [x] Export helper functions: createDefaultTier4Config, getHalfLife, createDecayedResult

### T-2: Create tier4-decay.ts
**File:** `src/tier4-decay.ts`
**Status:** ✅ Complete

- [x] Implement calculateDecayFactor(ageDays, halfLifeDays) using 0.5^(age/halfLife)
- [x] Implement applyTemporalDecay(confidence, ageDays, halfLifeDays)
- [x] Implement calculateAgeDays(contentDate, referenceDate)
- [x] Implement calculateAgeDaysFromTimestamp(timestampMs, referenceMs)
- [x] Implement applyDecayWithMetadata(confidence, metadata, config, options)
- [x] Implement applyDecaySimple(confidence, contentType, ageDays, config)
- [x] Implement applyDecayBatch for multiple items
- [x] Implement utility functions: shouldArchive, daysUntilConfidence, getDecaySummary

### T-3: Create tier4-content-type.ts
**File:** `src/tier4-content-type.ts`
**Status:** ✅ Complete

- [x] Define PATH_PATTERNS array with regex patterns for each content type
- [x] Define SOURCE_TYPE_MAP for Tier 2 source type classification
- [x] Implement classifyByPath(filePath) using pattern matching
- [x] Implement classifyBySourceType(sourceType) using map lookup
- [x] Implement classifyContent(filePath?, sourceType?) with priority logic
- [x] Implement getHalfLifeForPath and getHalfLifeForSourceType shortcuts
- [x] Implement validation helpers: isValidContentType, parseContentType
- [x] Implement utility: getContentTypeDescription, getContentTypesByHalfLife

### T-4: Create tier4-metadata.ts
**File:** `src/tier4-metadata.ts`
**Status:** ✅ Complete

- [x] Implement extractFrontmatter(content) with YAML regex parsing
- [x] Implement parseFrontmatterDate(value) for ISO and Unix timestamps
- [x] Implement parseTTL(value) handling 0, -1, N, "permanent", "30d" formats
- [x] Implement getFileTimestamps(filePath) using fs.stat
- [x] Implement extractMetadata(content, filePath, fileStats) async
- [x] Implement extractMetadataSync(content, filePath, referenceDate)
- [x] Implement createDefaultMetadata(contentType, referenceDate)
- [x] Implement TTL helpers: isPermanent, usesDefaultDecay, hasExplicitExpiration
- [x] Implement getExpirationDate and isExpired

### T-5: Create tier4-integration.ts
**File:** `src/tier4-integration.ts`
**Status:** ✅ Complete

- [x] Define DecayedEntityMatch interface extending EntityMatch
- [x] Define DecayedRankedResult interface extending RankedResult
- [x] Define DecayedGrepResult interface
- [x] Implement applyDecayToMatch(match, timestampMs, config)
- [x] Implement applyDecayToMatches(matches, getTimestamp, config) async
- [x] Implement applyDecayToMatchesSync(matches, config)
- [x] Implement applyDecayToRankedResult(result, timestampMs, config)
- [x] Implement applyDecayToRankedResults(results, getTimestamp, config) async
- [x] Implement applyDecayToRankedResultsSync(results, config)
- [x] Implement aggregateDecayedConfidence(matches)
- [x] Implement shouldEscalateWithDecay(confidence, threshold)
- [x] Implement utility functions: timestampDaysAgo, getDecayStats

### T-6: Export from index.ts
**File:** `src/index.ts`
**Status:** ✅ Complete

- [x] Add Tier 4 section comment block
- [x] Export all types from tier4-types.ts
- [x] Export all functions from tier4-decay.ts
- [x] Export all functions from tier4-content-type.ts
- [x] Export all functions from tier4-metadata.ts
- [x] Export all types and functions from tier4-integration.ts

### T-7: Create unit tests
**Files:** `tests/tier4-*.test.ts`
**Status:** ✅ Complete

- [x] Create tier4-types.test.ts with schema and constant tests
- [x] Create tier4-decay.test.ts with decay math validation
- [x] Create tier4-content-type.test.ts with classification tests
- [x] Create tier4-metadata.test.ts with parsing tests
- [x] Create tier4-integration.test.ts with integration tests
- [x] Verify 30d → 0.5 factor, 60d → 0.25 factor
- [x] Verify TTL=0 bypasses decay
- [x] Verify historical mode bypasses decay
- [x] Verify re-ranking after decay

### T-8: Update feature status
**File:** `.specify/features.json`
**Status:** ✅ Complete

- [x] Change F-004 status from "pending" to "complete"

### T-9: Create SpecFlow artifacts
**Status:** ✅ Complete

- [x] Create plan.md documenting architecture and approach
- [x] Create tasks.md with implementation checklist (this file)
- [x] Create docs.md with API reference
- [x] Link spec_path in SpecFlow database
- [x] Advance phase through SpecFlow gates

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Source files created | 5 | ✅ Complete |
| Test files created | 5 | ✅ Complete |
| Tests passing | 128 | ✅ Complete |
| Total tests (all ACR) | 548 | ✅ Complete |

## Implementation Notes

1. **Decay applied post-scoring:** Rather than modifying match-scorer.ts and tier2-ranker.ts directly, created wrapper functions in tier4-integration.ts. This preserves original scores and allows historical mode.

2. **Deferred features:** FR-5 (cleanup job) and FR-6 (archive access) were deferred per spec allowance. Content with low decayed confidence simply ranks lower rather than being removed.

3. **Schema fix:** Initial Tier4ConfigSchema used z.record() which required all keys. Changed to explicit optional fields per content type.
