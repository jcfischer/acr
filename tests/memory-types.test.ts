/**
 * Tests for memory-types.ts
 * F-006 PAI Memory Indexing - Type Definitions
 */

import { describe, expect, test } from "bun:test";
import {
  MemoryCaptureTypeSchema,
  MemoryEntrySchema,
  MemoryEmbeddingInputSchema,
  MemoryFileStateSchema,
  MemoryIndexStateSchema,
  MEMORY_CONFIG,
  generateSourceId,
  parseSourceId,
  createEmptyIndexState,
  captureTypeFromPath,
  type MemoryCaptureType,
  type MemoryEntry,
  type MemoryEmbeddingInput,
  type MemoryIndexState,
} from "../src/memory-types";

// ============================================================================
// MemoryCaptureTypeSchema Tests
// ============================================================================

describe("MemoryCaptureTypeSchema", () => {
  test("validates LEARNING", () => {
    expect(MemoryCaptureTypeSchema.parse("LEARNING")).toBe("LEARNING");
  });

  test("validates DECISION", () => {
    expect(MemoryCaptureTypeSchema.parse("DECISION")).toBe("DECISION");
  });

  test("validates RESEARCH", () => {
    expect(MemoryCaptureTypeSchema.parse("RESEARCH")).toBe("RESEARCH");
  });

  test("rejects invalid capture type", () => {
    expect(() => MemoryCaptureTypeSchema.parse("INVALID")).toThrow();
  });

  test("rejects lowercase", () => {
    expect(() => MemoryCaptureTypeSchema.parse("learning")).toThrow();
  });
});

// ============================================================================
// MemoryEntrySchema Tests
// ============================================================================

describe("MemoryEntrySchema", () => {
  const validEntry: MemoryEntry = {
    filePath: "/path/to/file.md",
    captureType: "LEARNING",
    timestamp: Date.now(),
    title: "Test Learning",
    content: "This is test content",
  };

  test("validates valid entry", () => {
    const result = MemoryEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  test("validates entry with optional sessionId", () => {
    const entry = { ...validEntry, sessionId: "abc-123" };
    const result = MemoryEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionId).toBe("abc-123");
    }
  });

  test("validates entry without sessionId", () => {
    const result = MemoryEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionId).toBeUndefined();
    }
  });

  test("rejects entry without filePath", () => {
    const { filePath, ...noPath } = validEntry;
    expect(() => MemoryEntrySchema.parse(noPath)).toThrow();
  });

  test("rejects entry without captureType", () => {
    const { captureType, ...noType } = validEntry;
    expect(() => MemoryEntrySchema.parse(noType)).toThrow();
  });

  test("rejects entry with invalid captureType", () => {
    const entry = { ...validEntry, captureType: "INVALID" };
    expect(() => MemoryEntrySchema.parse(entry)).toThrow();
  });
});

// ============================================================================
// MemoryEmbeddingInputSchema Tests
// ============================================================================

describe("MemoryEmbeddingInputSchema", () => {
  const validInput: MemoryEmbeddingInput = {
    sourceId: "memory:LEARNING:test-file",
    content: "Content for embedding",
    metadata: {
      captureType: "LEARNING",
      timestamp: Date.now(),
      filePath: "/path/to/file.md",
    },
  };

  test("validates valid embedding input", () => {
    const result = MemoryEmbeddingInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test("rejects input without sourceId", () => {
    const { sourceId, ...noId } = validInput;
    expect(() => MemoryEmbeddingInputSchema.parse(noId)).toThrow();
  });

  test("rejects input without metadata", () => {
    const { metadata, ...noMeta } = validInput;
    expect(() => MemoryEmbeddingInputSchema.parse(noMeta)).toThrow();
  });
});

// ============================================================================
// MemoryFileStateSchema Tests
// ============================================================================

describe("MemoryFileStateSchema", () => {
  test("validates valid file state", () => {
    const state = { lastModified: Date.now(), captureType: "LEARNING" };
    const result = MemoryFileStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  test("rejects state without lastModified", () => {
    const state = { captureType: "LEARNING" };
    expect(() => MemoryFileStateSchema.parse(state)).toThrow();
  });
});

// ============================================================================
// MemoryIndexStateSchema Tests
// ============================================================================

describe("MemoryIndexStateSchema", () => {
  test("validates valid index state", () => {
    const state: MemoryIndexState = {
      lastSyncTimestamp: Date.now(),
      indexedFiles: {
        "file1.md": { lastModified: Date.now(), captureType: "LEARNING" },
      },
    };
    const result = MemoryIndexStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  test("validates empty indexed files", () => {
    const state = { lastSyncTimestamp: 0, indexedFiles: {} };
    const result = MemoryIndexStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// MEMORY_CONFIG Tests
// ============================================================================

describe("MEMORY_CONFIG", () => {
  test("has baseDir", () => {
    expect(MEMORY_CONFIG.baseDir).toContain(".claude/MEMORY");
  });

  test("has directories array", () => {
    expect(MEMORY_CONFIG.directories).toContain("Learning");
    expect(MEMORY_CONFIG.directories).toContain("Decisions");
    expect(MEMORY_CONFIG.directories).toContain("Research");
  });

  test("has stateFile path", () => {
    expect(MEMORY_CONFIG.stateFile).toContain("memory-index-state.json");
  });

  test("has minContentLength", () => {
    expect(MEMORY_CONFIG.minContentLength).toBeGreaterThan(0);
  });

  test("has batchSize", () => {
    expect(MEMORY_CONFIG.batchSize).toBeGreaterThan(0);
  });

  test("has fileExtensions", () => {
    expect(MEMORY_CONFIG.fileExtensions).toContain(".md");
  });
});

// ============================================================================
// generateSourceId Tests
// ============================================================================

describe("generateSourceId", () => {
  test("generates correct format for LEARNING", () => {
    const id = generateSourceId("LEARNING", "test-file.md");
    expect(id).toBe("memory:LEARNING:test-file");
  });

  test("generates correct format for DECISION", () => {
    const id = generateSourceId("DECISION", "my-decision.md");
    expect(id).toBe("memory:DECISION:my-decision");
  });

  test("generates correct format for RESEARCH", () => {
    const id = generateSourceId("RESEARCH", "research-topic.md");
    expect(id).toBe("memory:RESEARCH:research-topic");
  });

  test("strips .md extension", () => {
    const id = generateSourceId("LEARNING", "file-with-ext.md");
    expect(id).not.toContain(".md");
  });

  test("handles filename without extension", () => {
    const id = generateSourceId("LEARNING", "no-extension");
    expect(id).toBe("memory:LEARNING:no-extension");
  });
});

// ============================================================================
// parseSourceId Tests
// ============================================================================

describe("parseSourceId", () => {
  test("parses LEARNING source ID", () => {
    const result = parseSourceId("memory:LEARNING:test-file");
    expect(result).toEqual({ captureType: "LEARNING", filename: "test-file" });
  });

  test("parses DECISION source ID", () => {
    const result = parseSourceId("memory:DECISION:my-decision");
    expect(result).toEqual({ captureType: "DECISION", filename: "my-decision" });
  });

  test("parses RESEARCH source ID", () => {
    const result = parseSourceId("memory:RESEARCH:research-topic");
    expect(result).toEqual({ captureType: "RESEARCH", filename: "research-topic" });
  });

  test("returns null for invalid prefix", () => {
    const result = parseSourceId("invalid:LEARNING:file");
    expect(result).toBeNull();
  });

  test("returns null for missing parts", () => {
    const result = parseSourceId("memory:LEARNING");
    expect(result).toBeNull();
  });

  test("handles filename with colons", () => {
    const result = parseSourceId("memory:LEARNING:file:with:colons");
    expect(result?.filename).toBe("file:with:colons");
  });
});

// ============================================================================
// createEmptyIndexState Tests
// ============================================================================

describe("createEmptyIndexState", () => {
  test("returns state with zero timestamp", () => {
    const state = createEmptyIndexState();
    expect(state.lastSyncTimestamp).toBe(0);
  });

  test("returns state with empty indexedFiles", () => {
    const state = createEmptyIndexState();
    expect(state.indexedFiles).toEqual({});
  });

  test("returns valid schema", () => {
    const state = createEmptyIndexState();
    const result = MemoryIndexStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// captureTypeFromPath Tests
// ============================================================================

describe("captureTypeFromPath", () => {
  test("detects LEARNING from Learning directory", () => {
    const type = captureTypeFromPath("/path/to/Learning/2026-01/file.md");
    expect(type).toBe("LEARNING");
  });

  test("detects DECISION from Decisions directory", () => {
    const type = captureTypeFromPath("/path/to/Decisions/2026-01/file.md");
    expect(type).toBe("DECISION");
  });

  test("detects RESEARCH from Research directory", () => {
    const type = captureTypeFromPath("/path/to/Research/2026-01/file.md");
    expect(type).toBe("RESEARCH");
  });

  test("is case-insensitive", () => {
    expect(captureTypeFromPath("/path/learning/file.md")).toBe("LEARNING");
    expect(captureTypeFromPath("/path/LEARNING/file.md")).toBe("LEARNING");
  });

  test("returns null for unknown directory", () => {
    const type = captureTypeFromPath("/path/to/Unknown/file.md");
    expect(type).toBeNull();
  });

  test("handles nested paths correctly", () => {
    const type = captureTypeFromPath("/Users/test/.claude/MEMORY/Learning/2026-01/file.md");
    expect(type).toBe("LEARNING");
  });
});
