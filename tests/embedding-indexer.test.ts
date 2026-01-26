/**
 * Tests for embedding-indexer.ts
 * F-007: Resona Integration
 */

import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  indexEmbeddings,
  type IndexingResult,
  type IndexableInput,
} from "../src/embedding-indexer";
import { EmbeddingService } from "../src/embedding-service";
import { VectorStore } from "../src/vector-store";

// Test paths
const TEST_BASE = join(tmpdir(), "acr-embedding-indexer-tests");
let testDbPath: string;
let testCounter = 0;

function getTestPath(): string {
  testCounter++;
  return join(
    TEST_BASE,
    `test-${Date.now()}-${testCounter}-${Math.random().toString(36).slice(2)}`
  );
}

// Mock fetch for embedding service
const originalFetch = globalThis.fetch;

function mockOllamaEmbed() {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify({ embedding: Array(768).fill(0.1) }))
    )
  );
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

describe("indexEmbeddings", () => {
  beforeEach(async () => {
    testDbPath = getTestPath();
    await mkdir(TEST_BASE, { recursive: true });
    mockOllamaEmbed();
  });

  afterEach(async () => {
    restoreFetch();
    try {
      await rm(testDbPath, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe("basic indexing", () => {
    it("indexes inputs and returns result", async () => {
      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const inputs: IndexableInput[] = [
        {
          sourceId: "memory:LEARNING:test1",
          content: "Test content 1",
          source: "memory",
          metadata: { type: "LEARNING" },
          timestamp: Date.now(),
        },
        {
          sourceId: "memory:LEARNING:test2",
          content: "Test content 2",
          source: "memory",
          metadata: { type: "LEARNING" },
          timestamp: Date.now(),
        },
      ];

      const result = await indexEmbeddings(inputs, embeddingService, vectorStore);

      expect(result.processed).toBe(2);
      expect(result.embedded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      const stats = await vectorStore.getTableStats();
      expect(stats.count).toBe(2);
    });

    it("returns empty result for empty input", async () => {
      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const result = await indexEmbeddings([], embeddingService, vectorStore);

      expect(result.processed).toBe(0);
      expect(result.embedded).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe("error handling", () => {
    it("handles partial embedding failures", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("Embedding failed"));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ embedding: Array(768).fill(0.1) }))
        );
      });

      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const inputs: IndexableInput[] = [
        { sourceId: "id1", content: "Content 1", source: "memory", metadata: {}, timestamp: Date.now() },
        { sourceId: "id2", content: "Content 2", source: "memory", metadata: {}, timestamp: Date.now() },
        { sourceId: "id3", content: "Content 3", source: "memory", metadata: {}, timestamp: Date.now() },
      ];

      const result = await indexEmbeddings(inputs, embeddingService, vectorStore);

      expect(result.processed).toBe(3);
      expect(result.embedded).toBe(2);
      expect(result.failed).toBe(1);

      // Only 2 records should be in the store
      const stats = await vectorStore.getTableStats();
      expect(stats.count).toBe(2);
    });

    it("continues after embedding failures", async () => {
      // First call fails, rest succeed
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("First call failed"));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ embedding: Array(768).fill(0.1) }))
        );
      });

      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const inputs: IndexableInput[] = [
        { sourceId: "id1", content: "Content 1", source: "memory", metadata: {}, timestamp: Date.now() },
        { sourceId: "id2", content: "Content 2", source: "memory", metadata: {}, timestamp: Date.now() },
      ];

      const result = await indexEmbeddings(inputs, embeddingService, vectorStore);

      expect(result.failed).toBe(1);
      expect(result.embedded).toBe(1);
    });

    it("handles all embeddings failing", async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(new Error("All calls fail"))
      );

      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const inputs: IndexableInput[] = [
        { sourceId: "id1", content: "Content 1", source: "memory", metadata: {}, timestamp: Date.now() },
        { sourceId: "id2", content: "Content 2", source: "memory", metadata: {}, timestamp: Date.now() },
      ];

      const result = await indexEmbeddings(inputs, embeddingService, vectorStore);

      expect(result.processed).toBe(2);
      expect(result.embedded).toBe(0);
      expect(result.failed).toBe(2);
    });
  });

  describe("batching", () => {
    it("respects batch size", async () => {
      const embeddingService = new EmbeddingService({ batchSize: 2 });
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const inputs: IndexableInput[] = Array.from({ length: 5 }, (_, i) => ({
        sourceId: `id${i}`,
        content: `Content ${i}`,
        source: "memory" as const,
        metadata: {},
        timestamp: Date.now(),
      }));

      const result = await indexEmbeddings(inputs, embeddingService, vectorStore, {
        batchSize: 2,
      });

      expect(result.processed).toBe(5);
      expect(result.embedded).toBe(5);
    });
  });

  describe("progress callback", () => {
    it("calls onProgress for each item", async () => {
      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const progressCalls: number[] = [];

      const inputs: IndexableInput[] = [
        { sourceId: "id1", content: "Content 1", source: "memory", metadata: {}, timestamp: Date.now() },
        { sourceId: "id2", content: "Content 2", source: "memory", metadata: {}, timestamp: Date.now() },
        { sourceId: "id3", content: "Content 3", source: "memory", metadata: {}, timestamp: Date.now() },
      ];

      await indexEmbeddings(inputs, embeddingService, vectorStore, {
        onProgress: (n) => progressCalls.push(n),
      });

      // Should be called for each processed item
      expect(progressCalls.length).toBeGreaterThanOrEqual(1);
      // Last call should report total processed
      expect(progressCalls[progressCalls.length - 1]).toBe(3);
    });
  });

  describe("different sources", () => {
    it("handles maestro source", async () => {
      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const inputs: IndexableInput[] = [
        {
          sourceId: "maestro:abc123:0",
          content: "Session entry content",
          source: "maestro",
          metadata: { fileId: "abc123", entryIndex: 0 },
          timestamp: Date.now(),
        },
      ];

      const result = await indexEmbeddings(inputs, embeddingService, vectorStore);

      expect(result.embedded).toBe(1);

      const stats = await vectorStore.getTableStats();
      expect(stats.sources.maestro).toBe(1);
    });

    it("handles mixed sources", async () => {
      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const inputs: IndexableInput[] = [
        { sourceId: "maestro:a:0", content: "Maestro 1", source: "maestro", metadata: {}, timestamp: Date.now() },
        { sourceId: "memory:L:t", content: "Memory 1", source: "memory", metadata: {}, timestamp: Date.now() },
        { sourceId: "maestro:b:0", content: "Maestro 2", source: "maestro", metadata: {}, timestamp: Date.now() },
      ];

      const result = await indexEmbeddings(inputs, embeddingService, vectorStore);

      expect(result.embedded).toBe(3);

      const stats = await vectorStore.getTableStats();
      expect(stats.sources.maestro).toBe(2);
      expect(stats.sources.memory).toBe(1);
    });
  });

  describe("metadata handling", () => {
    it("preserves metadata in stored records", async () => {
      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(testDbPath);
      await vectorStore.initialize();

      const inputs: IndexableInput[] = [
        {
          sourceId: "test:id",
          content: "Content",
          source: "memory",
          metadata: { custom: "value", nested: { foo: "bar" } },
          timestamp: Date.now(),
        },
      ];

      await indexEmbeddings(inputs, embeddingService, vectorStore);

      const record = await vectorStore.get("test:id");
      expect(record).not.toBeNull();

      const metadata = JSON.parse(record!.metadata);
      expect(metadata.custom).toBe("value");
      expect(metadata.nested.foo).toBe("bar");
    });
  });
});
