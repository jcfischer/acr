/**
 * ACR F-005 - Maestro Indexer Tests
 *
 * TDD RED phase: Tests for indexing Maestro session history.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Import indexer functions (will fail until implemented)
import {
  loadIndexState,
  saveIndexState,
  getMaestroIndexStatus,
  syncMaestroIndex,
  clearMaestroIndex,
  getChangedFiles,
  shouldReindexFile,
} from "../src/maestro-indexer";

import {
  createEmptyIndexState,
  type MaestroIndexState,
  type SyncResult,
  type IndexStatus,
} from "../src/maestro-types";

// Test fixtures
const TEST_DIR = join(tmpdir(), "acr-maestro-indexer-test");
const STATE_FILE = join(TEST_DIR, "state.json");
const HISTORY_DIR = join(TEST_DIR, "history");

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(HISTORY_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  // Clean up state file between tests
  try {
    await rm(STATE_FILE, { force: true });
  } catch {}

  // Clean up history dir contents
  try {
    const files = await Bun.file(HISTORY_DIR).exists();
    await rm(HISTORY_DIR, { recursive: true, force: true });
    await mkdir(HISTORY_DIR, { recursive: true });
  } catch {}
});

describe("loadIndexState", () => {
  test("returns empty state for non-existent file", async () => {
    const state = await loadIndexState(join(TEST_DIR, "nonexistent.json"));

    expect(state.lastSyncTimestamp).toBe(0);
    expect(Object.keys(state.indexedFiles)).toHaveLength(0);
  });

  test("loads valid state from file", async () => {
    const savedState: MaestroIndexState = {
      lastSyncTimestamp: 1706270400000,
      indexedFiles: {
        "session1.json": { lastModified: 1706270300000, entryCount: 10 },
      },
    };
    await writeFile(STATE_FILE, JSON.stringify(savedState));

    const state = await loadIndexState(STATE_FILE);

    expect(state.lastSyncTimestamp).toBe(1706270400000);
    expect(state.indexedFiles["session1.json"].entryCount).toBe(10);
  });

  test("returns empty state for malformed JSON", async () => {
    await writeFile(STATE_FILE, "{ not valid json }");

    const state = await loadIndexState(STATE_FILE);

    expect(state.lastSyncTimestamp).toBe(0);
  });

  test("returns empty state for invalid schema", async () => {
    await writeFile(STATE_FILE, JSON.stringify({ invalid: "schema" }));

    const state = await loadIndexState(STATE_FILE);

    expect(state.lastSyncTimestamp).toBe(0);
  });
});

describe("saveIndexState", () => {
  test("saves state to file", async () => {
    const state: MaestroIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        "test.json": { lastModified: Date.now(), entryCount: 5 },
      },
    };

    await saveIndexState(STATE_FILE, state);

    const content = await readFile(STATE_FILE, "utf-8");
    const loaded = JSON.parse(content);

    expect(loaded.lastSyncTimestamp).toBe(state.lastSyncTimestamp);
    expect(loaded.indexedFiles["test.json"].entryCount).toBe(5);
  });

  test("creates parent directory if needed", async () => {
    const nestedPath = join(TEST_DIR, "nested", "dir", "state.json");
    const state = createEmptyIndexState();

    await saveIndexState(nestedPath, state);

    const content = await readFile(nestedPath, "utf-8");
    expect(content).toBeTruthy();
  });
});

describe("getMaestroIndexStatus", () => {
  test("returns uninitialized status for new state", async () => {
    const status = await getMaestroIndexStatus(STATE_FILE);

    expect(status.initialized).toBe(false);
    expect(status.fileCount).toBe(0);
    expect(status.entryCount).toBe(0);
    expect(status.lastSyncTimestamp).toBe(0);
  });

  test("returns correct status for existing state", async () => {
    const state: MaestroIndexState = {
      lastSyncTimestamp: 1706270400000,
      indexedFiles: {
        "session1.json": { lastModified: 1706270300000, entryCount: 10 },
        "session2.json": { lastModified: 1706270200000, entryCount: 5 },
      },
    };
    await writeFile(STATE_FILE, JSON.stringify(state));

    const status = await getMaestroIndexStatus(STATE_FILE);

    expect(status.initialized).toBe(true);
    expect(status.fileCount).toBe(2);
    expect(status.entryCount).toBe(15);
    expect(status.lastSyncTimestamp).toBe(1706270400000);
  });
});

describe("shouldReindexFile", () => {
  test("returns true for new file", () => {
    const state = createEmptyIndexState();

    const shouldReindex = shouldReindexFile("new-file.json", Date.now(), state);

    expect(shouldReindex).toBe(true);
  });

  test("returns true for modified file", () => {
    const state: MaestroIndexState = {
      lastSyncTimestamp: 1706270400000,
      indexedFiles: {
        "modified.json": { lastModified: 1706270300000, entryCount: 5 },
      },
    };

    // File modified after last indexed
    const shouldReindex = shouldReindexFile("modified.json", 1706270400000, state);

    expect(shouldReindex).toBe(true);
  });

  test("returns false for unchanged file", () => {
    const state: MaestroIndexState = {
      lastSyncTimestamp: 1706270400000,
      indexedFiles: {
        "unchanged.json": { lastModified: 1706270300000, entryCount: 5 },
      },
    };

    // File not modified since last indexed
    const shouldReindex = shouldReindexFile("unchanged.json", 1706270300000, state);

    expect(shouldReindex).toBe(false);
  });
});

describe("getChangedFiles", () => {
  test("identifies new files", async () => {
    const state = createEmptyIndexState();

    await writeFile(
      join(HISTORY_DIR, "new-session.json"),
      JSON.stringify({
        entries: [{ summary: "Test task here", timestamp: Date.now(), type: "USER", success: true }],
      })
    );

    const changed = await getChangedFiles(HISTORY_DIR, state);

    expect(changed).toHaveLength(1);
    expect(changed[0].filename).toBe("new-session.json");
    expect(changed[0].isNew).toBe(true);
  });

  test("identifies modified files", async () => {
    // Create file first
    const filePath = join(HISTORY_DIR, "existing.json");
    await writeFile(
      filePath,
      JSON.stringify({
        entries: [{ summary: "Old task content", timestamp: Date.now(), type: "USER", success: true }],
      })
    );

    // Create state with older mtime
    const state: MaestroIndexState = {
      lastSyncTimestamp: Date.now() - 10000,
      indexedFiles: {
        "existing.json": { lastModified: Date.now() - 10000, entryCount: 1 },
      },
    };

    const changed = await getChangedFiles(HISTORY_DIR, state);

    expect(changed.length).toBeGreaterThanOrEqual(1);
    const existing = changed.find(f => f.filename === "existing.json");
    expect(existing?.isNew).toBe(false);
  });

  test("excludes unchanged files", async () => {
    const now = Date.now();

    await writeFile(
      join(HISTORY_DIR, "unchanged.json"),
      JSON.stringify({
        entries: [{ summary: "Unchanged task", timestamp: now, type: "USER", success: true }],
      })
    );

    // Get the actual mtime of the file we just created
    const file = Bun.file(join(HISTORY_DIR, "unchanged.json"));
    const stats = await file.stat();
    const fileMtime = stats?.mtime?.getTime() || now;

    const state: MaestroIndexState = {
      lastSyncTimestamp: now,
      indexedFiles: {
        "unchanged.json": { lastModified: fileMtime, entryCount: 1 },
      },
    };

    const changed = await getChangedFiles(HISTORY_DIR, state);

    expect(changed.filter(f => f.filename === "unchanged.json")).toHaveLength(0);
  });

  test("returns empty for non-existent directory", async () => {
    const changed = await getChangedFiles(join(TEST_DIR, "nonexistent"), createEmptyIndexState());

    expect(changed).toHaveLength(0);
  });
});

describe("syncMaestroIndex", () => {
  test("syncs new files incrementally", async () => {
    // Create a history file
    await writeFile(
      join(HISTORY_DIR, "session1.json"),
      JSON.stringify({
        entries: [
          { summary: "First task description", timestamp: Date.now(), type: "USER", success: true },
          { summary: "Second task description", timestamp: Date.now(), type: "AUTO", success: false },
        ],
      })
    );

    const result = await syncMaestroIndex(HISTORY_DIR, STATE_FILE);

    expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.filesIndexed).toBeGreaterThanOrEqual(1);
    expect(result.entriesIndexed).toBeGreaterThanOrEqual(2);
    expect(result.fullReindex).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("performs full reindex when requested", async () => {
    // Create initial state
    const state: MaestroIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        "old-session.json": { lastModified: Date.now(), entryCount: 5 },
      },
    };
    await writeFile(STATE_FILE, JSON.stringify(state));

    // Create a new file
    await writeFile(
      join(HISTORY_DIR, "new-session.json"),
      JSON.stringify({
        entries: [{ summary: "New task description", timestamp: Date.now(), type: "USER", success: true }],
      })
    );

    const result = await syncMaestroIndex(HISTORY_DIR, STATE_FILE, { fullReindex: true });

    expect(result.fullReindex).toBe(true);
    expect(result.filesIndexed).toBeGreaterThanOrEqual(1);
  });

  test("updates state file after sync", async () => {
    await writeFile(
      join(HISTORY_DIR, "tracked.json"),
      JSON.stringify({
        entries: [{ summary: "Tracked task item", timestamp: Date.now(), type: "USER", success: true }],
      })
    );

    await syncMaestroIndex(HISTORY_DIR, STATE_FILE);

    const stateContent = await readFile(STATE_FILE, "utf-8");
    const state = JSON.parse(stateContent) as MaestroIndexState;

    expect(state.lastSyncTimestamp).toBeGreaterThan(0);
    expect(state.indexedFiles["tracked.json"]).toBeDefined();
    expect(state.indexedFiles["tracked.json"].entryCount).toBe(1);
  });

  test("returns zero indexed for empty directory", async () => {
    const result = await syncMaestroIndex(HISTORY_DIR, STATE_FILE);

    expect(result.filesProcessed).toBe(0);
    expect(result.entriesIndexed).toBe(0);
  });
});

describe("clearMaestroIndex", () => {
  test("resets state to empty", async () => {
    // Create state with data
    const state: MaestroIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        "session1.json": { lastModified: Date.now(), entryCount: 10 },
      },
    };
    await writeFile(STATE_FILE, JSON.stringify(state));

    await clearMaestroIndex(STATE_FILE);

    const newState = await loadIndexState(STATE_FILE);
    expect(newState.lastSyncTimestamp).toBe(0);
    expect(Object.keys(newState.indexedFiles)).toHaveLength(0);
  });

  test("works even if state file doesn't exist", async () => {
    // Should not throw
    await clearMaestroIndex(join(TEST_DIR, "nonexistent-state.json"));
  });
});
