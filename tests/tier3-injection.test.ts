/**
 * Tests for ACR Tier 3 Context Injection Orchestrator
 */

import { describe, it, expect } from "bun:test";
import {
  runContextInjection,
  handleAskResponse,
  handleAutoInjection,
  wouldProduceContext,
  getConfidenceSummary,
} from "../src/tier3-injection";
import { createSessionACRState, createDefaultTier3Config } from "../src/tier3-types";
import type { GrepResult, SearchContext } from "../src/types";
import type { SemanticResult } from "../src/tier2-types";
import type { ContextSource } from "../src/tier3-types";

// Helper to create test data
const createSearchContext = (): SearchContext => ({
  entities: ["John"],
  workingDir: "/test",
  recentFiles: [],
  rawPrompt: "Tell me about John",
});

const createGrepResult = (
  matches: Array<{
    entity: string;
    source: string;
    snippet: string;
    confidence: number;
  }> = []
): GrepResult => ({
  matches: matches.map((m, i) => ({
    entity: m.entity,
    source: m.source,
    snippet: m.snippet,
    line: i + 1,
    confidence: m.confidence,
  })),
  aggregateConfidence: matches.length > 0 ? Math.max(...matches.map((m) => m.confidence)) : 0,
  latencyMs: 5,
  escalateToTier2: matches.length === 0 || Math.max(...matches.map((m) => m.confidence)) < 0.7,
  searchContext: createSearchContext(),
});

const createSemanticResult = (
  results: Array<{
    content: string;
    sourceId: string;
    similarity: number;
  }> = []
): SemanticResult => ({
  results: results.map((r, i) => ({
    content: r.content,
    source: "user" as const,
    sourceId: r.sourceId,
    similarity: r.similarity,
    rank: i,
    dedupHash: `hash${i}`,
  })),
  queryLatencyMs: 5,
  embeddingLatencyMs: 10,
  totalLatencyMs: 15,
  activated: results.length > 0,
});

describe("runContextInjection", () => {
  it("should return empty result for no matches", async () => {
    const tier1 = createGrepResult([]);
    const result = await runContextInjection(tier1);

    expect(result.formattedContext).toBeNull();
    expect(result.askPattern).toBeNull();
    expect(result.hasContext).toBe(false);
    expect(result.decisions).toHaveLength(0);
  });

  it("should auto-inject high-confidence matches", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "user/contacts/john.md",
        snippet: "John Doe - Security Engineer",
        confidence: 0.9,
      },
    ]);

    const result = await runContextInjection(tier1);

    expect(result.formattedContext).not.toBeNull();
    expect(result.formattedContext!.content).toContain("John Doe");
    expect(result.askPattern).toBeNull();
    expect(result.hasContext).toBe(true);
  });

  it("should generate ask pattern for medium-confidence matches", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "user/notes/meeting.md",
        snippet: "John mentioned something",
        confidence: 0.6,
      },
    ]);

    const result = await runContextInjection(tier1);

    expect(result.formattedContext).toBeNull();
    expect(result.askPattern).not.toBeNull();
    expect(result.askPattern!.entity).toBe("John");
    expect(result.hasContext).toBe(true);
  });

  it("should skip low-confidence matches", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "random/file.md",
        snippet: "Random john reference",
        confidence: 0.3,
      },
    ]);

    const result = await runContextInjection(tier1);

    expect(result.formattedContext).toBeNull();
    expect(result.askPattern).toBeNull();
    expect(result.hasContext).toBe(false);
    expect(result.decisions[0].action).toBe("skip");
  });

  it("should merge tier1 and tier2 results", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "user/contacts/john.md",
        snippet: "John contact info",
        confidence: 0.85,
      },
    ]);

    const tier2 = createSemanticResult([
      {
        content: "Previous discussion with John",
        sourceId: "session/abc123",
        similarity: 0.8,
      },
    ]);

    const result = await runContextInjection(tier1, tier2);

    expect(result.formattedContext).not.toBeNull();
    expect(result.formattedContext!.sourcesIncluded).toBe(2);
    expect(result.decisions).toHaveLength(2);
  });

  it("should respect session rejections", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "user/contacts/john.md",
        snippet: "John Doe info",
        confidence: 0.9,
      },
    ]);

    const state = {
      ...createSessionACRState(),
      rejectedEntities: ["John"],
    };

    const result = await runContextInjection(tier1, null, {
      sessionState: state,
    });

    expect(result.formattedContext).toBeNull();
    expect(result.decisions[0].action).toBe("skip");
    expect(result.decisions[0].reason).toContain("rejected");
  });

  it("should respect session approvals", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "user/contacts/john.md",
        snippet: "John info",
        confidence: 0.4, // Low confidence would normally be skipped
      },
    ]);

    const state = {
      ...createSessionACRState(),
      acceptedSources: { "user/contacts/john.md": Date.now() },
    };

    const result = await runContextInjection(tier1, null, {
      sessionState: state,
    });

    expect(result.formattedContext).not.toBeNull();
    expect(result.decisions[0].action).toBe("inject");
    expect(result.decisions[0].reason).toContain("approved");
  });

  it("should enforce token budget", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "user/contacts/john.md",
        snippet: "A".repeat(10000), // Large content
        confidence: 0.9,
      },
      {
        entity: "Jane",
        source: "user/contacts/jane.md",
        snippet: "B".repeat(10000),
        confidence: 0.85,
      },
    ]);

    const result = await runContextInjection(tier1, null, {
      config: { maxTokenBudget: 500 },
    });

    expect(result.formattedContext).not.toBeNull();
    expect(result.formattedContext!.truncated).toBe(true);
    // Token counting is approximate (4 chars/token + 20% safety), allow small variance
    expect(result.formattedContext!.totalTokens).toBeLessThanOrEqual(510);
  });

  it("should include debug info when enabled", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "test",
        snippet: "content",
        confidence: 0.8,
      },
    ]);

    const result = await runContextInjection(tier1, null, {
      config: { debug: true },
    });

    expect(result.debugInfo).toBeDefined();
    expect(result.debugInfo!.tier1Count).toBe(1);
  });

  it("should not include debug info when disabled", async () => {
    const tier1 = createGrepResult([
      {
        entity: "John",
        source: "test",
        snippet: "content",
        confidence: 0.8,
      },
    ]);

    const result = await runContextInjection(tier1, null, {
      config: { debug: false },
    });

    expect(result.debugInfo).toBeUndefined();
  });

  it("should track latency", async () => {
    const tier1 = createGrepResult([]);
    const result = await runContextInjection(tier1);

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("handleAskResponse", () => {
  it("should approve source on include", () => {
    const state = createSessionACRState();
    const newState = handleAskResponse(
      state,
      "include",
      "John",
      "user/contacts/john.md",
      100
    );

    expect("user/contacts/john.md" in newState.acceptedSources).toBe(true);
    expect(newState.injectionCount).toBe(1);
    expect(newState.totalTokensInjected).toBe(100);
  });

  it("should reject entity on skip", () => {
    const state = createSessionACRState();
    const newState = handleAskResponse(state, "skip", "John", "user/contacts/john.md", 0);

    expect(newState.rejectedEntities).toContain("John");
  });
});

describe("handleAutoInjection", () => {
  it("should update state for all injected sources", () => {
    const state = createSessionACRState();
    const sources: ContextSource[] = [
      { content: "A", source: "source1", confidence: 0.9, tokenCount: 100, priority: 50, tier: "tier1" },
      { content: "B", source: "source2", confidence: 0.85, tokenCount: 150, priority: 50, tier: "tier2" },
    ];

    const newState = handleAutoInjection(state, sources);

    expect(Object.keys(newState.acceptedSources)).toHaveLength(2);
    expect(newState.injectionCount).toBe(2);
    expect(newState.totalTokensInjected).toBe(250);
  });
});

describe("wouldProduceContext", () => {
  it("should return true for tier1 matches", () => {
    const tier1 = createGrepResult([
      { entity: "John", source: "test", snippet: "content", confidence: 0.5 },
    ]);

    expect(wouldProduceContext(tier1, null)).toBe(true);
  });

  it("should return true for tier2 results", () => {
    const tier1 = createGrepResult([]);
    const tier2 = createSemanticResult([
      { content: "content", sourceId: "test", similarity: 0.6 },
    ]);

    expect(wouldProduceContext(tier1, tier2)).toBe(true);
  });

  it("should return false for no results", () => {
    const tier1 = createGrepResult([]);
    const tier2 = createSemanticResult([]);

    expect(wouldProduceContext(tier1, tier2)).toBe(false);
  });
});

describe("getConfidenceSummary", () => {
  it("should calculate summary from tier1 only", () => {
    const tier1 = createGrepResult([
      { entity: "A", source: "a", snippet: "a", confidence: 0.9 },
      { entity: "B", source: "b", snippet: "b", confidence: 0.7 },
    ]);

    const summary = getConfidenceSummary(tier1, null);

    expect(summary.maxConfidence).toBe(0.9);
    expect(summary.avgConfidence).toBe(0.8);
    expect(summary.sourceCount).toBe(2);
  });

  it("should combine tier1 and tier2", () => {
    const tier1 = createGrepResult([
      { entity: "A", source: "a", snippet: "a", confidence: 0.9 },
    ]);
    const tier2 = createSemanticResult([
      { content: "b", sourceId: "b", similarity: 0.7 },
    ]);

    const summary = getConfidenceSummary(tier1, tier2);

    expect(summary.maxConfidence).toBe(0.9);
    expect(summary.avgConfidence).toBe(0.8);
    expect(summary.sourceCount).toBe(2);
  });

  it("should handle no results", () => {
    const tier1 = createGrepResult([]);
    const summary = getConfidenceSummary(tier1, null);

    expect(summary.maxConfidence).toBe(0);
    expect(summary.avgConfidence).toBe(0);
    expect(summary.sourceCount).toBe(0);
  });
});
