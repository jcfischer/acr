/**
 * Tests for memory-indexer.ts
 * F-006 PAI Memory Indexing - Indexer Module
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  loadIndexState,
  saveIndexState,
  detectChanges,
  syncMemoryIndex,
  type MemorySyncResult,
} from "../src/memory-indexer";
import {
  type MemoryIndexState,
  MEMORY_CONFIG,
  createEmptyIndexState,
} from "../src/memory-types";

// ============================================================================
// Test Fixtures
// ============================================================================

let testDir: string;
let stateFile: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "memory-indexer-test-"));
  stateFile = join(testDir, "test-state.json");
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

const VALID_MEMORY_CONTENT = `---
capture_type: LEARNING
timestamp: 2026-01-04 12:14:37
session_id: test-session-123
---

# Test Learning

This is test content for the memory indexer. It needs to be long enough to pass the minimum content filter.`;

// ============================================================================
// loadIndexState Tests
// ============================================================================

describe("loadIndexState", () => {
  test("returns empty state when file doesn't exist", async () => {
    const state = await loadIndexState("/non/existent/path.json");
    expect(state.lastSyncTimestamp).toBe(0);
    expect(state.indexedFiles).toEqual({});
  });

  test("loads valid state file", async () => {
    const validState: MemoryIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        "test.md": { lastModified: Date.now(), captureType: "LEARNING" },
      },
    };
    const path = join(testDir, "valid-state.json");
    await writeFile(path, JSON.stringify(validState));

    const loaded = await loadIndexState(path);
    expect(loaded.lastSyncTimestamp).toBe(validState.lastSyncTimestamp);
    expect(loaded.indexedFiles["test.md"]).toBeDefined();
  });

  test("returns empty state for invalid JSON", async () => {
    const path = join(testDir, "invalid.json");
    await writeFile(path, "not valid json");

    const state = await loadIndexState(path);
    expect(state.lastSyncTimestamp).toBe(0);
    expect(state.indexedFiles).toEqual({});
  });

  test("returns empty state for malformed state", async () => {
    const path = join(testDir, "malformed.json");
    await writeFile(path, JSON.stringify({ wrong: "structure" }));

    const state = await loadIndexState(path);
    expect(state.lastSyncTimestamp).toBe(0);
  });
});

// ============================================================================
// saveIndexState Tests
// ============================================================================

describe("saveIndexState", () => {
  test("saves state to file", async () => {
    const state: MemoryIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        "file.md": { lastModified: 12345, captureType: "DECISION" },
      },
    };
    const path = join(testDir, "save-test.json");

    await saveIndexState(path, state);

    const content = await readFile(path, "utf-8");
    const loaded = JSON.parse(content);
    expect(loaded.lastSyncTimestamp).toBe(state.lastSyncTimestamp);
    expect(loaded.indexedFiles["file.md"].captureType).toBe("DECISION");
  });

  test("creates parent directories if needed", async () => {
    const state = createEmptyIndexState();
    const path = join(testDir, "nested", "deep", "state.json");

    await saveIndexState(path, state);

    const content = await readFile(path, "utf-8");
    expect(JSON.parse(content).lastSyncTimestamp).toBe(0);
  });

  test("overwrites existing file", async () => {
    const path = join(testDir, "overwrite-test.json");
    await writeFile(path, JSON.stringify({ old: "data" }));

    const newState: MemoryIndexState = {
      lastSyncTimestamp: 999,
      indexedFiles: {},
    };
    await saveIndexState(path, newState);

    const content = await readFile(path, "utf-8");
    expect(JSON.parse(content).lastSyncTimestamp).toBe(999);
  });
});

// ============================================================================
// detectChanges Tests
// ============================================================================

describe("detectChanges", () => {
  let changesDir: string;
  let testCounter = 0;

  beforeEach(async () => {
    testCounter++;
    changesDir = join(testDir, `changes-${Date.now()}-${testCounter}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(changesDir, "Learning"), { recursive: true });
  });

  test("detects new files", async () => {
    const filePath = join(changesDir, "Learning", "new-file.md");
    await writeFile(filePath, VALID_MEMORY_CONTENT);

    const state = createEmptyIndexState();
    const changes = await detectChanges(changesDir, ["Learning"], state);

    expect(changes.newFiles.length).toBe(1);
    expect(changes.newFiles[0]).toContain("new-file.md");
    expect(changes.modifiedFiles.length).toBe(0);
    expect(changes.deletedFiles.length).toBe(0);
  });

  test("detects modified files", async () => {
    const filePath = join(changesDir, "Learning", "modified.md");
    await writeFile(filePath, VALID_MEMORY_CONTENT);

    // Create state with old mtime
    const state: MemoryIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        [filePath]: { lastModified: 1000, captureType: "LEARNING" },
      },
    };

    const changes = await detectChanges(changesDir, ["Learning"], state);

    expect(changes.modifiedFiles.length).toBe(1);
    expect(changes.modifiedFiles[0]).toContain("modified.md");
    expect(changes.newFiles.length).toBe(0);
  });

  test("detects deleted files", async () => {
    const filePath = join(changesDir, "Learning", "deleted.md");
    // File doesn't exist but is in state
    const state: MemoryIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        [filePath]: { lastModified: Date.now(), captureType: "LEARNING" },
      },
    };

    const changes = await detectChanges(changesDir, ["Learning"], state);

    expect(changes.deletedFiles.length).toBe(1);
    expect(changes.deletedFiles[0]).toBe(filePath);
  });

  test("handles missing directories gracefully", async () => {
    const state = createEmptyIndexState();
    const changes = await detectChanges(changesDir, ["Learning", "NonExistent"], state);

    // Should not throw, just return empty for missing dirs
    expect(changes.newFiles).toBeDefined();
  });

  test("returns unchanged files correctly", async () => {
    const filePath = join(changesDir, "Learning", "unchanged.md");
    await writeFile(filePath, VALID_MEMORY_CONTENT);

    // Get actual mtime
    const { stat } = await import("fs/promises");
    const stats = await stat(filePath);

    const state: MemoryIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        [filePath]: { lastModified: stats.mtimeMs, captureType: "LEARNING" },
      },
    };

    const changes = await detectChanges(changesDir, ["Learning"], state);

    expect(changes.newFiles.length).toBe(0);
    expect(changes.modifiedFiles.length).toBe(0);
    expect(changes.deletedFiles.length).toBe(0);
  });
});

// ============================================================================
// syncMemoryIndex Tests
// ============================================================================

describe("syncMemoryIndex", () => {
  let syncDir: string;
  let syncStateFile: string;

  beforeEach(async () => {
    syncDir = join(testDir, `sync-${Date.now()}`);
    syncStateFile = join(syncDir, "state.json");
    await mkdir(join(syncDir, "Learning"), { recursive: true });
    await mkdir(join(syncDir, "Decisions"), { recursive: true });
    await mkdir(join(syncDir, "Research"), { recursive: true });
  });

  test("indexes new files", async () => {
    await writeFile(
      join(syncDir, "Learning", "learn1.md"),
      VALID_MEMORY_CONTENT
    );

    const result = await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true, // Don't actually call Resona
    });

    expect(result.filesProcessed).toBe(1);
    expect(result.entriesIndexed).toBe(1);
    expect(result.errors.length).toBe(0);
  });

  test("reports files scanned and processed", async () => {
    await writeFile(join(syncDir, "Learning", "a.md"), VALID_MEMORY_CONTENT);
    await writeFile(join(syncDir, "Learning", "b.md"), VALID_MEMORY_CONTENT);
    await writeFile(join(syncDir, "Decisions", "c.md"), VALID_MEMORY_CONTENT);

    const result = await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning", "Decisions"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    expect(result.filesScanned).toBe(3);
    expect(result.filesProcessed).toBe(3);
  });

  test("handles full reindex option", async () => {
    await writeFile(join(syncDir, "Learning", "file.md"), VALID_MEMORY_CONTENT);

    // First sync
    await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    // Second sync with fullReindex should process again
    const result = await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
      fullReindex: true,
    });

    expect(result.filesProcessed).toBe(1);
  });

  test("skips files below minimum content length", async () => {
    await writeFile(join(syncDir, "Learning", "short.md"), "# Short");

    const result = await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    expect(result.filesScanned).toBe(1);
    expect(result.filesProcessed).toBe(0); // Skipped due to content length
  });

  test("handles empty directories", async () => {
    const result = await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning", "Decisions", "Research"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    expect(result.filesScanned).toBe(0);
    expect(result.filesProcessed).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  test("handles missing base directory gracefully", async () => {
    const result = await syncMemoryIndex({
      baseDir: "/non/existent/path",
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    expect(result.filesScanned).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  test("persists state after sync", async () => {
    await writeFile(join(syncDir, "Learning", "persist.md"), VALID_MEMORY_CONTENT);

    await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    const stateContent = await readFile(syncStateFile, "utf-8");
    const state = JSON.parse(stateContent);
    expect(state.lastSyncTimestamp).toBeGreaterThan(0);
    expect(Object.keys(state.indexedFiles).length).toBe(1);
  });

  test("incremental sync only processes changed files", async () => {
    await writeFile(join(syncDir, "Learning", "existing.md"), VALID_MEMORY_CONTENT);

    // First sync
    await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    // Add new file
    await writeFile(join(syncDir, "Learning", "new.md"), VALID_MEMORY_CONTENT);

    // Second sync should only process new file
    const result = await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    expect(result.filesScanned).toBe(2);
    expect(result.filesProcessed).toBe(1); // Only the new file
  });

  test("returns timing information", async () => {
    await writeFile(join(syncDir, "Learning", "timed.md"), VALID_MEMORY_CONTENT);

    const result = await syncMemoryIndex({
      baseDir: syncDir,
      directories: ["Learning"],
      stateFile: syncStateFile,
      minContentLength: 50,
      batchSize: 10,
      fileExtensions: [".md"],
      dryRun: true,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Integration with MEMORY_CONFIG Tests
// ============================================================================

describe("MEMORY_CONFIG integration", () => {
  test("config has required fields for indexer", () => {
    expect(MEMORY_CONFIG.baseDir).toBeDefined();
    expect(MEMORY_CONFIG.directories).toContain("Learning");
    expect(MEMORY_CONFIG.directories).toContain("Decisions");
    expect(MEMORY_CONFIG.directories).toContain("Research");
    expect(MEMORY_CONFIG.stateFile).toBeDefined();
    expect(MEMORY_CONFIG.minContentLength).toBeGreaterThan(0);
    expect(MEMORY_CONFIG.batchSize).toBeGreaterThan(0);
  });
});
