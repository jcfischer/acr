/**
 * Tests for ACR Tier 3 Confidence Router
 */

import { describe, it, expect } from "bun:test";
import {
  shouldInjectAutomatically,
  shouldAskUser,
  isEntityRejected,
  isSourceApproved,
  classifyDecision,
  classifyTier1Matches,
  classifyTier2Results,
  filterByAction,
  getAutoInjectDecisions,
  getAskDecisions,
  getSkipDecisions,
} from "../src/tier3-confidence-router";
import { createSessionACRState, createDefaultTier3Config } from "../src/tier3-types";
import type { EntityMatch } from "../src/types";
import type { RankedResult } from "../src/tier2-types";

describe("shouldInjectAutomatically", () => {
  it("should inject at high confidence (>= 0.7)", () => {
    expect(shouldInjectAutomatically(0.7, "user/test.md")).toBe(true);
    expect(shouldInjectAutomatically(0.85, "user/test.md")).toBe(true);
    expect(shouldInjectAutomatically(1.0, "user/test.md")).toBe(true);
  });

  it("should not inject at medium confidence (< 0.7)", () => {
    expect(shouldInjectAutomatically(0.69, "user/test.md")).toBe(false);
    expect(shouldInjectAutomatically(0.5, "user/test.md")).toBe(false);
  });

  it("should inject identity context at 0.9+", () => {
    expect(shouldInjectAutomatically(0.9, "user/daidentity/name.md")).toBe(true);
    expect(shouldInjectAutomatically(0.91, "USER/DAIDENTITY.md")).toBe(true);
  });

  it("should respect custom config threshold", () => {
    const config = { ...createDefaultTier3Config(), autoInjectThreshold: 0.8 };
    expect(shouldInjectAutomatically(0.75, "user/test.md", config)).toBe(false);
    expect(shouldInjectAutomatically(0.8, "user/test.md", config)).toBe(true);
  });
});

describe("shouldAskUser", () => {
  it("should ask at medium confidence (0.5-0.7)", () => {
    expect(shouldAskUser(0.5)).toBe(true);
    expect(shouldAskUser(0.6)).toBe(true);
    expect(shouldAskUser(0.69)).toBe(true);
  });

  it("should not ask at high confidence (>= 0.7)", () => {
    expect(shouldAskUser(0.7)).toBe(false);
    expect(shouldAskUser(0.85)).toBe(false);
  });

  it("should not ask at low confidence (< 0.5)", () => {
    expect(shouldAskUser(0.49)).toBe(false);
    expect(shouldAskUser(0.3)).toBe(false);
  });
});

describe("isEntityRejected", () => {
  it("should return false for empty state", () => {
    const state = createSessionACRState();
    expect(isEntityRejected("John", state)).toBe(false);
  });

  it("should return true for rejected entity", () => {
    const state = {
      ...createSessionACRState(),
      rejectedEntities: ["John", "Project X"],
    };
    expect(isEntityRejected("John", state)).toBe(true);
    expect(isEntityRejected("Project X", state)).toBe(true);
  });

  it("should be case-insensitive", () => {
    const state = {
      ...createSessionACRState(),
      rejectedEntities: ["John"],
    };
    expect(isEntityRejected("john", state)).toBe(true);
    expect(isEntityRejected("JOHN", state)).toBe(true);
  });

  it("should return false for non-rejected entity", () => {
    const state = {
      ...createSessionACRState(),
      rejectedEntities: ["John"],
    };
    expect(isEntityRejected("Jane", state)).toBe(false);
  });
});

describe("isSourceApproved", () => {
  it("should return false for empty state", () => {
    const state = createSessionACRState();
    expect(isSourceApproved("user/contacts/john.md", state)).toBe(false);
  });

  it("should return true for approved source", () => {
    const state = {
      ...createSessionACRState(),
      acceptedSources: { "user/contacts/john.md": Date.now() },
    };
    expect(isSourceApproved("user/contacts/john.md", state)).toBe(true);
  });

  it("should be case-insensitive", () => {
    const state = {
      ...createSessionACRState(),
      acceptedSources: { "user/contacts/john.md": Date.now() },
    };
    expect(isSourceApproved("USER/CONTACTS/JOHN.MD", state)).toBe(true);
  });
});

describe("classifyDecision", () => {
  const state = createSessionACRState();

  it("should classify high confidence as inject", () => {
    const decision = classifyDecision(0.85, "user/test.md", "Test", state);
    expect(decision.action).toBe("inject");
    expect(decision.confidence).toBe(0.85);
  });

  it("should classify medium confidence as ask", () => {
    const decision = classifyDecision(0.6, "user/test.md", "Test", state);
    expect(decision.action).toBe("ask");
  });

  it("should classify low confidence as skip", () => {
    const decision = classifyDecision(0.3, "user/test.md", "Test", state);
    expect(decision.action).toBe("skip");
  });

  it("should skip rejected entities", () => {
    const stateWithRejection = {
      ...state,
      rejectedEntities: ["Test"],
    };
    const decision = classifyDecision(
      0.9,
      "user/test.md",
      "Test",
      stateWithRejection
    );
    expect(decision.action).toBe("skip");
    expect(decision.reason).toContain("rejected");
  });

  it("should inject approved sources regardless of confidence", () => {
    const stateWithApproval = {
      ...state,
      acceptedSources: { "user/test.md": Date.now() },
    };
    const decision = classifyDecision(
      0.4,
      "user/test.md",
      "Test",
      stateWithApproval
    );
    expect(decision.action).toBe("inject");
    expect(decision.reason).toContain("approved");
  });

  it("should always inject high-confidence identity context", () => {
    const decision = classifyDecision(
      0.9,
      "user/daidentity/name.md",
      "Name",
      state
    );
    expect(decision.action).toBe("inject");
    expect(decision.reason).toContain("identity");
  });
});

describe("classifyTier1Matches", () => {
  const state = createSessionACRState();

  it("should classify all matches", () => {
    const matches: EntityMatch[] = [
      { entity: "John", source: "user/contacts.md", snippet: "...", line: 1, confidence: 0.9 },
      { entity: "Project", source: "user/projects.md", snippet: "...", line: 5, confidence: 0.6 },
      { entity: "Random", source: "user/notes.md", snippet: "...", line: 10, confidence: 0.3 },
    ];

    const decisions = classifyTier1Matches(matches, state);

    expect(decisions).toHaveLength(3);
    expect(decisions[0].action).toBe("inject");
    expect(decisions[1].action).toBe("ask");
    expect(decisions[2].action).toBe("skip");
  });

  it("should return empty for no matches", () => {
    const decisions = classifyTier1Matches([], state);
    expect(decisions).toHaveLength(0);
  });
});

describe("classifyTier2Results", () => {
  const state = createSessionACRState();

  it("should classify all results", () => {
    const results: RankedResult[] = [
      { content: "...", source: "user", sourceId: "user/test.md", similarity: 0.85, rank: 0, dedupHash: "a" },
      { content: "...", source: "session", sourceId: "session/xyz", similarity: 0.55, rank: 1, dedupHash: "b" },
    ];

    const decisions = classifyTier2Results(results, "Test", state);

    expect(decisions).toHaveLength(2);
    expect(decisions[0].action).toBe("inject");
    expect(decisions[1].action).toBe("ask");
  });
});

describe("filterByAction", () => {
  const decisions = [
    { action: "inject" as const, confidence: 0.9, source: "a", reason: "" },
    { action: "ask" as const, confidence: 0.6, source: "b", reason: "" },
    { action: "skip" as const, confidence: 0.3, source: "c", reason: "" },
    { action: "inject" as const, confidence: 0.8, source: "d", reason: "" },
  ];

  it("should filter inject decisions", () => {
    const filtered = filterByAction(decisions, "inject");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((d) => d.action === "inject")).toBe(true);
  });

  it("should filter ask decisions", () => {
    const filtered = filterByAction(decisions, "ask");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].source).toBe("b");
  });

  it("should filter skip decisions", () => {
    const filtered = filterByAction(decisions, "skip");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].source).toBe("c");
  });
});

describe("getAutoInjectDecisions", () => {
  it("should return only inject decisions", () => {
    const decisions = [
      { action: "inject" as const, confidence: 0.9, source: "a", reason: "" },
      { action: "ask" as const, confidence: 0.6, source: "b", reason: "" },
    ];
    const result = getAutoInjectDecisions(decisions);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("inject");
  });
});

describe("getAskDecisions", () => {
  it("should return only ask decisions", () => {
    const decisions = [
      { action: "inject" as const, confidence: 0.9, source: "a", reason: "" },
      { action: "ask" as const, confidence: 0.6, source: "b", reason: "" },
    ];
    const result = getAskDecisions(decisions);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("ask");
  });
});

describe("getSkipDecisions", () => {
  it("should return only skip decisions", () => {
    const decisions = [
      { action: "inject" as const, confidence: 0.9, source: "a", reason: "" },
      { action: "skip" as const, confidence: 0.3, source: "c", reason: "" },
    ];
    const result = getSkipDecisions(decisions);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("skip");
  });
});
