/**
 * Tests for ACR Tier 3 Formatter
 */

import { describe, it, expect } from "bun:test";
import {
  entityMatchToContextSource,
  rankedResultToContextSource,
  formatSingleContext,
  formatMultipleContexts,
  formatTruncationIndicator,
  createFormattedContext,
  deduplicateSources,
  mergeSources,
  extractPreview,
} from "../src/tier3-formatter";
import type { EntityMatch } from "../src/types";
import type { RankedResult } from "../src/tier2-types";
import type { ContextSource } from "../src/tier3-types";

describe("entityMatchToContextSource", () => {
  it("should convert EntityMatch to ContextSource", () => {
    const match: EntityMatch = {
      entity: "John",
      source: "user/contacts/john.md",
      snippet: "John Doe - Security Engineer",
      line: 5,
      confidence: 0.85,
    };

    const source = entityMatchToContextSource(match, 50);

    expect(source.content).toBe("John Doe - Security Engineer");
    expect(source.source).toBe("user/contacts/john.md");
    expect(source.confidence).toBe(0.85);
    expect(source.tokenCount).toBe(50);
    expect(source.tier).toBe("tier1");
    expect(source.priority).toBeGreaterThan(0);
  });
});

describe("rankedResultToContextSource", () => {
  it("should convert RankedResult to ContextSource", () => {
    const result: RankedResult = {
      content: "Previous discussion about API security",
      source: "session",
      sourceId: "session/abc123",
      similarity: 0.78,
      rank: 0,
      dedupHash: "xyz",
    };

    const source = rankedResultToContextSource(result, 75);

    expect(source.content).toBe("Previous discussion about API security");
    expect(source.source).toBe("session/abc123");
    expect(source.confidence).toBe(0.78);
    expect(source.tokenCount).toBe(75);
    expect(source.tier).toBe("tier2");
  });
});

describe("formatSingleContext", () => {
  it("should format as ACR XML tag", () => {
    const source: ContextSource = {
      content: "John Doe - Met at conference",
      source: "user/contacts/john.md",
      confidence: 0.85,
      tokenCount: 50,
      priority: 90,
      tier: "tier1",
    };

    const formatted = formatSingleContext(source);

    expect(formatted).toContain('<acr-context source="user/contacts/john.md"');
    expect(formatted).toContain('confidence="0.85"');
    expect(formatted).toContain('tier="tier1"');
    expect(formatted).toContain("John Doe - Met at conference");
    expect(formatted).toContain("</acr-context>");
  });

  it("should escape XML special characters in source", () => {
    const source: ContextSource = {
      content: "Test",
      source: 'user/file "with" <special> chars.md',
      confidence: 0.7,
      tokenCount: 10,
      priority: 70,
      tier: "tier1",
    };

    const formatted = formatSingleContext(source);

    expect(formatted).toContain("&quot;");
    expect(formatted).toContain("&lt;");
    expect(formatted).toContain("&gt;");
  });

  it("should trim content", () => {
    const source: ContextSource = {
      content: "  Content with whitespace  \n\n",
      source: "test",
      confidence: 0.7,
      tokenCount: 10,
      priority: 0,
      tier: "tier1",
    };

    const formatted = formatSingleContext(source);

    expect(formatted).toContain("Content with whitespace");
    expect(formatted).not.toContain("  Content");
  });
});

describe("formatMultipleContexts", () => {
  it("should format multiple sources", () => {
    const sources: ContextSource[] = [
      {
        content: "First content",
        source: "source1",
        confidence: 0.9,
        tokenCount: 30,
        priority: 100,
        tier: "tier1",
      },
      {
        content: "Second content",
        source: "source2",
        confidence: 0.8,
        tokenCount: 30,
        priority: 50,
        tier: "tier2",
      },
    ];

    const formatted = formatMultipleContexts(sources);

    expect(formatted).toContain("First content");
    expect(formatted).toContain("Second content");
    expect(formatted).toContain("</acr-context>");
  });

  it("should sort by priority then confidence", () => {
    const sources: ContextSource[] = [
      { content: "Low priority high conf", source: "a", confidence: 0.95, tokenCount: 10, priority: 10, tier: "tier1" },
      { content: "High priority low conf", source: "b", confidence: 0.7, tokenCount: 10, priority: 100, tier: "tier1" },
      { content: "High priority high conf", source: "c", confidence: 0.9, tokenCount: 10, priority: 100, tier: "tier1" },
    ];

    const formatted = formatMultipleContexts(sources);

    // High priority high conf should come first
    const posC = formatted.indexOf("High priority high conf");
    const posB = formatted.indexOf("High priority low conf");
    const posA = formatted.indexOf("Low priority high conf");

    expect(posC).toBeLessThan(posB);
    expect(posB).toBeLessThan(posA);
  });

  it("should return empty string for no sources", () => {
    expect(formatMultipleContexts([])).toBe("");
  });
});

describe("formatTruncationIndicator", () => {
  it("should format truncation message", () => {
    const indicator = formatTruncationIndicator(3, 7);
    expect(indicator).toBe("[context: truncated, showing 3/7 matches]");
  });

  it("should handle single item", () => {
    const indicator = formatTruncationIndicator(1, 5);
    expect(indicator).toBe("[context: truncated, showing 1/5 matches]");
  });
});

describe("createFormattedContext", () => {
  it("should create formatted context with sources", () => {
    const sources: ContextSource[] = [
      { content: "Content", source: "test", confidence: 0.8, tokenCount: 50, priority: 70, tier: "tier1" },
    ];

    const result = createFormattedContext(sources, false, 1);

    expect(result.content).toContain("Content");
    expect(result.totalTokens).toBe(50);
    expect(result.truncated).toBe(false);
    expect(result.sourcesIncluded).toBe(1);
    expect(result.sourcesTotal).toBe(1);
    expect(result.sources).toHaveLength(1);
  });

  it("should add truncation indicator when truncated", () => {
    const sources: ContextSource[] = [
      { content: "Content", source: "test", confidence: 0.8, tokenCount: 50, priority: 70, tier: "tier1" },
    ];

    const result = createFormattedContext(sources, true, 5);

    expect(result.content).toContain("[context: truncated, showing 1/5 matches]");
    expect(result.truncated).toBe(true);
  });

  it("should handle empty sources", () => {
    const result = createFormattedContext([], false, 0);

    expect(result.content).toBe("");
    expect(result.totalTokens).toBe(0);
    expect(result.sourcesIncluded).toBe(0);
  });
});

describe("deduplicateSources", () => {
  it("should remove exact duplicates", () => {
    const sources: ContextSource[] = [
      { content: "Same content", source: "source1", confidence: 0.8, tokenCount: 20, priority: 50, tier: "tier1" },
      { content: "Same content", source: "source2", confidence: 0.7, tokenCount: 20, priority: 50, tier: "tier2" },
    ];

    const result = deduplicateSources(sources);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.8); // Keeps higher confidence
  });

  it("should keep higher priority duplicate", () => {
    const sources: ContextSource[] = [
      { content: "Same content", source: "low", confidence: 0.9, tokenCount: 20, priority: 10, tier: "tier1" },
      { content: "Same content", source: "high", confidence: 0.7, tokenCount: 20, priority: 100, tier: "tier2" },
    ];

    const result = deduplicateSources(sources);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("high");
  });

  it("should normalize whitespace for comparison", () => {
    const sources: ContextSource[] = [
      { content: "Same  content", source: "a", confidence: 0.8, tokenCount: 20, priority: 50, tier: "tier1" },
      { content: "same content", source: "b", confidence: 0.7, tokenCount: 20, priority: 50, tier: "tier1" },
    ];

    const result = deduplicateSources(sources);

    expect(result).toHaveLength(1);
  });

  it("should keep different content", () => {
    const sources: ContextSource[] = [
      { content: "Content A", source: "a", confidence: 0.8, tokenCount: 20, priority: 50, tier: "tier1" },
      { content: "Content B", source: "b", confidence: 0.7, tokenCount: 20, priority: 50, tier: "tier1" },
    ];

    const result = deduplicateSources(sources);

    expect(result).toHaveLength(2);
  });
});

describe("mergeSources", () => {
  it("should merge and deduplicate tier1 and tier2 sources", () => {
    const tier1: ContextSource[] = [
      { content: "Tier1 content", source: "user/test.md", confidence: 0.8, tokenCount: 30, priority: 70, tier: "tier1" },
    ];
    const tier2: ContextSource[] = [
      { content: "Tier2 content", source: "session/xyz", confidence: 0.75, tokenCount: 40, priority: 50, tier: "tier2" },
    ];

    const result = mergeSources(tier1, tier2);

    expect(result).toHaveLength(2);
    // Should be sorted by priority (tier1 first)
    expect(result[0].tier).toBe("tier1");
    expect(result[1].tier).toBe("tier2");
  });

  it("should deduplicate across tiers", () => {
    const tier1: ContextSource[] = [
      { content: "Same content", source: "user/test.md", confidence: 0.8, tokenCount: 30, priority: 70, tier: "tier1" },
    ];
    const tier2: ContextSource[] = [
      { content: "Same content", source: "session/xyz", confidence: 0.85, tokenCount: 30, priority: 50, tier: "tier2" },
    ];

    const result = mergeSources(tier1, tier2);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("user/test.md"); // Higher priority wins
  });

  it("should handle empty arrays", () => {
    expect(mergeSources([], [])).toEqual([]);
    expect(mergeSources([{ content: "A", source: "a", confidence: 0.5, tokenCount: 10, priority: 50, tier: "tier1" }], [])).toHaveLength(1);
  });
});

describe("extractPreview", () => {
  it("should return short content unchanged", () => {
    const preview = extractPreview("Short content");
    expect(preview).toBe("Short content");
  });

  it("should truncate long content with ellipsis", () => {
    const longContent = "A".repeat(300);
    const preview = extractPreview(longContent, 200);

    expect(preview.length).toBe(200);
    expect(preview.endsWith("...")).toBe(true);
  });

  it("should trim whitespace", () => {
    const preview = extractPreview("  Content with spaces  ");
    expect(preview).toBe("Content with spaces");
  });

  it("should use default max length of 200", () => {
    const longContent = "A".repeat(250);
    const preview = extractPreview(longContent);

    expect(preview.length).toBe(200);
  });
});
