/**
 * ACR Tier 2 - Type Tests
 *
 * TDD RED: Tests written BEFORE implementation
 */

import { describe, expect, it } from "bun:test";
import {
  SemanticQuerySchema,
  SemanticResultSchema,
  RankedResultSchema,
  UnifiedResultSchema,
  ActivationDecisionSchema,
  type SemanticQuery,
  type SemanticResult,
  type RankedResult,
  type UnifiedResult,
  type ActivationDecision,
} from "../src/tier2-types";

describe("ACR Tier 2 Types", () => {
  describe("SemanticQuery", () => {
    it("validates a valid SemanticQuery", () => {
      const query: SemanticQuery = {
        queryText: "project planning discussion",
        projectContext: "kai-improvement-roadmap",
        temporalHint: "recent",
        sourcePreference: ["user", "session"],
      };

      const result = SemanticQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("accepts minimal SemanticQuery with only required fields", () => {
      const query = {
        queryText: "some search text",
        projectContext: "my-project",
      };

      const result = SemanticQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it("rejects empty queryText", () => {
      const invalid = {
        queryText: "",
        projectContext: "my-project",
      };

      const result = SemanticQuerySchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates temporalHint enum values", () => {
      const recent = SemanticQuerySchema.safeParse({
        queryText: "test",
        projectContext: "proj",
        temporalHint: "recent",
      });
      expect(recent.success).toBe(true);

      const any = SemanticQuerySchema.safeParse({
        queryText: "test",
        projectContext: "proj",
        temporalHint: "any",
      });
      expect(any.success).toBe(true);

      const invalid = SemanticQuerySchema.safeParse({
        queryText: "test",
        projectContext: "proj",
        temporalHint: "invalid",
      });
      expect(invalid.success).toBe(false);
    });

    it("validates sourcePreference array values", () => {
      const valid = SemanticQuerySchema.safeParse({
        queryText: "test",
        projectContext: "proj",
        sourcePreference: ["user", "session", "tana", "maestro"],
      });
      expect(valid.success).toBe(true);

      const invalid = SemanticQuerySchema.safeParse({
        queryText: "test",
        projectContext: "proj",
        sourcePreference: ["user", "invalid"],
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("UnifiedResult", () => {
    it("validates a valid UnifiedResult", () => {
      const result: UnifiedResult = {
        id: "doc_123",
        content: "Meeting notes from last week discussing project timeline",
        source: "session",
        sourceId: "session_abc123",
        similarity: 0.85,
        metadata: { date: "2026-01-20" },
      };

      const parsed = UnifiedResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("rejects similarity > 1.0", () => {
      const invalid = {
        id: "doc_1",
        content: "test",
        source: "user",
        sourceId: "file.md",
        similarity: 1.5,
      };

      const result = UnifiedResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects similarity < 0", () => {
      const invalid = {
        id: "doc_1",
        content: "test",
        source: "user",
        sourceId: "file.md",
        similarity: -0.1,
      };

      const result = UnifiedResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates source enum values", () => {
      for (const source of ["user", "session", "tana", "maestro"]) {
        const result = UnifiedResultSchema.safeParse({
          id: "doc_1",
          content: "test",
          source,
          sourceId: "id",
          similarity: 0.5,
        });
        expect(result.success).toBe(true);
      }

      const invalid = UnifiedResultSchema.safeParse({
        id: "doc_1",
        content: "test",
        source: "invalid",
        sourceId: "id",
        similarity: 0.5,
      });
      expect(invalid.success).toBe(false);
    });

    it("validates maestro source type", () => {
      const maestroResult = UnifiedResultSchema.safeParse({
        id: "maestro:abc123:0",
        content: "Refactored API endpoints",
        source: "maestro",
        sourceId: "maestro:abc123:0",
        similarity: 0.82,
        metadata: {
          timestamp: "2026-01-25T14:30:00Z",
          entryType: "USER",
          sessionFile: "abc123.json",
        },
      });
      expect(maestroResult.success).toBe(true);
    });
  });

  describe("RankedResult", () => {
    it("validates a valid RankedResult", () => {
      const result: RankedResult = {
        content: "Prior discussion about authentication",
        source: "user",
        sourceId: "USER/PROJECTS.md",
        similarity: 0.92,
        rank: 1,
        dedupHash: "abc123def456",
      };

      const parsed = RankedResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("requires rank to be non-negative integer", () => {
      const negativeRank = RankedResultSchema.safeParse({
        content: "test",
        source: "user",
        sourceId: "file.md",
        similarity: 0.5,
        rank: -1,
        dedupHash: "hash",
      });
      expect(negativeRank.success).toBe(false);

      const floatRank = RankedResultSchema.safeParse({
        content: "test",
        source: "user",
        sourceId: "file.md",
        similarity: 0.5,
        rank: 1.5,
        dedupHash: "hash",
      });
      expect(floatRank.success).toBe(false);
    });
  });

  describe("ActivationDecision", () => {
    it("validates a valid ActivationDecision", () => {
      const decision: ActivationDecision = {
        shouldActivate: true,
        reason: "low_confidence",
        tier1Confidence: 0.45,
      };

      const result = ActivationDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });

    it("validates all reason enum values", () => {
      const reasons = [
        "low_confidence",
        "no_results",
        "explicit_request",
        "disabled",
      ];

      for (const reason of reasons) {
        const result = ActivationDecisionSchema.safeParse({
          shouldActivate: reason !== "disabled",
          reason,
          tier1Confidence: 0.5,
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid reason", () => {
      const invalid = ActivationDecisionSchema.safeParse({
        shouldActivate: true,
        reason: "invalid_reason",
        tier1Confidence: 0.5,
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("SemanticResult", () => {
    it("validates a complete SemanticResult", () => {
      const result: SemanticResult = {
        results: [
          {
            content: "Meeting notes",
            source: "session",
            sourceId: "session_123",
            similarity: 0.9,
            rank: 0,
            dedupHash: "hash1",
          },
          {
            content: "Project doc",
            source: "user",
            sourceId: "USER/PROJECTS.md",
            similarity: 0.85,
            rank: 1,
            dedupHash: "hash2",
          },
        ],
        queryLatencyMs: 45,
        embeddingLatencyMs: 120,
        totalLatencyMs: 180,
        activated: true,
        activationReason: "low_confidence",
      };

      const parsed = SemanticResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("validates empty results array", () => {
      const empty: SemanticResult = {
        results: [],
        queryLatencyMs: 10,
        embeddingLatencyMs: 50,
        totalLatencyMs: 65,
        activated: true,
        activationReason: "no_results",
      };

      const result = SemanticResultSchema.safeParse(empty);
      expect(result.success).toBe(true);
    });

    it("rejects negative latency values", () => {
      const invalid = {
        results: [],
        queryLatencyMs: -5,
        embeddingLatencyMs: 50,
        totalLatencyMs: 45,
        activated: false,
      };

      const result = SemanticResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("allows activationReason to be optional when not activated", () => {
      const notActivated = {
        results: [],
        queryLatencyMs: 0,
        embeddingLatencyMs: 0,
        totalLatencyMs: 0,
        activated: false,
      };

      const result = SemanticResultSchema.safeParse(notActivated);
      expect(result.success).toBe(true);
    });
  });
});
