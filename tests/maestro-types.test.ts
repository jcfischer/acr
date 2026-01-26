/**
 * ACR F-005 - Maestro Types Tests
 *
 * TDD RED phase: Tests for Maestro type definitions and Zod schemas.
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// Import types and schemas (will fail until implemented)
import {
  MaestroEntrySchema,
  MaestroHistoryFileSchema,
  MaestroEmbeddingInputSchema,
  MaestroIndexStateSchema,
  type MaestroEntry,
  type MaestroHistoryFile,
  type MaestroEmbeddingInput,
  type MaestroIndexState,
  createEmptyIndexState,
  createEmbeddingInput,
  generateSourceId,
  MAESTRO_CONFIG,
} from "../src/maestro-types";

describe("MaestroEntrySchema", () => {
  test("validates a valid entry", () => {
    const entry = {
      summary: "Refactored API endpoints",
      timestamp: 1706270400000,
      type: "USER",
      success: true,
    };
    const result = MaestroEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  test("validates AUTO type", () => {
    const entry = {
      summary: "Auto-run task completed",
      timestamp: 1706270400000,
      type: "AUTO",
      success: false,
    };
    const result = MaestroEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  test("rejects invalid type", () => {
    const entry = {
      summary: "Task",
      timestamp: 1706270400000,
      type: "INVALID",
      success: true,
    };
    const result = MaestroEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  test("rejects missing summary", () => {
    const entry = {
      timestamp: 1706270400000,
      type: "USER",
      success: true,
    };
    const result = MaestroEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  test("rejects non-number timestamp", () => {
    const entry = {
      summary: "Task",
      timestamp: "2024-01-26",
      type: "USER",
      success: true,
    };
    const result = MaestroEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });
});

describe("MaestroHistoryFileSchema", () => {
  test("validates a valid history file", () => {
    const file = {
      entries: [
        { summary: "Task 1", timestamp: 1706270400000, type: "USER", success: true },
        { summary: "Task 2", timestamp: 1706270500000, type: "AUTO", success: false },
      ],
    };
    const result = MaestroHistoryFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  test("validates empty entries array", () => {
    const file = { entries: [] };
    const result = MaestroHistoryFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  test("rejects missing entries", () => {
    const file = {};
    const result = MaestroHistoryFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });
});

describe("MaestroEmbeddingInputSchema", () => {
  test("validates a valid embedding input", () => {
    const input = {
      content: "Refactored API endpoints",
      source: "maestro" as const,
      sourceId: "maestro:abc123:0",
      sessionFile: "abc123-def456.json",
      timestamp: new Date("2024-01-26T10:00:00Z"),
      entryType: "USER" as const,
      success: true,
    };
    const result = MaestroEmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("validates with optional workingDirectory", () => {
    const input = {
      content: "Refactored API endpoints",
      source: "maestro" as const,
      sourceId: "maestro:abc123:0",
      sessionFile: "abc123-def456.json",
      timestamp: new Date("2024-01-26T10:00:00Z"),
      entryType: "AUTO" as const,
      success: false,
      workingDirectory: "/Users/test/project",
    };
    const result = MaestroEmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workingDirectory).toBe("/Users/test/project");
    }
  });

  test("rejects invalid source", () => {
    const input = {
      content: "Test",
      source: "other",
      sourceId: "maestro:abc123:0",
      sessionFile: "abc123.json",
      timestamp: new Date(),
      entryType: "USER",
      success: true,
    };
    const result = MaestroEmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("MaestroIndexStateSchema", () => {
  test("validates a valid index state", () => {
    const state = {
      lastSyncTimestamp: 1706270400000,
      indexedFiles: {
        "abc123.json": { lastModified: 1706270300000, entryCount: 15 },
        "def456.json": { lastModified: 1706270200000, entryCount: 8 },
      },
    };
    const result = MaestroIndexStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  test("validates empty indexed files", () => {
    const state = {
      lastSyncTimestamp: 0,
      indexedFiles: {},
    };
    const result = MaestroIndexStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  test("rejects negative timestamp", () => {
    const state = {
      lastSyncTimestamp: -1,
      indexedFiles: {},
    };
    const result = MaestroIndexStateSchema.safeParse(state);
    expect(result.success).toBe(false);
  });
});

describe("createEmptyIndexState", () => {
  test("returns valid empty state", () => {
    const state = createEmptyIndexState();
    expect(state.lastSyncTimestamp).toBe(0);
    expect(state.indexedFiles).toEqual({});

    // Should be valid according to schema
    const result = MaestroIndexStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });
});

describe("generateSourceId", () => {
  test("generates correct format", () => {
    const sourceId = generateSourceId("abc123-def456.json", 5);
    expect(sourceId).toBe("maestro:abc123-def456:5");
  });

  test("handles UUIDs with hyphens", () => {
    const sourceId = generateSourceId("5c538d0e-ef49-4a99-ba42-715d8327c8d3.json", 10);
    expect(sourceId).toBe("maestro:5c538d0e-ef49-4a99-ba42-715d8327c8d3:10");
  });

  test("handles zero index", () => {
    const sourceId = generateSourceId("file.json", 0);
    expect(sourceId).toBe("maestro:file:0");
  });
});

describe("createEmbeddingInput", () => {
  test("creates valid embedding input from entry", () => {
    const entry: MaestroEntry = {
      summary: "Refactored API endpoints",
      timestamp: 1706270400000,
      type: "USER",
      success: true,
    };
    const sessionFile = "abc123.json";
    const index = 3;

    const input = createEmbeddingInput(entry, sessionFile, index);

    expect(input.content).toBe("Refactored API endpoints");
    expect(input.source).toBe("maestro");
    expect(input.sourceId).toBe("maestro:abc123:3");
    expect(input.sessionFile).toBe("abc123.json");
    expect(input.timestamp.getTime()).toBe(1706270400000);
    expect(input.entryType).toBe("USER");
    expect(input.success).toBe(true);
    expect(input.workingDirectory).toBeUndefined();

    // Validate with schema
    const result = MaestroEmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("creates input with workingDirectory", () => {
    const entry: MaestroEntry = {
      summary: "Task",
      timestamp: 1706270400000,
      type: "AUTO",
      success: false,
    };
    const input = createEmbeddingInput(entry, "file.json", 0, "/path/to/project");

    expect(input.workingDirectory).toBe("/path/to/project");
  });
});

describe("MAESTRO_CONFIG", () => {
  test("has default history directory", () => {
    expect(MAESTRO_CONFIG.historyDir).toContain("maestro/history");
  });

  test("has default state file path", () => {
    expect(MAESTRO_CONFIG.stateFile).toContain("acr/maestro-index-state.json");
  });

  test("has minimum summary length", () => {
    expect(MAESTRO_CONFIG.minSummaryLength).toBe(10);
  });

  test("has batch size", () => {
    expect(MAESTRO_CONFIG.batchSize).toBe(100);
  });

  test("has minimum similarity threshold", () => {
    expect(MAESTRO_CONFIG.minSimilarity).toBeGreaterThanOrEqual(0);
    expect(MAESTRO_CONFIG.minSimilarity).toBeLessThanOrEqual(1);
  });
});
