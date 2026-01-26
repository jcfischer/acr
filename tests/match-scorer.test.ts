/**
 * ACR Tier 1 - Match Scorer Tests
 *
 * TDD tests for T-4.1 (match scoring)
 */

import { describe, expect, it } from "bun:test";
import { scoreMatch, scoreMatches } from "../src/match-scorer";
import type { EntityMatch } from "../src/types";

describe("Match Scorer", () => {
  // =========================================================================
  // T-4.1: Match Scoring
  // =========================================================================
  describe("scoreMatch", () => {
    it("scores exact match as 1.0", () => {
      const score = scoreMatch("Daniel", "Daniel", "User Daniel is here");
      expect(score).toBe(1.0);
    });

    it("scores word boundary match as 0.8", () => {
      // Match at word boundary but different case
      const score = scoreMatch("daniel", "Daniel", "User Daniel is here");
      expect(score).toBeCloseTo(0.7, 1); // 0.8 - 0.1 case penalty
    });

    it("scores partial match as 0.6", () => {
      const score = scoreMatch("Dan", "Daniel", "User Daniel is here");
      expect(score).toBeCloseTo(0.6, 1);
    });

    it("applies case-insensitive penalty", () => {
      const exactScore = scoreMatch("Daniel", "Daniel", "Daniel is here");
      const caseScore = scoreMatch("DANIEL", "Daniel", "Daniel is here");
      expect(caseScore).toBeLessThan(exactScore);
    });

    it("scores substring match in context", () => {
      const score = scoreMatch("Scuol", "Scuol", "The Scuol apartment");
      expect(score).toBe(1.0);
    });

    it("returns 0 for no match", () => {
      const score = scoreMatch("NotFound", "Daniel", "Daniel is here");
      expect(score).toBe(0);
    });
  });

  describe("scoreMatches", () => {
    it("scores array of matches", () => {
      const matches: EntityMatch[] = [
        {
          entity: "Daniel",
          source: "test.md",
          snippet: "User Daniel is here",
          line: 1,
          confidence: 0,
        },
        {
          entity: "Scuol",
          source: "test.md",
          snippet: "Located in Scuol",
          line: 2,
          confidence: 0,
        },
      ];

      const scored = scoreMatches(matches);
      expect(scored.length).toBe(2);
      expect(scored[0].confidence).toBeGreaterThan(0);
      expect(scored[1].confidence).toBeGreaterThan(0);
    });

    it("does not mutate original matches", () => {
      const matches: EntityMatch[] = [
        {
          entity: "Daniel",
          source: "test.md",
          snippet: "Daniel here",
          line: 1,
          confidence: 0,
        },
      ];

      const scored = scoreMatches(matches);
      expect(matches[0].confidence).toBe(0); // Original unchanged
      expect(scored[0].confidence).toBeGreaterThan(0); // New array has scores
    });

    it("handles empty array", () => {
      const scored = scoreMatches([]);
      expect(scored).toEqual([]);
    });

    it("sorts by confidence descending", () => {
      const matches: EntityMatch[] = [
        {
          entity: "dan",
          source: "test.md",
          snippet: "Daniel mentioned",
          line: 1,
          confidence: 0,
        }, // partial match
        {
          entity: "Daniel",
          source: "test.md",
          snippet: "Daniel mentioned",
          line: 2,
          confidence: 0,
        }, // exact match
      ];

      const scored = scoreMatches(matches);
      expect(scored[0].confidence).toBeGreaterThanOrEqual(scored[1].confidence);
    });
  });
});
