/**
 * Tests for vector-store.ts
 * F-007: Resona Integration
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  VectorStore,
  type SearchResult,
  type EmbeddingStoreRecord,
} from "../src/vector-store";

// Use temp directory for test databases
const TEST_DB_BASE = join(tmpdir(), "acr-vector-store-tests");

let testDbPath: string;
let testCounter = 0;

function getTestDbPath(): string {
  testCounter++;
  return join(
    TEST_DB_BASE,
    `test-${Date.now()}-${testCounter}-${Math.random().toString(36).slice(2)}`
  );
}

describe("VectorStore", () => {
  beforeEach(async () => {
    testDbPath = getTestDbPath();
    await mkdir(TEST_DB_BASE, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDbPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("constructor and initialization", () => {
    it("creates database directory if not exists", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      // Should not throw
      expect(store).toBeDefined();
    });

    it("can be initialized multiple times safely", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();
      await store.initialize(); // Second call should be safe

      expect(store).toBeDefined();
    });

    it("initializes with empty stats", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const stats = await store.getTableStats();
      expect(stats.count).toBe(0);
      expect(stats.sources).toEqual({});
    });
  });

  describe("getTableStats", () => {
    it("returns count and source breakdown", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      // Add some records
      await store.upsert([
        createTestRecord("id1", "maestro"),
        createTestRecord("id2", "maestro"),
        createTestRecord("id3", "memory"),
      ]);

      const stats = await store.getTableStats();
      expect(stats.count).toBe(3);
      expect(stats.sources.maestro).toBe(2);
      expect(stats.sources.memory).toBe(1);
    });
  });

  describe("upsert", () => {
    it("inserts new records", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const count = await store.upsert([
        createTestRecord("id1", "maestro"),
        createTestRecord("id2", "memory"),
      ]);

      expect(count).toBe(2);
      const stats = await store.getTableStats();
      expect(stats.count).toBe(2);
    });

    it("updates existing records with same id", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      // Insert initial record
      await store.upsert([createTestRecord("id1", "maestro", "old content")]);

      // Upsert with same id but new content
      await store.upsert([createTestRecord("id1", "maestro", "new content")]);

      const stats = await store.getTableStats();
      expect(stats.count).toBe(1); // Still only one record

      const record = await store.get("id1");
      expect(record?.content).toBe("new content");
    });

    it("handles empty array", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const count = await store.upsert([]);
      expect(count).toBe(0);
    });

    it("handles batch of records", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const records = Array.from({ length: 100 }, (_, i) =>
        createTestRecord(`id${i}`, i % 2 === 0 ? "maestro" : "memory")
      );

      const count = await store.upsert(records);
      expect(count).toBe(100);

      const stats = await store.getTableStats();
      expect(stats.count).toBe(100);
      expect(stats.sources.maestro).toBe(50);
      expect(stats.sources.memory).toBe(50);
    });
  });

  describe("delete", () => {
    it("deletes records by source ID", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      await store.upsert([
        createTestRecord("id1", "maestro"),
        createTestRecord("id2", "maestro"),
        createTestRecord("id3", "memory"),
      ]);

      const deleted = await store.delete(["id1", "id2"]);
      expect(deleted).toBe(2);

      const stats = await store.getTableStats();
      expect(stats.count).toBe(1);
    });

    it("returns 0 for non-existent IDs", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const deleted = await store.delete(["nonexistent"]);
      expect(deleted).toBe(0);
    });

    it("handles empty array", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const deleted = await store.delete([]);
      expect(deleted).toBe(0);
    });
  });

  describe("deleteBySource", () => {
    it("deletes all records of a source type", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      await store.upsert([
        createTestRecord("id1", "maestro"),
        createTestRecord("id2", "maestro"),
        createTestRecord("id3", "memory"),
      ]);

      const deleted = await store.deleteBySource("maestro");
      expect(deleted).toBe(2);

      const stats = await store.getTableStats();
      expect(stats.count).toBe(1);
      expect(stats.sources.memory).toBe(1);
      expect(stats.sources.maestro).toBeUndefined();
    });
  });

  describe("get", () => {
    it("returns record by ID", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      await store.upsert([createTestRecord("id1", "maestro", "test content")]);

      const record = await store.get("id1");
      expect(record).not.toBeNull();
      expect(record?.id).toBe("id1");
      expect(record?.content).toBe("test content");
      expect(record?.source).toBe("maestro");
    });

    it("returns null for non-existent ID", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const record = await store.get("nonexistent");
      expect(record).toBeNull();
    });
  });

  describe("search", () => {
    it("returns results sorted by similarity", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      // Create records with different vectors
      const vec1 = createVector(0.9); // High values
      const vec2 = createVector(0.5); // Medium values
      const vec3 = createVector(0.1); // Low values

      await store.upsert([
        createTestRecordWithVector("id1", "maestro", "high", vec1),
        createTestRecordWithVector("id2", "maestro", "medium", vec2),
        createTestRecordWithVector("id3", "maestro", "low", vec3),
      ]);

      // Search with high-value query vector
      const queryVector = createVector(0.9);
      const results = await store.search(queryVector, 3);

      expect(results).toHaveLength(3);
      // First result should be most similar to query
      expect(results[0].id).toBe("id1");
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
      expect(results[1].similarity).toBeGreaterThan(results[2].similarity);
    });

    it("respects limit parameter", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      await store.upsert([
        createTestRecord("id1", "maestro"),
        createTestRecord("id2", "maestro"),
        createTestRecord("id3", "maestro"),
      ]);

      const queryVector = createVector(0.5);
      const results = await store.search(queryVector, 2);

      expect(results).toHaveLength(2);
    });

    it("filters by source", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      await store.upsert([
        createTestRecord("id1", "maestro"),
        createTestRecord("id2", "maestro"),
        createTestRecord("id3", "memory"),
      ]);

      const queryVector = createVector(0.5);
      const results = await store.search(queryVector, 10, {
        source: "memory",
      });

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe("memory");
    });

    it("filters by minimum timestamp", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const now = Date.now();
      const oldTimestamp = now - 100000;
      const newTimestamp = now;

      await store.upsert([
        createTestRecordWithTimestamp("id1", "maestro", oldTimestamp),
        createTestRecordWithTimestamp("id2", "maestro", newTimestamp),
      ]);

      const queryVector = createVector(0.5);
      const results = await store.search(queryVector, 10, {
        minTimestamp: now - 50000,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("id2");
    });

    it("returns similarity scores in 0-1 range", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      await store.upsert([createTestRecord("id1", "maestro")]);

      const queryVector = createVector(0.5);
      const results = await store.search(queryVector, 1);

      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBeGreaterThanOrEqual(0);
      expect(results[0].similarity).toBeLessThanOrEqual(1);
    });

    it("returns empty array for empty database", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const queryVector = createVector(0.5);
      const results = await store.search(queryVector, 10);

      expect(results).toEqual([]);
    });

    it("parses metadata from JSON", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      const metadata = { foo: "bar", nested: { value: 123 } };
      await store.upsert([
        {
          id: "id1",
          vector: createVector(0.5),
          content: "content",
          source: "maestro",
          metadata: JSON.stringify(metadata),
          timestamp: Date.now(),
          created_at: Date.now(),
        },
      ]);

      const queryVector = createVector(0.5);
      const results = await store.search(queryVector, 1);

      expect(results[0].metadata).toEqual(metadata);
    });
  });

  describe("close", () => {
    it("closes database connection", async () => {
      const store = new VectorStore(testDbPath);
      await store.initialize();

      await store.close();
      // Should not throw
      expect(true).toBe(true);
    });
  });
});

// Helper functions for creating test data

function createVector(fillValue: number): Float32Array {
  const arr = new Float32Array(768);
  arr.fill(fillValue);
  // Add some variation
  for (let i = 0; i < arr.length; i++) {
    arr[i] += (Math.random() - 0.5) * 0.1;
  }
  return arr;
}

function createTestRecord(
  id: string,
  source: "maestro" | "memory",
  content = "test content"
): EmbeddingStoreRecord {
  return {
    id,
    vector: createVector(0.5),
    content,
    source,
    metadata: JSON.stringify({}),
    timestamp: Date.now(),
    created_at: Date.now(),
  };
}

function createTestRecordWithVector(
  id: string,
  source: "maestro" | "memory",
  content: string,
  vector: Float32Array
): EmbeddingStoreRecord {
  return {
    id,
    vector,
    content,
    source,
    metadata: JSON.stringify({}),
    timestamp: Date.now(),
    created_at: Date.now(),
  };
}

function createTestRecordWithTimestamp(
  id: string,
  source: "maestro" | "memory",
  timestamp: number
): EmbeddingStoreRecord {
  return {
    id,
    vector: createVector(0.5),
    content: "test content",
    source,
    metadata: JSON.stringify({}),
    timestamp,
    created_at: Date.now(),
  };
}
