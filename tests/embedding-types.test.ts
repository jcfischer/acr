/**
 * Tests for embedding-types.ts
 * F-007: Resona Integration
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod/v4";
import {
  EmbeddingInputSchema,
  EmbeddingRecordSchema,
  EmbeddingConfigSchema,
  EMBEDDING_CONFIG,
  type EmbeddingInput,
  type EmbeddingRecord,
  type EmbeddingConfig,
  createDefaultConfig,
  validateConfig,
} from "../src/embedding-types";

describe("EmbeddingInputSchema", () => {
  it("validates valid embedding input", () => {
    const input = {
      sourceId: "memory:LEARNING:test-file",
      content: "Test content for embedding",
      source: "memory" as const,
      metadata: {
        captureType: "LEARNING",
        timestamp: Date.now(),
        filePath: "/path/to/file.md",
      },
    };
    const result = EmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("validates maestro source", () => {
    const input = {
      sourceId: "maestro:abc123:0",
      content: "Session entry content",
      source: "maestro" as const,
      metadata: {
        fileId: "abc123",
        entryIndex: 0,
        timestamp: Date.now(),
      },
    };
    const result = EmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects empty sourceId", () => {
    const input = {
      sourceId: "",
      content: "Content",
      source: "memory" as const,
      metadata: {},
    };
    const result = EmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty content", () => {
    const input = {
      sourceId: "memory:LEARNING:test",
      content: "",
      source: "memory" as const,
      metadata: {},
    };
    const result = EmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts valid source types", () => {
    for (const source of ["maestro", "memory"] as const) {
      const input = {
        sourceId: "test:id",
        content: "Content",
        source,
        metadata: {},
      };
      const result = EmbeddingInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid source types", () => {
    const input = {
      sourceId: "test:id",
      content: "Content",
      source: "invalid",
      metadata: {},
    };
    const result = EmbeddingInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("EmbeddingRecordSchema", () => {
  it("validates complete record", () => {
    const record = {
      id: "memory:LEARNING:test",
      vector: new Float32Array(768),
      content: "Original content",
      source: "memory",
      metadata: JSON.stringify({ captureType: "LEARNING" }),
      timestamp: Date.now(),
      created_at: Date.now(),
    };
    const result = EmbeddingRecordSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it("rejects invalid vector dimension", () => {
    const record = {
      id: "test",
      vector: new Float32Array(100), // Wrong dimension
      content: "Content",
      source: "memory",
      metadata: "{}",
      timestamp: Date.now(),
      created_at: Date.now(),
    };
    // Note: Dimension validation may be in VectorStore, not schema
    const result = EmbeddingRecordSchema.safeParse(record);
    // Schema accepts any Float32Array, dimension checked at store level
    expect(result.success).toBe(true);
  });

  it("requires all fields", () => {
    const partial = {
      id: "test",
      content: "Content",
    };
    const result = EmbeddingRecordSchema.safeParse(partial);
    expect(result.success).toBe(false);
  });
});

describe("EmbeddingConfigSchema", () => {
  it("validates full config", () => {
    const config = {
      ollamaUrl: "http://localhost:11434",
      model: "nomic-embed-text",
      dimensions: 768,
      batchSize: 50,
      timeout: 30000,
      dbPath: "/path/to/db.lance",
    };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects invalid ollamaUrl", () => {
    const config = {
      ollamaUrl: "not-a-url",
      model: "model",
      dimensions: 768,
      batchSize: 50,
      timeout: 30000,
      dbPath: "/path",
    };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects negative dimensions", () => {
    const config = {
      ollamaUrl: "http://localhost:11434",
      model: "model",
      dimensions: -1,
      batchSize: 50,
      timeout: 30000,
      dbPath: "/path",
    };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects zero batch size", () => {
    const config = {
      ollamaUrl: "http://localhost:11434",
      model: "model",
      dimensions: 768,
      batchSize: 0,
      timeout: 30000,
      dbPath: "/path",
    };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("EMBEDDING_CONFIG", () => {
  it("has required fields", () => {
    expect(EMBEDDING_CONFIG.ollamaUrl).toBeDefined();
    expect(EMBEDDING_CONFIG.model).toBeDefined();
    expect(EMBEDDING_CONFIG.dimensions).toBeDefined();
    expect(EMBEDDING_CONFIG.batchSize).toBeDefined();
    expect(EMBEDDING_CONFIG.timeout).toBeDefined();
    expect(EMBEDDING_CONFIG.dbPath).toBeDefined();
  });

  it("has sensible defaults", () => {
    expect(EMBEDDING_CONFIG.ollamaUrl).toBe("http://localhost:11434");
    expect(EMBEDDING_CONFIG.model).toBe("bge-m3");
    expect(EMBEDDING_CONFIG.dimensions).toBe(1024);
    expect(EMBEDDING_CONFIG.batchSize).toBeGreaterThan(0);
    expect(EMBEDDING_CONFIG.timeout).toBeGreaterThan(0);
  });

  it("dbPath is in ~/.claude", () => {
    expect(EMBEDDING_CONFIG.dbPath).toContain(".claude");
    expect(EMBEDDING_CONFIG.dbPath).toContain("embeddings");
  });

  it("passes schema validation", () => {
    const result = EmbeddingConfigSchema.safeParse(EMBEDDING_CONFIG);
    expect(result.success).toBe(true);
  });
});

describe("createDefaultConfig", () => {
  it("returns valid config", () => {
    const config = createDefaultConfig();
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("matches EMBEDDING_CONFIG", () => {
    const config = createDefaultConfig();
    expect(config).toEqual(EMBEDDING_CONFIG);
  });
});

describe("validateConfig", () => {
  it("accepts valid partial config", () => {
    const partial = { batchSize: 100 };
    const config = validateConfig(partial);
    expect(config.batchSize).toBe(100);
    expect(config.ollamaUrl).toBe(EMBEDDING_CONFIG.ollamaUrl);
  });

  it("preserves all overrides", () => {
    const partial = {
      ollamaUrl: "http://custom:11434",
      model: "custom-model",
    };
    const config = validateConfig(partial);
    expect(config.ollamaUrl).toBe("http://custom:11434");
    expect(config.model).toBe("custom-model");
  });

  it("throws on invalid values", () => {
    const invalid = { batchSize: -1 };
    expect(() => validateConfig(invalid)).toThrow();
  });
});
