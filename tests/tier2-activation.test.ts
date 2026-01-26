/**
 * ACR Tier 2 - Activation Tests
 *
 * TDD RED: Tests written BEFORE implementation
 */

import { describe, expect, it } from "bun:test";
import {
  shouldActivateTier2,
  detectExplicitTrigger,
} from "../src/tier2-activation";
import type { GrepResult, SearchContext } from "../src/types";

// Helper to create a mock GrepResult
function createGrepResult(
  aggregateConfidence: number,
  matchCount: number = 1
): GrepResult {
  const matches = Array.from({ length: matchCount }, (_, i) => ({
    entity: `entity${i}`,
    source: `file${i}.md`,
    snippet: `Snippet for entity${i}`,
    line: i + 1,
    confidence: aggregateConfidence,
  }));

  return {
    matches,
    aggregateConfidence,
    latencyMs: 10,
    escalateToTier2: aggregateConfidence < 0.7,
    searchContext: {
      entities: matches.map((m) => m.entity),
      workingDir: "/work",
      recentFiles: [],
      rawPrompt: "test prompt",
    },
  };
}

describe("ACR Tier 2 Activation", () => {
  describe("shouldActivateTier2", () => {
    it("activates when Tier 1 confidence is below threshold", () => {
      const tier1Result = createGrepResult(0.5);
      const decision = shouldActivateTier2(tier1Result, "Help with project");

      expect(decision.shouldActivate).toBe(true);
      expect(decision.reason).toBe("low_confidence");
      expect(decision.tier1Confidence).toBe(0.5);
    });

    it("activates when Tier 1 has no results", () => {
      const tier1Result = createGrepResult(0, 0);
      const decision = shouldActivateTier2(tier1Result, "Help with project");

      expect(decision.shouldActivate).toBe(true);
      expect(decision.reason).toBe("no_results");
      expect(decision.tier1Confidence).toBe(0);
    });

    it("activates on explicit trigger phrase even with high confidence", () => {
      const tier1Result = createGrepResult(0.95);
      const decision = shouldActivateTier2(
        tier1Result,
        "Remember when we worked on this?"
      );

      expect(decision.shouldActivate).toBe(true);
      expect(decision.reason).toBe("explicit_request");
    });

    it("does not activate when confidence is above threshold and no trigger", () => {
      const tier1Result = createGrepResult(0.85);
      const decision = shouldActivateTier2(tier1Result, "Fix this bug please");

      expect(decision.shouldActivate).toBe(false);
      expect(decision.reason).toBe("disabled");
    });

    it("activates at exactly the threshold (0.7)", () => {
      const tier1Result = createGrepResult(0.7);
      const decision = shouldActivateTier2(tier1Result, "Help with project");

      // At threshold, should NOT activate (only below threshold)
      expect(decision.shouldActivate).toBe(false);
    });

    it("activates just below threshold (0.69)", () => {
      const tier1Result = createGrepResult(0.69);
      const decision = shouldActivateTier2(tier1Result, "Help with project");

      expect(decision.shouldActivate).toBe(true);
      expect(decision.reason).toBe("low_confidence");
    });

    it("respects disabled config", () => {
      const tier1Result = createGrepResult(0.5);
      const decision = shouldActivateTier2(tier1Result, "Help", {
        enabled: false,
      });

      expect(decision.shouldActivate).toBe(false);
      expect(decision.reason).toBe("disabled");
    });

    it("uses custom activation threshold", () => {
      const tier1Result = createGrepResult(0.75);

      // With default threshold (0.7), this would not activate
      const defaultDecision = shouldActivateTier2(tier1Result, "Help");
      expect(defaultDecision.shouldActivate).toBe(false);

      // With higher threshold (0.8), it should activate
      const customDecision = shouldActivateTier2(tier1Result, "Help", {
        activationThreshold: 0.8,
      });
      expect(customDecision.shouldActivate).toBe(true);
      expect(customDecision.reason).toBe("low_confidence");
    });
  });

  describe("detectExplicitTrigger", () => {
    it("detects 'remember when'", () => {
      expect(
        detectExplicitTrigger("Do you remember when we built the API?")
      ).toBe(true);
    });

    it("detects 'we discussed'", () => {
      expect(detectExplicitTrigger("As we discussed in our last call...")).toBe(
        true
      );
    });

    it("detects 'earlier session'", () => {
      expect(
        detectExplicitTrigger("In an earlier session we fixed this bug")
      ).toBe(true);
    });

    it("detects 'last time'", () => {
      expect(detectExplicitTrigger("Last time you suggested using Redis")).toBe(
        true
      );
    });

    it("detects 'previous conversation'", () => {
      expect(
        detectExplicitTrigger(
          "Based on our previous conversation about caching"
        )
      ).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(detectExplicitTrigger("REMEMBER WHEN we started?")).toBe(true);
      expect(detectExplicitTrigger("We DISCUSSED this before")).toBe(true);
    });

    it("returns false when no trigger phrase", () => {
      expect(detectExplicitTrigger("Fix the authentication bug")).toBe(false);
      expect(detectExplicitTrigger("Add a new feature")).toBe(false);
      expect(detectExplicitTrigger("What is this code doing?")).toBe(false);
    });

    it("detects 'you mentioned'", () => {
      expect(detectExplicitTrigger("You mentioned earlier that...")).toBe(true);
    });

    it("detects 'we talked about'", () => {
      expect(
        detectExplicitTrigger("Remember, we talked about this architecture")
      ).toBe(true);
    });

    it("handles empty string", () => {
      expect(detectExplicitTrigger("")).toBe(false);
    });
  });
});
