---
feature: "F-005 - Maestro Session Indexing"
plan: "./plan.md"
status: "pending"
total_tasks: 12
completed: 0
---

# Tasks: Maestro Session Indexing

## Legend

- `[T]` - Test required (TDD mandatory - write test FIRST)
- `[P]` - Can run in parallel with other [P] tasks in same group
- `depends: T-X.Y` - Must complete after specified task(s)

## Task Groups

### Group 1: Foundation (Types + Schemas)

- [ ] **T-1.1** Create Maestro type definitions [T] [P]
  - File: `src/maestro-types.ts`
  - Test: `tests/maestro-types.test.ts`
  - Description: Define MaestroEntry, MaestroEmbeddingInput, MaestroIndexState types with Zod schemas

- [ ] **T-1.2** Add 'maestro' to SourceType enum [T] [P]
  - File: `src/tier2-types.ts`
  - Test: `tests/tier2-types.test.ts` (modify existing)
  - Description: Extend SourceTypeSchema to include 'maestro' as valid source

### Group 2: Parser Module

- [ ] **T-2.1** Implement Maestro history file parser [T] (depends: T-1.1)
  - File: `src/maestro-parser.ts`
  - Test: `tests/maestro-parser.test.ts`
  - Description: Parse JSON history files, validate with Zod, handle malformed files gracefully

- [ ] **T-2.2** Implement entry filtering logic [T] (depends: T-2.1)
  - File: `src/maestro-parser.ts` (add to existing)
  - Test: `tests/maestro-parser.test.ts` (add cases)
  - Description: Filter entries with summary.length > 10, convert to MaestroEmbeddingInput

### Group 3: Indexing Module

- [ ] **T-3.1** Implement index state management [T] (depends: T-1.1)
  - File: `src/maestro-indexer.ts`
  - Test: `tests/maestro-indexer.test.ts`
  - Description: Load/save MaestroIndexState from JSON file, handle missing/corrupt state

- [ ] **T-3.2** Implement entry indexing pipeline [T] (depends: T-2.2, T-3.1)
  - File: `src/maestro-indexer.ts`
  - Test: `tests/maestro-indexer.test.ts`
  - Description: Batch entries (100/batch), generate sourceId, call Resona embed

- [ ] **T-3.3** Implement incremental sync logic [T] (depends: T-3.2)
  - File: `src/maestro-indexer.ts`
  - Test: `tests/maestro-indexer.test.ts`
  - Description: Compare file mtimes vs state, index only changed files

- [ ] **T-3.4** Implement full reindex and clear operations [T] (depends: T-3.3)
  - File: `src/maestro-indexer.ts`
  - Test: `tests/maestro-indexer.test.ts`
  - Description: Full reindex ignores state; clear removes entries and resets state

### Group 4: Integration

- [ ] **T-4.1** Register Maestro SearchSource in ResonaAdapter [T] (depends: T-1.2, T-3.2)
  - File: `src/resona-adapter.ts`
  - Test: `tests/resona-adapter.test.ts` (add cases)
  - Description: Create maestroSearchSource implementing SearchSource interface

- [ ] **T-4.2** Update parseSourceType to handle 'maestro' [T] (depends: T-4.1)
  - File: `src/resona-adapter.ts`
  - Test: `tests/resona-adapter.test.ts`
  - Description: Parse "maestro:{fileId}:{index}" format in sourceId

### Group 5: CLI + Exports

- [ ] **T-5.1** Export new modules from index.ts [T] (depends: T-3.4, T-4.2)
  - File: `src/index.ts`
  - Test: Import test in tests/index.test.ts or verify via bun build
  - Description: Export types, parser, and indexer from main entry point

- [ ] **T-5.2** Create CLI wrapper for maestro commands (depends: T-5.1)
  - File: Document in README.md
  - Description: Document CLI usage: `acr maestro index [--full]`, `acr maestro status`, `acr maestro clear`

## Dependency Graph

```
T-1.1 ──┬──> T-2.1 ──> T-2.2 ──┬──> T-3.2 ──> T-3.3 ──> T-3.4 ──┬──> T-5.1 ──> T-5.2
        │                      │                                 │
        └──> T-3.1 ────────────┘                                 │
                                                                 │
T-1.2 ──────────────────────────────> T-4.1 ──> T-4.2 ───────────┘
```

## Execution Order

1. **Parallel batch 1:** T-1.1, T-1.2
2. **Sequential:** T-2.1 (after T-1.1)
3. **Sequential:** T-2.2 (after T-2.1)
4. **Parallel batch 2:** T-3.1 (after T-1.1), can start alongside T-2.x
5. **Sequential:** T-3.2 (after T-2.2 AND T-3.1)
6. **Sequential:** T-3.3 (after T-3.2)
7. **Sequential:** T-3.4 (after T-3.3)
8. **Sequential:** T-4.1 (after T-1.2 AND T-3.2)
9. **Sequential:** T-4.2 (after T-4.1)
10. **Sequential:** T-5.1 (after T-3.4 AND T-4.2)
11. **Sequential:** T-5.2 (after T-5.1)

## Progress Tracking

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| T-1.1 | pending | - | - | Types + Zod schemas |
| T-1.2 | pending | - | - | SourceType enum |
| T-2.1 | pending | - | - | JSON parser |
| T-2.2 | pending | - | - | Entry filtering |
| T-3.1 | pending | - | - | State management |
| T-3.2 | pending | - | - | Indexing pipeline |
| T-3.3 | pending | - | - | Incremental sync |
| T-3.4 | pending | - | - | Reindex + clear |
| T-4.1 | pending | - | - | SearchSource |
| T-4.2 | pending | - | - | parseSourceType |
| T-5.1 | pending | - | - | Exports |
| T-5.2 | pending | - | - | CLI docs |

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
- [ ] Feature works as specified in acceptance criteria

### Failure Verification (Doctorow Gate)
- [ ] **Failure test:** Maestro history dir missing → returns empty gracefully
- [ ] **Failure test:** Malformed JSON file → skips with warning, continues
- [ ] **Failure test:** Ollama unavailable → queues for later, no crash
- [ ] **Assumption test:** Verified behavior when entry lacks summary field
- [ ] **Rollback test:** Feature can be disabled without breaking Tier 2
- [ ] **Error messages:** Failures produce actionable error messages

### Maintainability Verification
- [ ] **Documentation test:** Someone new could understand why this code exists
- [ ] **Debt recorded:** Added entry to project debt-ledger.md
- [ ] **No orphan code:** All new code is reachable and tested

### Sign-off
- [ ] All verification items checked
- [ ] Debt score calculated and recorded
- Date completed: ___
