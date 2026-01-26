/**
 * Tests for embedding-service.ts
 * F-007: Resona Integration
 */

import { describe, expect, it, beforeAll, mock, spyOn } from "bun:test";
import {
  EmbeddingService,
  type EmbeddingServiceConfig,
} from "../src/embedding-service";
import { EMBEDDING_CONFIG } from "../src/embedding-types";

// Mock fetch for Ollama API tests
const originalFetch = globalThis.fetch;

describe("EmbeddingService", () => {
  describe("constructor", () => {
    it("uses default config when none provided", () => {
      const service = new EmbeddingService();
      expect(service.getConfig().ollamaUrl).toBe(EMBEDDING_CONFIG.ollamaUrl);
      expect(service.getConfig().model).toBe(EMBEDDING_CONFIG.model);
    });

    it("allows partial config override", () => {
      const service = new EmbeddingService({
        model: "custom-model",
      });
      expect(service.getConfig().model).toBe("custom-model");
      expect(service.getConfig().ollamaUrl).toBe(EMBEDDING_CONFIG.ollamaUrl);
    });

    it("validates config values", () => {
      expect(() => new EmbeddingService({ batchSize: -1 })).toThrow();
    });
  });

  describe("isHealthy", () => {
    it("returns true when Ollama responds", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ models: [] })))
      );

      const service = new EmbeddingService();
      const healthy = await service.isHealthy();
      expect(healthy).toBe(true);

      globalThis.fetch = originalFetch;
    });

    it("returns false when Ollama is unavailable", async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error("ECONNREFUSED")));

      const service = new EmbeddingService();
      const healthy = await service.isHealthy();
      expect(healthy).toBe(false);

      globalThis.fetch = originalFetch;
    });

    it("returns false on non-200 response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response("Not Found", { status: 404 }))
      );

      const service = new EmbeddingService();
      const healthy = await service.isHealthy();
      expect(healthy).toBe(false);

      globalThis.fetch = originalFetch;
    });
  });

  describe("embed", () => {
    it("returns Float32Array on success", async () => {
      const mockEmbedding = Array(768).fill(0.1);
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ embedding: mockEmbedding }))
        )
      );

      const service = new EmbeddingService();
      const result = await service.embed("test text");

      expect(result).toBeInstanceOf(Float32Array);
      expect(result!.length).toBe(768);

      globalThis.fetch = originalFetch;
    });

    it("returns null on empty text", async () => {
      const service = new EmbeddingService();
      const result = await service.embed("");
      expect(result).toBeNull();
    });

    it("returns null on whitespace-only text", async () => {
      const service = new EmbeddingService();
      const result = await service.embed("   \n\t  ");
      expect(result).toBeNull();
    });

    it("returns null when Ollama unavailable", async () => {
      globalThis.fetch = mock(() => Promise.reject(new Error("ECONNREFUSED")));

      const service = new EmbeddingService();
      const result = await service.embed("test");
      expect(result).toBeNull();

      globalThis.fetch = originalFetch;
    });

    it("returns null on API error response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response("Server Error", { status: 500 }))
      );

      const service = new EmbeddingService();
      const result = await service.embed("test");
      expect(result).toBeNull();

      globalThis.fetch = originalFetch;
    });

    it("calls correct Ollama endpoint", async () => {
      let calledUrl = "";
      let calledBody: any = null;

      globalThis.fetch = mock(async (url: string, options: any) => {
        calledUrl = url;
        calledBody = JSON.parse(options.body);
        return new Response(
          JSON.stringify({ embedding: Array(768).fill(0.1) })
        );
      });

      const service = new EmbeddingService({
        ollamaUrl: "http://localhost:11434",
        model: "nomic-embed-text",
      });
      await service.embed("test text");

      expect(calledUrl).toBe("http://localhost:11434/api/embeddings");
      expect(calledBody.model).toBe("nomic-embed-text");
      expect(calledBody.prompt).toBe("test text");

      globalThis.fetch = originalFetch;
    });
  });

  describe("embedBatch", () => {
    it("returns array of embeddings", async () => {
      const mockEmbedding = Array(768).fill(0.1);
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ embedding: mockEmbedding }))
        )
      );

      const service = new EmbeddingService();
      const results = await service.embedBatch(["text1", "text2", "text3"]);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeInstanceOf(Float32Array);

      globalThis.fetch = originalFetch;
    });

    it("returns empty array for empty input", async () => {
      const service = new EmbeddingService();
      const results = await service.embedBatch([]);
      expect(results).toEqual([]);
    });

    it("handles partial failures", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ embedding: Array(768).fill(0.1) }))
        );
      });

      const service = new EmbeddingService();
      const results = await service.embedBatch(["text1", "text2", "text3"]);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeInstanceOf(Float32Array);
      expect(results[1]).toBeNull(); // Failed
      expect(results[2]).toBeInstanceOf(Float32Array);

      globalThis.fetch = originalFetch;
    });

    it("respects batch size limit", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ embedding: Array(768).fill(0.1) }))
        );
      });

      const service = new EmbeddingService({ batchSize: 2 });
      const texts = ["t1", "t2", "t3", "t4", "t5"];
      await service.embedBatch(texts);

      // Should make 5 individual calls (Ollama API embeds one at a time)
      expect(callCount).toBe(5);

      globalThis.fetch = originalFetch;
    });

    it("filters empty strings from batch", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ embedding: Array(768).fill(0.1) }))
        );
      });

      const service = new EmbeddingService();
      const results = await service.embedBatch(["text1", "", "text2", "  "]);

      expect(results).toHaveLength(4);
      expect(results[0]).toBeInstanceOf(Float32Array);
      expect(results[1]).toBeNull(); // Empty string
      expect(results[2]).toBeInstanceOf(Float32Array);
      expect(results[3]).toBeNull(); // Whitespace only

      // Only 2 actual API calls
      expect(callCount).toBe(2);

      globalThis.fetch = originalFetch;
    });
  });

  describe("getConfig", () => {
    it("returns frozen config copy", () => {
      const service = new EmbeddingService();
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same values
    });
  });
});

describe("EmbeddingService error handling", () => {
  describe("timeout handling", () => {
    it("returns null on abort signal", async () => {
      // Test that the service handles abort errors gracefully
      globalThis.fetch = mock(async (_url: string, options?: RequestInit) => {
        // Check if signal is provided and simulate abort
        if (options?.signal) {
          throw new DOMException("The operation was aborted", "AbortError");
        }
        return new Response("{}");
      });

      const service = new EmbeddingService({ timeout: 50 });
      const result = await service.embed("test");
      expect(result).toBeNull();

      globalThis.fetch = originalFetch;
    });
  });

  describe("invalid response handling", () => {
    it("returns null on malformed JSON", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response("not json"))
      );

      const service = new EmbeddingService();
      const result = await service.embed("test");
      expect(result).toBeNull();

      globalThis.fetch = originalFetch;
    });

    it("returns null on missing embedding field", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ wrong: "field" })))
      );

      const service = new EmbeddingService();
      const result = await service.embed("test");
      expect(result).toBeNull();

      globalThis.fetch = originalFetch;
    });

    it("returns null on wrong embedding type", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ embedding: "string" })))
      );

      const service = new EmbeddingService();
      const result = await service.embed("test");
      expect(result).toBeNull();

      globalThis.fetch = originalFetch;
    });
  });

  describe("text preprocessing", () => {
    it("trims whitespace from input", async () => {
      let receivedPrompt = "";
      globalThis.fetch = mock(async (url: string, options: any) => {
        receivedPrompt = JSON.parse(options.body).prompt;
        return new Response(
          JSON.stringify({ embedding: Array(768).fill(0.1) })
        );
      });

      const service = new EmbeddingService();
      await service.embed("  test text  \n");

      expect(receivedPrompt).toBe("test text");

      globalThis.fetch = originalFetch;
    });

    it("truncates very long text", async () => {
      let receivedPrompt = "";
      globalThis.fetch = mock(async (url: string, options: any) => {
        receivedPrompt = JSON.parse(options.body).prompt;
        return new Response(
          JSON.stringify({ embedding: Array(768).fill(0.1) })
        );
      });

      const service = new EmbeddingService();
      const longText = "a".repeat(100000); // Very long
      await service.embed(longText);

      // Should be truncated (model-specific, typically 8192 tokens)
      expect(receivedPrompt.length).toBeLessThan(100000);

      globalThis.fetch = originalFetch;
    });
  });
});
