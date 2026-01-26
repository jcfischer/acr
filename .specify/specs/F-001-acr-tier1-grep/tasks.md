---
feature: "ACR Tier 1 - Grep-based Entity Detection"
plan: "./plan.md"
status: "complete"
total_tasks: 12
completed: 12
---

# Tasks: ACR Tier 1 - Grep-based Entity Detection

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Foundation (Types & Interfaces)

- [x] **T-1.1** Create TypeScript interfaces [T] [P]
  - File: `~/.claude/skills/CORE/src/acr/types.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/types.test.ts`
  - Description: Define SearchContext, EntityMatch, GrepResult interfaces with Zod schemas for runtime validation

- [x] **T-1.2** Create stopword list and config [P]
  - File: `~/.claude/skills/CORE/src/acr/config.ts`
  - Description: Define stopwords (the, a, is, etc.), minimum entity length (3), confidence thresholds (0.7 for Tier 2 escalation)

### Group 2: Entity Extraction

- [x] **T-2.1** Implement proper noun extractor [T] (depends: T-1.1)
  - File: `~/.claude/skills/CORE/src/acr/entity-extractor.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/entity-extractor.test.ts`
  - Description: Extract capitalized words from prompt, filter stopwords, handle edge cases (acronyms, file paths)

- [x] **T-2.2** Implement project name extractor [T] (depends: T-1.1)
  - File: `~/.claude/skills/CORE/src/acr/entity-extractor.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/entity-extractor.test.ts`
  - Description: Extract project name from cwd path (last directory component, handle hyphenated names)

- [x] **T-2.3** Implement file path entity extractor [T] (depends: T-1.1)
  - File: `~/.claude/skills/CORE/src/acr/entity-extractor.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/entity-extractor.test.ts`
  - Description: Extract file paths mentioned in prompt, return basename as entity

### Group 3: Grep Engine

- [x] **T-3.1** Implement file reader with timeout [T] (depends: T-1.1)
  - File: `~/.claude/skills/CORE/src/acr/grep-engine.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/grep-engine.test.ts`
  - Description: Read file with 75ms timeout, skip binary files (check magic bytes), handle UTF-8

- [x] **T-3.2** Implement parallel file grep [T] (depends: T-3.1)
  - File: `~/.claude/skills/CORE/src/acr/grep-engine.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/grep-engine.test.ts`
  - Description: Discover USER/ files, grep in parallel with Promise.all, collect EntityMatch[]

- [x] **T-3.3** Implement context window extraction [T] (depends: T-3.2)
  - File: `~/.claude/skills/CORE/src/acr/grep-engine.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/grep-engine.test.ts`
  - Description: Extract ±3 lines around match, include line numbers

### Group 4: Match Scoring

- [x] **T-4.1** Implement match scorer [T] (depends: T-1.1, T-1.2)
  - File: `~/.claude/skills/CORE/src/acr/match-scorer.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/match-scorer.test.ts`
  - Description: Score matches: exact=1.0, word-boundary=0.8, partial=0.6, case-insensitive penalty=-0.1

### Group 5: Integration & Main Entry Point

- [x] **T-5.1** Implement result aggregator [T] (depends: T-3.2, T-4.1)
  - File: `~/.claude/skills/CORE/src/acr/tier1-grep.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/tier1-grep.test.ts`
  - Description: Sort by confidence, calculate aggregateConfidence, set escalateToTier2 flag, record latencyMs

- [x] **T-5.2** Implement runTier1Grep main entry [T] (depends: T-5.1, T-2.1, T-2.2, T-2.3)
  - File: `~/.claude/skills/CORE/src/acr/tier1-grep.ts`
  - Test: `~/.claude/skills/CORE/tests/acr/tier1-grep.test.ts`
  - Description: Wire extractEntities → grepFiles → scoreMatches → aggregate. Full pipeline with performance measurement.

- [x] **T-5.3** Add hook integration (feature-flagged) (depends: T-5.2)
  - File: `~/.claude/hooks/LoadContext.hook.ts` (integrated into existing SessionStart hook)
  - Test: Manual verification via hook execution
  - Description: Call runTier1Grep from session-start hook, output as system-reminder, respect ACR_ENABLED flag

## Dependency Graph

```
T-1.1 ──┬──> T-2.1 ──┬
        │   T-2.2 ──┼──> T-5.2 ──> T-5.3
        │   T-2.3 ──┘       ▲
        │                   │
T-1.2 ──┴──> T-4.1 ─────────┤
                            │
T-3.1 ──> T-3.2 ──> T-3.3 ──┴──> T-5.1 ──┘
```

## Execution Order

1. **Parallel batch 1:** T-1.1, T-1.2
2. **Parallel batch 2:** T-2.1, T-2.2, T-2.3, T-3.1, T-4.1 (after batch 1)
3. **Sequential:** T-3.2 (after T-3.1)
4. **Sequential:** T-3.3 (after T-3.2)
5. **Sequential:** T-5.1 (after T-3.2, T-4.1)
6. **Sequential:** T-5.2 (after T-5.1, T-2.1, T-2.2, T-2.3)
7. **Sequential:** T-5.3 (after T-5.2)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | ✅ done | 2026-01-25 | 2026-01-25 | Types + Zod schemas (10 tests) |
| T-1.2 | ✅ done | 2026-01-25 | 2026-01-25 | Config + stopwords |
| T-2.1 | ✅ done | 2026-01-25 | 2026-01-25 | Proper nouns (7 tests) |
| T-2.2 | ✅ done | 2026-01-25 | 2026-01-25 | Project names (5 tests) |
| T-2.3 | ✅ done | 2026-01-25 | 2026-01-25 | File paths (6 tests) |
| T-3.1 | ✅ done | 2026-01-25 | 2026-01-25 | File reader (4 tests) |
| T-3.2 | ✅ done | 2026-01-25 | 2026-01-25 | Parallel grep (8 tests) |
| T-3.3 | ✅ done | 2026-01-25 | 2026-01-25 | Context window (4 tests) |
| T-4.1 | ✅ done | 2026-01-25 | 2026-01-25 | Match scoring (10 tests) |
| T-5.1 | ✅ done | 2026-01-25 | 2026-01-25 | Aggregator (7 tests) |
| T-5.2 | ✅ done | 2026-01-25 | 2026-01-25 | Main entry (6 tests) |
| T-5.3 | ✅ done | 2026-01-25 | 2026-01-25 | Integrated into LoadContext.hook.ts |

## TDD Enforcement (MANDATORY)

**CRITICAL:** Every task marked [T] MUST follow the RED-GREEN-BLUE cycle. This is not optional.

### The TDD Cycle

For each task marked [T]:

1. **RED:** Write failing test FIRST
   - The test must fail before implementation
   - Run `bun test` to verify it fails
   - If the test passes without implementation, the test is wrong

2. **GREEN:** Write MINIMAL implementation to pass
   - Only write enough code to make the test pass
   - Do not add extra features or "nice to haves"
   - Run `bun test` to verify it passes

3. **BLUE:** Refactor while keeping tests green
   - Clean up code, remove duplication
   - Run `bun test` after each change
   - Tests must stay green throughout

4. **VERIFY:** Run full test suite (`bun test`)
   - ALL tests must pass, not just the new one
   - Check for regressions

### Test Coverage Requirements

- **Minimum ratio:** 0.3 (test files / source files)
- **Every source file** should have a corresponding test file
- **specflow complete** will REJECT features with insufficient coverage

### DO NOT Proceed Until:

- [ ] Test written BEFORE implementation (RED phase completed)
- [ ] Current task's tests pass (GREEN phase completed)
- [ ] Full test suite passes (no regressions)
- [ ] Test file ratio meets minimum (0.3)

### Common TDD Violations (AVOID)

- Writing implementation first, then tests (this is not TDD)
- Writing tests that pass immediately (test is meaningless)
- Skipping tests for "simple" code (all code needs tests)
- Moving to next task before current tests pass

## Blockers & Issues

[Track any blockers discovered during implementation]

| Task | Issue | Resolution |
|------|-------|------------|
| - | - | - |

## Post-Implementation Verification

**Before marking feature complete, verify:**

### Functional Verification
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] P95 latency < 50ms verified with benchmark
- [ ] Feature works as specified in acceptance criteria

### Failure Verification (Doctorow Gate)
- [ ] **Failure test:** Timeout exceeded → returns empty result, logs warning
- [ ] **Assumption test:** USER/ directory empty → returns empty, escalates to Tier 2
- [ ] **Rollback test:** ACR_ENABLED=false disables feature completely
- [ ] **Error messages:** File read errors produce actionable messages

### Maintainability Verification
- [ ] **Documentation test:** Someone new could understand why this code exists
- [ ] **Debt recorded:** Added entry to project debt-ledger.md
- [ ] **No orphan code:** All new code is reachable and tested

### Performance Verification
- [ ] **Latency benchmark:** 100 runs, P95 < 50ms
- [ ] **Memory benchmark:** Peak memory during grep < 10MB
- [ ] **File count verified:** USER/ directory size measured at install

### Sign-off
- [ ] All verification items checked
- [ ] Debt score calculated and recorded
- Date completed: ___
