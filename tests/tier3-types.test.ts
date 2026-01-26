/**
 * Tests for ACR Tier 3 Types
 */

import { describe, it, expect } from "bun:test";
import {
  SOURCE_PRIORITY,
  InjectionDecisionSchema,
  ContextSourceSchema,
  FormattedContextSchema,
  AskPatternRequestSchema,
  SessionACRStateSchema,
  Tier3ConfigSchema,
  InjectionResultSchema,
  createEmptyInjectionResult,
  createSessionACRState,
  createDefaultTier3Config,
  getSourcePriority,
} from "../src/tier3-types";

describe("SOURCE_PRIORITY", () => {
  it("should prioritize user/daidentity highest", () => {
    expect(SOURCE_PRIORITY["user/daidentity"]).toBe(100);
  });

  it("should prioritize user/contacts over generic user", () => {
    expect(SOURCE_PRIORITY["user/contacts"]).toBeGreaterThan(
      SOURCE_PRIORITY["user"]
    );
  });

  it("should prioritize user over session", () => {
    expect(SOURCE_PRIORITY["user"]).toBeGreaterThan(SOURCE_PRIORITY["session"]);
  });

  it("should prioritize session over tana", () => {
    expect(SOURCE_PRIORITY["session"]).toBeGreaterThan(SOURCE_PRIORITY["tana"]);
  });
});

describe("InjectionDecisionSchema", () => {
  it("should validate inject action", () => {
    const decision = {
      action: "inject",
      confidence: 0.85,
      source: "user/contacts/john.md",
      reason: "High confidence match",
    };
    expect(InjectionDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("should validate ask action", () => {
    const decision = {
      action: "ask",
      confidence: 0.6,
      source: "session/abc123",
      reason: "Medium confidence",
    };
    expect(InjectionDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("should validate skip action", () => {
    const decision = {
      action: "skip",
      confidence: 0.3,
      source: "tana/node123",
      reason: "Low confidence",
    };
    expect(InjectionDecisionSchema.parse(decision)).toEqual(decision);
  });

  it("should reject invalid action", () => {
    const decision = {
      action: "unknown",
      confidence: 0.5,
      source: "test",
      reason: "test",
    };
    expect(() => InjectionDecisionSchema.parse(decision)).toThrow();
  });

  it("should reject confidence outside 0-1", () => {
    const decision = {
      action: "inject",
      confidence: 1.5,
      source: "test",
      reason: "test",
    };
    expect(() => InjectionDecisionSchema.parse(decision)).toThrow();
  });
});

describe("ContextSourceSchema", () => {
  it("should validate tier1 source", () => {
    const source = {
      content: "Test content",
      source: "user/daidentity.md",
      confidence: 0.9,
      tokenCount: 50,
      priority: 100,
      tier: "tier1",
    };
    expect(ContextSourceSchema.parse(source)).toEqual(source);
  });

  it("should validate tier2 source", () => {
    const source = {
      content: "Semantic match",
      source: "session/xyz",
      confidence: 0.75,
      tokenCount: 100,
      priority: 50,
      tier: "tier2",
    };
    expect(ContextSourceSchema.parse(source)).toEqual(source);
  });

  it("should reject invalid tier", () => {
    const source = {
      content: "Test",
      source: "test",
      confidence: 0.5,
      tokenCount: 10,
      priority: 50,
      tier: "tier3",
    };
    expect(() => ContextSourceSchema.parse(source)).toThrow();
  });
});

describe("FormattedContextSchema", () => {
  it("should validate complete formatted context", () => {
    const formatted = {
      content: "<acr-context>Test</acr-context>",
      totalTokens: 100,
      truncated: false,
      sourcesIncluded: 2,
      sourcesTotal: 2,
      sources: [
        {
          content: "Test",
          source: "user/test.md",
          confidence: 0.8,
          tokenCount: 50,
          priority: 70,
          tier: "tier1" as const,
        },
      ],
    };
    expect(FormattedContextSchema.parse(formatted)).toEqual(formatted);
  });

  it("should validate truncated context", () => {
    const formatted = {
      content: "<acr-context>Test</acr-context>\n\n[context: truncated, showing 1/5 matches]",
      totalTokens: 1900,
      truncated: true,
      sourcesIncluded: 1,
      sourcesTotal: 5,
      sources: [],
    };
    expect(FormattedContextSchema.parse(formatted)).toEqual(formatted);
  });
});

describe("AskPatternRequestSchema", () => {
  it("should validate ask pattern with all fields", () => {
    const pattern = {
      questions: [
        {
          header: "Context",
          question: "Found context about John. Include?",
          options: [
            { label: "Yes", description: "Include" },
            { label: "No", description: "Skip" },
          ],
          multiSelect: false,
        },
      ],
      entity: "John",
      source: "user/contacts/john.md",
      daysAgo: 5,
      preview: "John works at Acme Corp...",
    };
    expect(AskPatternRequestSchema.parse(pattern)).toEqual(pattern);
  });

  it("should reject header over 12 chars", () => {
    const pattern = {
      questions: [
        {
          header: "This Is Way Too Long",
          question: "Test?",
          options: [
            { label: "Yes", description: "Include" },
            { label: "No", description: "Skip" },
          ],
          multiSelect: false,
        },
      ],
      entity: "test",
      source: "test",
      daysAgo: 0,
      preview: "test",
    };
    expect(() => AskPatternRequestSchema.parse(pattern)).toThrow();
  });

  it("should reject fewer than 2 options", () => {
    const pattern = {
      questions: [
        {
          header: "Test",
          question: "Test?",
          options: [{ label: "Only One", description: "Option" }],
          multiSelect: false,
        },
      ],
      entity: "test",
      source: "test",
      daysAgo: 0,
      preview: "test",
    };
    expect(() => AskPatternRequestSchema.parse(pattern)).toThrow();
  });
});

describe("SessionACRStateSchema", () => {
  it("should validate fresh session state", () => {
    const state = {
      rejectedEntities: [],
      acceptedSources: {},
      injectionCount: 0,
      totalTokensInjected: 0,
      sessionStartMs: Date.now(),
    };
    expect(SessionACRStateSchema.parse(state)).toEqual(state);
  });

  it("should validate state with rejections and approvals", () => {
    const state = {
      rejectedEntities: ["John", "Project X"],
      acceptedSources: {
        "user/contacts/jane.md": 1706000000000,
      },
      injectionCount: 3,
      totalTokensInjected: 450,
      sessionStartMs: 1706000000000,
    };
    expect(SessionACRStateSchema.parse(state)).toEqual(state);
  });
});

describe("Tier3ConfigSchema", () => {
  it("should apply defaults", () => {
    const config = Tier3ConfigSchema.parse({});
    expect(config.autoInjectThreshold).toBe(0.7);
    expect(config.askThreshold).toBe(0.5);
    expect(config.maxTokenBudget).toBe(2000);
    expect(config.maxAsksPerSession).toBe(1);
    expect(config.debug).toBe(false);
  });

  it("should allow overrides", () => {
    const config = Tier3ConfigSchema.parse({
      autoInjectThreshold: 0.8,
      maxTokenBudget: 3000,
      debug: true,
    });
    expect(config.autoInjectThreshold).toBe(0.8);
    expect(config.maxTokenBudget).toBe(3000);
    expect(config.debug).toBe(true);
  });

  it("should reject threshold outside 0-1", () => {
    expect(() =>
      Tier3ConfigSchema.parse({ autoInjectThreshold: 1.5 })
    ).toThrow();
  });
});

describe("createEmptyInjectionResult", () => {
  it("should create empty result with zero latency", () => {
    const result = createEmptyInjectionResult();
    expect(result.formattedContext).toBeNull();
    expect(result.askPattern).toBeNull();
    expect(result.decisions).toEqual([]);
    expect(result.latencyMs).toBe(0);
    expect(result.hasContext).toBe(false);
  });

  it("should accept custom latency", () => {
    const result = createEmptyInjectionResult(42);
    expect(result.latencyMs).toBe(42);
  });
});

describe("createSessionACRState", () => {
  it("should create fresh state", () => {
    const state = createSessionACRState();
    expect(state.rejectedEntities).toEqual([]);
    expect(state.acceptedSources).toEqual({});
    expect(state.injectionCount).toBe(0);
    expect(state.totalTokensInjected).toBe(0);
    expect(state.sessionStartMs).toBeGreaterThan(0);
  });

  it("should have current timestamp", () => {
    const before = Date.now();
    const state = createSessionACRState();
    const after = Date.now();
    expect(state.sessionStartMs).toBeGreaterThanOrEqual(before);
    expect(state.sessionStartMs).toBeLessThanOrEqual(after);
  });
});

describe("createDefaultTier3Config", () => {
  it("should return valid config", () => {
    const config = createDefaultTier3Config();
    expect(Tier3ConfigSchema.safeParse(config).success).toBe(true);
  });
});

describe("getSourcePriority", () => {
  it("should return exact match priority", () => {
    expect(getSourcePriority("user/daidentity")).toBe(100);
    expect(getSourcePriority("user/contacts")).toBe(90);
    expect(getSourcePriority("session")).toBe(50);
  });

  it("should return prefix match priority", () => {
    expect(getSourcePriority("user/contacts/john.md")).toBe(90);
    expect(getSourcePriority("user/projects/acr.md")).toBe(80);
    expect(getSourcePriority("USER/DAIDENTITY.md")).toBe(100);
  });

  it("should return 0 for unknown sources", () => {
    expect(getSourcePriority("unknown/source")).toBe(0);
    expect(getSourcePriority("random")).toBe(0);
  });

  it("should be case-insensitive", () => {
    expect(getSourcePriority("USER/CONTACTS/JOHN.MD")).toBe(90);
    expect(getSourcePriority("Session")).toBe(50);
  });
});
