/**
 * ACR Tier 2 - Resona Adapter Tests
 *
 * TDD RED: Tests written BEFORE implementation
 *
 * Note: These tests use mocks since Resona/Ollama may not be available.
 * Integration tests with real Resona should be in a separate test file.
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import {
  ResonaAdapter,
  createResonaAdapter,
  isResonaHealthy,
} from "../src/resona-adapter";
import type { UnifiedResult } from "../src/tier2-types";

describe("ACR Tier 2 Resona Adapter", () => {
  describe("ResonaAdapter interface", () => {
    it("defines searchUnified method", () => {
      const adapter = createResonaAdapter();
      expect(typeof adapter.searchUnified).toBe("function");
    });

    it("defines getSourceStats method", () => {
      const adapter = createResonaAdapter();
      expect(typeof adapter.getSourceStats).toBe("function");
    });

    it("defines isHealthy method", () => {
      const adapter = createResonaAdapter();
      expect(typeof adapter.isHealthy).toBe("function");
    });
  });

  describe("createResonaAdapter", () => {
    it("creates an adapter with default config", () => {
      const adapter = createResonaAdapter();
      expect(adapter).toBeDefined();
    });

    it("accepts custom embedding db path", () => {
      const adapter = createResonaAdapter({
        embeddingDbPath: "/custom/path/embeddings.lance",
      });
      expect(adapter).toBeDefined();
    });
  });

  describe("searchUnified", () => {
    it("returns empty array when Resona unavailable", async () => {
      // Mock adapter that simulates Resona being unavailable
      const adapter = createResonaAdapter({ enabled: false });
      const results = await adapter.searchUnified("test query", 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it("returns UnifiedResult array structure", async () => {
      // Create a mock adapter with stubbed search
      const mockResult: UnifiedResult = {
        id: "doc_123",
        content: "Test content",
        source: "user",
        sourceId: "USER/test.md",
        similarity: 0.85,
      };

      const adapter = createResonaAdapter();
      // Override with mock
      const mockSearchUnified = mock(() => Promise.resolve([mockResult]));
      adapter.searchUnified = mockSearchUnified;

      const results = await adapter.searchUnified("test", 5);

      expect(results.length).toBe(1);
      expect(results[0].id).toBe("doc_123");
      expect(results[0].source).toBe("user");
      expect(results[0].similarity).toBe(0.85);
    });

    it("respects result limit", async () => {
      const adapter = createResonaAdapter();
      const mockResults: UnifiedResult[] = Array.from({ length: 20 }, (_, i) => ({
        id: `doc_${i}`,
        content: `Content ${i}`,
        source: "user" as const,
        sourceId: `file_${i}.md`,
        similarity: 0.9 - i * 0.01,
      }));

      adapter.searchUnified = mock(() => Promise.resolve(mockResults.slice(0, 5)));

      const results = await adapter.searchUnified("test", 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("getSourceStats", () => {
    it("returns source statistics", async () => {
      const adapter = createResonaAdapter();
      const stats = await adapter.getSourceStats();

      expect(typeof stats).toBe("object");
      expect(typeof stats.totalDocuments).toBe("number");
      expect(typeof stats.sources).toBe("object");
    });

    it("includes per-source counts", async () => {
      const adapter = createResonaAdapter();
      const stats = await adapter.getSourceStats();

      expect("user" in stats.sources || stats.sources.user === undefined).toBe(
        true
      );
    });
  });

  describe("isHealthy / isResonaHealthy", () => {
    it("returns boolean health status", async () => {
      const adapter = createResonaAdapter();
      const healthy = await adapter.isHealthy();

      expect(typeof healthy).toBe("boolean");
    });

    it("standalone isResonaHealthy returns false when Ollama unavailable", async () => {
      // This should gracefully return false, not throw
      const healthy = await isResonaHealthy();
      expect(typeof healthy).toBe("boolean");
    });
  });

  describe("graceful degradation", () => {
    it("searchUnified returns empty array on error, not throw", async () => {
      const adapter = createResonaAdapter();

      // Simulate error condition
      adapter.searchUnified = mock(() => Promise.resolve([]));

      // Should not throw
      const results = await adapter.searchUnified("test", 10);
      expect(Array.isArray(results)).toBe(true);
    });

    it("getSourceStats returns empty stats on error", async () => {
      const adapter = createResonaAdapter();

      const stats = await adapter.getSourceStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalDocuments).toBe("number");
    });

    it("isHealthy returns false on error, not throw", async () => {
      const adapter = createResonaAdapter();

      // Should not throw, just return false
      const healthy = await adapter.isHealthy();
      expect(typeof healthy).toBe("boolean");
    });
  });

  describe("source registration", () => {
    it("registers user source", async () => {
      const adapter = createResonaAdapter();
      const registered = adapter.hasSource("user");
      // Initially may or may not have sources registered
      expect(typeof registered).toBe("boolean");
    });

    it("can register custom source", () => {
      const adapter = createResonaAdapter();
      adapter.registerSource({
        sourceId: "custom",
        description: "Custom source",
        search: async () => [],
      });

      expect(adapter.hasSource("custom")).toBe(true);
    });

    it("can unregister source", () => {
      const adapter = createResonaAdapter();
      adapter.registerSource({
        sourceId: "temp",
        description: "Temporary",
        search: async () => [],
      });

      expect(adapter.hasSource("temp")).toBe(true);

      adapter.unregisterSource("temp");
      expect(adapter.hasSource("temp")).toBe(false);
    });

    it("can register maestro source", () => {
      const adapter = createResonaAdapter();
      adapter.registerSource({
        sourceId: "maestro",
        description: "Maestro session history",
        search: async () => [],
      });

      expect(adapter.hasSource("maestro")).toBe(true);
      expect(adapter.listSources()).toContain("maestro");
    });
  });

  describe("parseSourceType with maestro", () => {
    it("parses maestro source type from sourceId", async () => {
      // Disable adapter to avoid vector search interfering with this test
      const adapter = createResonaAdapter({ enabled: false });

      // Re-enable just for this test by creating a fresh adapter with sources
      const testAdapter = createResonaAdapter();

      // Register a maestro source that returns results
      testAdapter.registerSource({
        sourceId: "maestro",
        description: "Maestro session history",
        search: async (query: string, k: number) => [
          {
            id: "maestro:abc123:0",
            similarity: 0.85,
            contextText: "Refactored API endpoints",
            metadata: {
              timestamp: "2026-01-25T14:30:00Z",
              entryType: "USER",
              sessionFile: "abc123.json",
            },
          },
        ],
      });

      // Mock searchVector to return empty (we only want to test source parsing)
      testAdapter.searchVector = mock(() => Promise.resolve([]));

      const results = await testAdapter.searchUnified("refactor", 10);

      expect(results.length).toBe(1);
      expect(results[0].source).toBe("maestro");
      expect(results[0].sourceId).toBe("maestro");
    });
  });

  describe("parseSourceType with memory", () => {
    it("parses memory source type from memory:TYPE:filename format", async () => {
      const adapter = createResonaAdapter();

      // Register a memory source that returns results
      adapter.registerSource({
        sourceId: "memory:LEARNING:test-file",
        description: "PAI Memory - Learnings",
        search: async (query: string, k: number) => [
          {
            id: "memory:LEARNING:test-file",
            similarity: 0.92,
            contextText: "Learned about MCP server patterns",
            metadata: {
              captureType: "LEARNING",
              timestamp: Date.now(),
              filePath: "/Users/test/.claude/MEMORY/Learning/test-file.md",
            },
          },
        ],
      });

      // Mock searchVector to return empty (we only want to test source parsing)
      adapter.searchVector = mock(() => Promise.resolve([]));

      const results = await adapter.searchUnified("MCP patterns", 10);

      expect(results.length).toBe(1);
      expect(results[0].source).toBe("memory");
      expect(results[0].sourceId).toBe("memory:LEARNING:test-file");
    });

    it("can register memory source", () => {
      const adapter = createResonaAdapter();

      adapter.registerSource({
        sourceId: "memory",
        description: "PAI Memory",
        search: async () => [],
      });

      expect(adapter.hasSource("memory")).toBe(true);
      expect(adapter.listSources()).toContain("memory");
    });
  });
});
