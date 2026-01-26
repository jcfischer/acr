/**
 * Tests for ACR Tier 4 - Integration with Tier 1 and Tier 2
 */

import { describe, it, expect } from "bun:test";
import {
  applyDecayToMatch,
  applyDecayToMatchesSync,
  applyDecayToRankedResult,
  applyDecayToRankedResultsSync,
  aggregateDecayedConfidence,
  shouldEscalateWithDecay,
  timestampDaysAgo,
  getDecayStats,
} from "../src/tier4-integration";
import { createDefaultTier4Config } from "../src/tier4-types";
import type { EntityMatch } from "../src/types";
import type { RankedResult } from "../src/tier2-types";

describe("Tier 4 Integration", () => {
  describe("applyDecayToMatch", () => {
    it("applies decay based on source path", () => {
      const match: EntityMatch = {
        entity: "Daniel",
        source: "sessions/2024-01-15.md",
        snippet: "Meeting with Daniel",
        line: 10,
        confidence: 1.0,
      };

      // 30 days ago for session content (30-day half-life)
      const timestampMs = timestampDaysAgo(30);
      const result = applyDecayToMatch(match, timestampMs);

      expect(result.rawConfidence).toBe(1.0);
      expect(result.confidence).toBeCloseTo(0.5, 1);
      expect(result.contentType).toBe("sessions");
      expect(result.ageDays).toBeCloseTo(30, 1);
      expect(result.decayFactor).toBeCloseTo(0.5, 1);
    });

    it("preserves more confidence for identity content", () => {
      const match: EntityMatch = {
        entity: "Kai",
        source: "DAIDENTITY.md",
        snippet: "Name: Kai",
        line: 5,
        confidence: 1.0,
      };

      // 30 days ago for identity content (180-day half-life)
      const timestampMs = timestampDaysAgo(30);
      const result = applyDecayToMatch(match, timestampMs);

      expect(result.contentType).toBe("identity");
      expect(result.confidence).toBeGreaterThan(0.85); // Much less decay
    });

    it("decays operational content faster", () => {
      const match: EntityMatch = {
        entity: "task",
        source: "work/current-task.md",
        snippet: "Current task details",
        line: 1,
        confidence: 1.0,
      };

      // 30 days ago for operational content (14-day half-life)
      const timestampMs = timestampDaysAgo(30);
      const result = applyDecayToMatch(match, timestampMs);

      expect(result.contentType).toBe("operational");
      expect(result.confidence).toBeLessThan(0.3); // ~2 half-lives
    });
  });

  describe("applyDecayToMatchesSync", () => {
    it("applies decay and re-sorts by confidence", () => {
      const matches: EntityMatch[] = [
        {
          entity: "Alice",
          source: "work/task.md", // operational, 14-day half-life
          snippet: "Alice is working",
          line: 1,
          confidence: 1.0,
        },
        {
          entity: "Bob",
          source: "contacts/bob.md", // contacts, 90-day half-life
          snippet: "Bob's contact info",
          line: 1,
          confidence: 0.8,
        },
      ];

      // Both 30 days old
      const timestampMs = timestampDaysAgo(30);
      const items = matches.map((match) => ({ match, timestampMs }));

      const results = applyDecayToMatchesSync(items);

      // Bob should now be first (slower decay despite lower raw confidence)
      expect(results[0].entity).toBe("Bob");
      expect(results[1].entity).toBe("Alice");

      // Verify decay applied correctly
      expect(results[0].confidence).toBeGreaterThan(results[1].confidence);
    });

    it("returns empty array for empty input", () => {
      const results = applyDecayToMatchesSync([]);
      expect(results).toEqual([]);
    });
  });

  describe("applyDecayToRankedResult", () => {
    it("applies decay to semantic result", () => {
      const result: RankedResult = {
        content: "Session content",
        source: "session",
        sourceId: "sessions/2024-01-15.json",
        similarity: 0.9,
        rank: 0,
        dedupHash: "abc123",
      };

      const timestampMs = timestampDaysAgo(30);
      const decayed = applyDecayToRankedResult(result, timestampMs);

      expect(decayed.rawSimilarity).toBe(0.9);
      expect(decayed.similarity).toBeCloseTo(0.45, 1); // ~50% decay
      expect(decayed.contentType).toBe("sessions");
    });

    it("uses sourceId for classification when available", () => {
      const result: RankedResult = {
        content: "Identity content",
        source: "user", // Generic type
        sourceId: "DAIDENTITY.md", // Specific path
        similarity: 1.0,
        rank: 0,
        dedupHash: "xyz789",
      };

      const timestampMs = timestampDaysAgo(30);
      const decayed = applyDecayToRankedResult(result, timestampMs);

      // Should use path-based classification (identity), not source type (user/operational)
      expect(decayed.contentType).toBe("identity");
      expect(decayed.similarity).toBeGreaterThan(0.85);
    });
  });

  describe("applyDecayToRankedResultsSync", () => {
    it("re-ranks results after decay", () => {
      const results: RankedResult[] = [
        {
          content: "Task content",
          source: "user",
          sourceId: "work/task.md",
          similarity: 0.95,
          rank: 0,
          dedupHash: "a",
        },
        {
          content: "Contact info",
          source: "user",
          sourceId: "contacts/john.md",
          similarity: 0.8,
          rank: 1,
          dedupHash: "b",
        },
      ];

      // Both 30 days old
      const timestampMs = timestampDaysAgo(30);
      const items = results.map((result) => ({ result, timestampMs }));

      const decayed = applyDecayToRankedResultsSync(items);

      // Contact should now rank higher (slower decay)
      expect(decayed[0].sourceId).toBe("contacts/john.md");
      expect(decayed[0].rank).toBe(0);
      expect(decayed[1].sourceId).toBe("work/task.md");
      expect(decayed[1].rank).toBe(1);
    });
  });

  describe("aggregateDecayedConfidence", () => {
    it("returns max confidence", () => {
      const matches = [
        { confidence: 0.3 },
        { confidence: 0.7 },
        { confidence: 0.5 },
      ] as any[];

      expect(aggregateDecayedConfidence(matches)).toBe(0.7);
    });

    it("returns 0 for empty array", () => {
      expect(aggregateDecayedConfidence([])).toBe(0);
    });
  });

  describe("shouldEscalateWithDecay", () => {
    it("returns true when below threshold", () => {
      expect(shouldEscalateWithDecay(0.5)).toBe(true);
      expect(shouldEscalateWithDecay(0.69)).toBe(true);
    });

    it("returns false when at or above threshold", () => {
      expect(shouldEscalateWithDecay(0.7)).toBe(false);
      expect(shouldEscalateWithDecay(0.9)).toBe(false);
    });

    it("uses custom threshold", () => {
      expect(shouldEscalateWithDecay(0.5, 0.4)).toBe(false);
      expect(shouldEscalateWithDecay(0.3, 0.4)).toBe(true);
    });
  });

  describe("timestampDaysAgo", () => {
    it("creates timestamp for N days ago", () => {
      const now = Date.now();
      const thirtyDaysAgo = timestampDaysAgo(30);

      const diffMs = now - thirtyDaysAgo;
      const diffDays = diffMs / (24 * 60 * 60 * 1000);

      expect(diffDays).toBeCloseTo(30, 1);
    });
  });

  describe("getDecayStats", () => {
    it("calculates statistics for decayed results", () => {
      const results = [
        { decayFactor: 0.5, decayBypassed: false },
        { decayFactor: 0.8, decayBypassed: false },
        { decayFactor: 1.0, decayBypassed: true },
        { decayFactor: 0.3, decayBypassed: false },
      ];

      const stats = getDecayStats(results);

      expect(stats.totalResults).toBe(4);
      expect(stats.decayedCount).toBe(3);
      expect(stats.bypassedCount).toBe(1);
      expect(stats.avgDecayFactor).toBeCloseTo((0.5 + 0.8 + 0.3) / 3, 5);
      expect(stats.minDecayFactor).toBe(0.3);
      expect(stats.maxDecayFactor).toBe(0.8);
    });

    it("handles all bypassed results", () => {
      const results = [
        { decayFactor: 1.0, decayBypassed: true },
        { decayFactor: 1.0, decayBypassed: true },
      ];

      const stats = getDecayStats(results);

      expect(stats.decayedCount).toBe(0);
      expect(stats.bypassedCount).toBe(2);
      expect(stats.avgDecayFactor).toBe(1.0);
    });

    it("handles empty results", () => {
      const stats = getDecayStats([]);

      expect(stats.totalResults).toBe(0);
      expect(stats.avgDecayFactor).toBe(1.0);
    });
  });

  describe("decay disabled", () => {
    it("bypasses decay when config.enabled is false", () => {
      const match: EntityMatch = {
        entity: "test",
        source: "sessions/old.md",
        snippet: "Old content",
        line: 1,
        confidence: 1.0,
      };

      const config = createDefaultTier4Config();
      config.enabled = false;

      const timestampMs = timestampDaysAgo(90);
      const result = applyDecayToMatch(match, timestampMs, config);

      expect(result.confidence).toBe(1.0);
      expect(result.decayBypassed).toBe(true);
    });

    it("bypasses decay in historical mode", () => {
      const match: EntityMatch = {
        entity: "test",
        source: "sessions/old.md",
        snippet: "Old content",
        line: 1,
        confidence: 1.0,
      };

      const config = createDefaultTier4Config();
      config.historicalMode = true;

      const timestampMs = timestampDaysAgo(90);
      const result = applyDecayToMatch(match, timestampMs, config);

      expect(result.confidence).toBe(1.0);
      expect(result.decayBypassed).toBe(true);
    });
  });
});
