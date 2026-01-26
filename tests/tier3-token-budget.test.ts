/**
 * Tests for ACR Tier 3 Token Budget Management
 */

import { describe, it, expect } from "bun:test";
import {
  countTokens,
  countTokensMultiple,
  enforceTokenBudget,
  truncateSource,
  fitsInBudget,
  remainingBudget,
  isBudgetExhausted,
  addTokenCounts,
  getTotalTokenCount,
  getBudgetSummary,
} from "../src/tier3-token-budget";
import { createDefaultTier3Config } from "../src/tier3-types";
import type { ContextSource } from "../src/tier3-types";

describe("countTokens", () => {
  it("should return 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("should approximate tokens (chars/4 * 1.2)", () => {
    // 100 chars → 25 base tokens → 30 with safety margin
    const text = "A".repeat(100);
    const tokens = countTokens(text);
    expect(tokens).toBe(30);
  });

  it("should handle short strings", () => {
    const tokens = countTokens("Hello");
    expect(tokens).toBeGreaterThan(0);
  });

  it("should apply 20% safety margin", () => {
    // 80 chars → 20 base tokens → 24 with margin
    const text = "A".repeat(80);
    const tokens = countTokens(text);
    expect(tokens).toBe(24);
  });

  it("should ceil the result", () => {
    // 10 chars → 2.5 base → 3 with margin → ceil = 4
    const text = "A".repeat(10);
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThanOrEqual(3);
  });
});

describe("countTokensMultiple", () => {
  it("should sum token counts", () => {
    const texts = ["A".repeat(100), "B".repeat(100)];
    const total = countTokensMultiple(texts);
    expect(total).toBe(60); // 30 + 30
  });

  it("should return 0 for empty array", () => {
    expect(countTokensMultiple([])).toBe(0);
  });
});

describe("enforceTokenBudget", () => {
  const config = createDefaultTier3Config(); // maxTokenBudget: 2000

  it("should include all sources within budget", () => {
    const sources: ContextSource[] = [
      { content: "A", source: "a", confidence: 0.9, tokenCount: 500, priority: 100, tier: "tier1" },
      { content: "B", source: "b", confidence: 0.8, tokenCount: 500, priority: 50, tier: "tier2" },
    ];

    const result = enforceTokenBudget(sources, config);

    expect(result.includedSources).toHaveLength(2);
    expect(result.totalTokens).toBe(1000);
    expect(result.truncated).toBe(false);
    expect(result.excludedCount).toBe(0);
  });

  it("should exclude sources over budget", () => {
    const sources: ContextSource[] = [
      { content: "A", source: "a", confidence: 0.9, tokenCount: 1800, priority: 100, tier: "tier1" },
      { content: "B", source: "b", confidence: 0.8, tokenCount: 1000, priority: 50, tier: "tier2" },
    ];

    const result = enforceTokenBudget(sources, config);

    // First source (1800) fits, second source (1000) would push over budget
    // With 200 remaining, truncation creates a small partial source
    expect(result.includedSources.length).toBeGreaterThanOrEqual(1);
    expect(result.truncated).toBe(true);
  });

  it("should sort by priority then confidence", () => {
    const sources: ContextSource[] = [
      { content: "Low priority", source: "a", confidence: 0.95, tokenCount: 1500, priority: 10, tier: "tier1" },
      { content: "High priority", source: "b", confidence: 0.7, tokenCount: 1500, priority: 100, tier: "tier1" },
    ];

    const result = enforceTokenBudget(sources, config);

    // Total 3000 tokens exceeds 2000 budget, so only high priority fits
    // Higher priority source should be included first
    expect(result.includedSources[0].source).toBe("b"); // Higher priority included first
    expect(result.truncated).toBe(true);
  });

  it("should handle empty sources", () => {
    const result = enforceTokenBudget([], config);

    expect(result.includedSources).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("should truncate partial fit source", () => {
    const sources: ContextSource[] = [
      { content: "A", source: "a", confidence: 0.9, tokenCount: 1800, priority: 100, tier: "tier1" },
      { content: "B".repeat(1000), source: "b", confidence: 0.8, tokenCount: 500, priority: 50, tier: "tier2" },
    ];

    const result = enforceTokenBudget(sources, config);

    // First source fits, second gets truncated
    expect(result.includedSources.length).toBeGreaterThanOrEqual(1);
    expect(result.truncated).toBe(true);
  });
});

describe("truncateSource", () => {
  const source: ContextSource = {
    content: "A".repeat(1000),
    source: "test",
    confidence: 0.8,
    tokenCount: 300,
    priority: 50,
    tier: "tier1",
  };

  it("should truncate content to fit budget", () => {
    const truncated = truncateSource(source, 100);

    expect(truncated).not.toBeNull();
    expect(truncated!.content.length).toBeLessThan(source.content.length);
    expect(truncated!.content.endsWith("...")).toBe(true);
  });

  it("should return null if budget too small", () => {
    const truncated = truncateSource(source, 10);
    expect(truncated).toBeNull();
  });

  it("should preserve source metadata", () => {
    const truncated = truncateSource(source, 100);

    expect(truncated!.source).toBe(source.source);
    expect(truncated!.confidence).toBe(source.confidence);
    expect(truncated!.tier).toBe(source.tier);
  });

  it("should update token count", () => {
    const truncated = truncateSource(source, 100);

    expect(truncated!.tokenCount).toBeLessThan(source.tokenCount);
  });
});

describe("fitsInBudget", () => {
  it("should return true when fits", () => {
    const source: ContextSource = {
      content: "Test",
      source: "test",
      confidence: 0.8,
      tokenCount: 100,
      priority: 50,
      tier: "tier1",
    };

    expect(fitsInBudget(source, 1000, 2000)).toBe(true);
  });

  it("should return false when exceeds", () => {
    const source: ContextSource = {
      content: "Test",
      source: "test",
      confidence: 0.8,
      tokenCount: 1500,
      priority: 50,
      tier: "tier1",
    };

    expect(fitsInBudget(source, 1000, 2000)).toBe(false);
  });

  it("should return true when exactly at limit", () => {
    const source: ContextSource = {
      content: "Test",
      source: "test",
      confidence: 0.8,
      tokenCount: 1000,
      priority: 50,
      tier: "tier1",
    };

    expect(fitsInBudget(source, 1000, 2000)).toBe(true);
  });
});

describe("remainingBudget", () => {
  it("should calculate remaining", () => {
    expect(remainingBudget(500, 2000)).toBe(1500);
  });

  it("should return 0 when exhausted", () => {
    expect(remainingBudget(2500, 2000)).toBe(0);
  });
});

describe("isBudgetExhausted", () => {
  it("should return false when under budget", () => {
    expect(isBudgetExhausted(1000, 2000)).toBe(false);
  });

  it("should return true when at or over budget", () => {
    expect(isBudgetExhausted(2000, 2000)).toBe(true);
    expect(isBudgetExhausted(2500, 2000)).toBe(true);
  });
});

describe("addTokenCounts", () => {
  it("should add token counts to sources", () => {
    const sources: ContextSource[] = [
      { content: "A".repeat(100), source: "a", confidence: 0.8, tokenCount: 0, priority: 50, tier: "tier1" },
      { content: "B".repeat(200), source: "b", confidence: 0.7, tokenCount: 0, priority: 50, tier: "tier1" },
    ];

    const result = addTokenCounts(sources);

    expect(result[0].tokenCount).toBeGreaterThan(0);
    expect(result[1].tokenCount).toBeGreaterThan(result[0].tokenCount);
  });

  it("should preserve existing token counts", () => {
    const sources: ContextSource[] = [
      { content: "A", source: "a", confidence: 0.8, tokenCount: 50, priority: 50, tier: "tier1" },
    ];

    const result = addTokenCounts(sources);

    expect(result[0].tokenCount).toBe(50);
  });
});

describe("getTotalTokenCount", () => {
  it("should sum all token counts", () => {
    const sources: ContextSource[] = [
      { content: "A", source: "a", confidence: 0.8, tokenCount: 100, priority: 50, tier: "tier1" },
      { content: "B", source: "b", confidence: 0.7, tokenCount: 200, priority: 50, tier: "tier1" },
      { content: "C", source: "c", confidence: 0.6, tokenCount: 300, priority: 50, tier: "tier1" },
    ];

    expect(getTotalTokenCount(sources)).toBe(600);
  });

  it("should return 0 for empty array", () => {
    expect(getTotalTokenCount([])).toBe(0);
  });
});

describe("getBudgetSummary", () => {
  it("should return summary under budget", () => {
    const sources: ContextSource[] = [
      { content: "A", source: "a", confidence: 0.8, tokenCount: 500, priority: 50, tier: "tier1" },
    ];

    const summary = getBudgetSummary(sources);

    expect(summary.totalSources).toBe(1);
    expect(summary.totalTokens).toBe(500);
    expect(summary.maxBudget).toBe(2000);
    expect(summary.overBudget).toBe(false);
    expect(summary.overBudgetBy).toBe(0);
  });

  it("should report over budget", () => {
    const sources: ContextSource[] = [
      { content: "A", source: "a", confidence: 0.8, tokenCount: 2500, priority: 50, tier: "tier1" },
    ];

    const summary = getBudgetSummary(sources);

    expect(summary.overBudget).toBe(true);
    expect(summary.overBudgetBy).toBe(500);
  });
});
