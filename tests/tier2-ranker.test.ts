/**
 * ACR Tier 2 - Result Ranker Tests
 *
 * TDD RED: Tests written BEFORE implementation
 */

import { describe, expect, it } from "bun:test";
import {
  rankResults,
  deduplicateResults,
  computeDedupHash,
} from "../src/tier2-ranker";
import type { UnifiedResult, RankedResult } from "../src/tier2-types";

// Helper to create mock UnifiedResults
// Note: Uses unique content by default (based on id) to avoid dedup
function createMockResult(
  id: string,
  source: "user" | "session" | "tana",
  similarity: number,
  content?: string
): UnifiedResult {
  return {
    id,
    content: content ?? `Test content for ${id}`, // Unique content by default
    source,
    sourceId: `${source}/${id}`,
    similarity,
  };
}

describe("ACR Tier 2 Result Ranker", () => {
  describe("rankResults", () => {
    it("sorts results by similarity descending", () => {
      const results: UnifiedResult[] = [
        createMockResult("1", "user", 0.7),
        createMockResult("2", "user", 0.9),
        createMockResult("3", "user", 0.8),
      ];

      const ranked = rankResults(results);

      expect(ranked[0].similarity).toBeGreaterThanOrEqual(ranked[1].similarity);
      expect(ranked[1].similarity).toBeGreaterThanOrEqual(ranked[2].similarity);
    });

    it("applies source priority boost to user source", () => {
      const results: UnifiedResult[] = [
        createMockResult("1", "user", 0.8),
        createMockResult("2", "tana", 0.85),
      ];

      const ranked = rankResults(results);

      // User should be boosted above tana despite lower raw similarity
      // user: 0.8 + 0.1 = 0.9
      // tana: 0.85 + 0 = 0.85
      expect(ranked[0].source).toBe("user");
    });

    it("applies source priority boost to session source", () => {
      const results: UnifiedResult[] = [
        createMockResult("1", "session", 0.82),
        createMockResult("2", "tana", 0.85),
      ];

      const ranked = rankResults(results);

      // session: 0.82 + 0.05 = 0.87
      // tana: 0.85 + 0 = 0.85
      expect(ranked[0].source).toBe("session");
    });

    it("assigns sequential rank numbers", () => {
      const results: UnifiedResult[] = [
        createMockResult("1", "user", 0.9),
        createMockResult("2", "user", 0.8),
        createMockResult("3", "user", 0.7),
      ];

      const ranked = rankResults(results);

      expect(ranked[0].rank).toBe(0);
      expect(ranked[1].rank).toBe(1);
      expect(ranked[2].rank).toBe(2);
    });

    it("includes dedupHash in results", () => {
      const results: UnifiedResult[] = [createMockResult("1", "user", 0.9)];

      const ranked = rankResults(results);

      expect(ranked[0].dedupHash).toBeDefined();
      expect(typeof ranked[0].dedupHash).toBe("string");
    });

    it("respects maxResults limit", () => {
      const results: UnifiedResult[] = Array.from({ length: 20 }, (_, i) =>
        createMockResult(`${i}`, "user", 0.9 - i * 0.01)
      );

      const ranked = rankResults(results, { maxResults: 5 });

      expect(ranked.length).toBe(5);
    });

    it("filters by minSimilarity after boost", () => {
      // Note: user source gets +0.1 boost, so raw 0.5 becomes 0.6
      // Use tana source (no boost) to test threshold filtering clearly
      const results: UnifiedResult[] = [
        createMockResult("1", "tana", 0.9),
        createMockResult("2", "tana", 0.5), // Below 0.6 threshold (no boost)
        createMockResult("3", "tana", 0.7),
      ];

      const ranked = rankResults(results, { minSimilarity: 0.6 });

      expect(ranked.length).toBe(2);
      expect(ranked.every((r) => r.similarity >= 0.6)).toBe(true);
    });

    it("handles empty input", () => {
      const ranked = rankResults([]);
      expect(ranked).toEqual([]);
    });

    it("caps boosted similarity at 1.0", () => {
      const results: UnifiedResult[] = [createMockResult("1", "user", 0.95)];

      const ranked = rankResults(results);

      // 0.95 + 0.1 = 1.05, should cap at 1.0
      expect(ranked[0].similarity).toBeLessThanOrEqual(1.0);
    });
  });

  describe("deduplicateResults", () => {
    it("removes duplicates with same content and source", () => {
      // Per spec: dedup by content hash (first 500 chars + source)
      // Same content + same source = duplicate
      const results: UnifiedResult[] = [
        createMockResult("1", "user", 0.9, "Same content here"),
        createMockResult("2", "user", 0.8, "Same content here"), // Same source = deduped
        createMockResult("3", "tana", 0.7, "Different content"),
      ];

      const deduped = deduplicateResults(results);

      expect(deduped.length).toBe(2);
    });

    it("keeps highest similarity duplicate within same source", () => {
      // Per spec: dedup considers source, so only same-source duplicates are removed
      const results: UnifiedResult[] = [
        createMockResult("1", "user", 0.7, "Duplicate text"),
        createMockResult("2", "user", 0.9, "Duplicate text"), // Higher sim, same source
        createMockResult("3", "user", 0.8, "Duplicate text"),
      ];

      const deduped = deduplicateResults(results);

      expect(deduped.length).toBe(1);
      expect(deduped[0].similarity).toBe(0.9);
    });

    it("preserves same content across different sources", () => {
      // Per spec: different sources = different dedup hashes = not duplicates
      const results: UnifiedResult[] = [
        createMockResult("1", "user", 0.9, "Same content"),
        createMockResult("2", "session", 0.8, "Same content"),
        createMockResult("3", "tana", 0.7, "Same content"),
      ];

      const deduped = deduplicateResults(results);

      // All three should remain (different sources)
      expect(deduped.length).toBe(3);
    });

    it("handles empty input", () => {
      const deduped = deduplicateResults([]);
      expect(deduped).toEqual([]);
    });

    it("uses first 500 chars for dedup hash", () => {
      const longContent = "A".repeat(1000);
      const results: UnifiedResult[] = [
        createMockResult("1", "user", 0.9, longContent),
        createMockResult("2", "user", 0.8, longContent + "extra"),
      ];

      const deduped = deduplicateResults(results);

      // Should be considered duplicates (first 500 chars match)
      expect(deduped.length).toBe(1);
    });

    it("considers source in dedup hash", () => {
      const results: UnifiedResult[] = [
        createMockResult("1", "user", 0.9, "Same content"),
        createMockResult("2", "session", 0.8, "Same content"),
      ];

      // With source in hash, these are different
      const hash1 = computeDedupHash(results[0]);
      const hash2 = computeDedupHash(results[1]);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("computeDedupHash", () => {
    it("returns consistent hash for same input", () => {
      const result = createMockResult("1", "user", 0.9, "Test content");

      const hash1 = computeDedupHash(result);
      const hash2 = computeDedupHash(result);

      expect(hash1).toBe(hash2);
    });

    it("returns different hash for different content", () => {
      const result1 = createMockResult("1", "user", 0.9, "Content A");
      const result2 = createMockResult("2", "user", 0.9, "Content B");

      const hash1 = computeDedupHash(result1);
      const hash2 = computeDedupHash(result2);

      expect(hash1).not.toBe(hash2);
    });

    it("truncates content at 500 chars", () => {
      const longContent = "X".repeat(1000);
      const result = createMockResult("1", "user", 0.9, longContent);

      const hash = computeDedupHash(result);

      // Hash should be the same as if content was truncated
      const truncatedResult = createMockResult(
        "1",
        "user",
        0.9,
        longContent.slice(0, 500)
      );
      const truncatedHash = computeDedupHash(truncatedResult);

      expect(hash).toBe(truncatedHash);
    });
  });
});
