/**
 * ACR Tier 2 - Session Indexer Tests
 *
 * TDD RED: Tests written BEFORE implementation
 */

import { describe, expect, it } from "bun:test";
import {
  parseSessionHistory,
  extractSynopsis,
  type SessionSynopsis,
} from "../src/session-indexer";

// Sample JSONL content for testing
const SAMPLE_JSONL = `{"type":"summary","summary":{"conversation_summary":"Discussed implementing authentication with OAuth2","project":"test-project"}}
{"type":"user","message":"Help me with OAuth2"}
{"type":"assistant","message":"I can help with OAuth2 implementation"}
{"type":"summary","summary":{"conversation_summary":"Fixed bugs in the payment system","project":"payment-service"}}`;

const SAMPLE_JSONL_NO_SUMMARY = `{"type":"user","message":"What is TypeScript?"}
{"type":"assistant","message":"TypeScript is a typed superset of JavaScript"}
{"type":"tool_use","tool":"read_file","input":{"path":"package.json"}}`;

describe("ACR Tier 2 Session Indexer", () => {
  describe("parseSessionHistory", () => {
    it("parses JSONL content into entries", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL);
      expect(entries.length).toBeGreaterThan(0);
    });

    it("extracts summary entries", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL);
      const summaries = entries.filter((e) => e.type === "summary");
      expect(summaries.length).toBe(2);
    });

    it("handles empty input", () => {
      const entries = parseSessionHistory("");
      expect(entries).toEqual([]);
    });

    it("handles invalid JSON lines gracefully", () => {
      const invalidJsonl = `{"valid":"entry"}
not valid json
{"another":"entry"}`;
      const entries = parseSessionHistory(invalidJsonl);
      // Should skip invalid lines and parse valid ones
      expect(entries.length).toBe(2);
    });

    it("extracts user messages", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL);
      const userMessages = entries.filter((e) => e.type === "user");
      expect(userMessages.length).toBeGreaterThan(0);
    });
  });

  describe("extractSynopsis", () => {
    it("extracts synopsis from summary entry", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL);
      const synopsis = extractSynopsis(entries, "session_123", "/work/project");

      expect(synopsis).toBeDefined();
      // Uses last summary (payment system) per implementation design
      expect(synopsis?.synopsis).toContain("payment");
    });

    it("uses last summary when multiple exist", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL);
      const synopsis = extractSynopsis(entries, "session_123", "/work/project");

      // Last summary is about payment system
      expect(synopsis?.synopsis).toContain("payment");
    });

    it("falls back to first user message when no summary", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL_NO_SUMMARY);
      const synopsis = extractSynopsis(entries, "session_456", "/work/project");

      expect(synopsis).toBeDefined();
      expect(synopsis?.synopsis).toContain("TypeScript");
    });

    it("returns null for empty entries", () => {
      const synopsis = extractSynopsis([], "session_789", "/work/project");
      expect(synopsis).toBeNull();
    });

    it("includes session metadata", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL);
      const synopsis = extractSynopsis(entries, "session_abc", "/work/my-project");

      expect(synopsis?.sessionId).toBe("session_abc");
      expect(synopsis?.projectPath).toBe("/work/my-project");
    });

    it("includes message count", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL);
      const synopsis = extractSynopsis(entries, "session_123", "/work/project");

      expect(synopsis?.messageCount).toBeGreaterThan(0);
    });

    it("truncates long synopsis", () => {
      const longSummary = `{"type":"summary","summary":{"conversation_summary":"${"A".repeat(1000)}"}}`;
      const entries = parseSessionHistory(longSummary);
      const synopsis = extractSynopsis(entries, "session_123", "/work/project");

      // Synopsis should be truncated
      expect(synopsis?.synopsis.length).toBeLessThanOrEqual(500);
    });
  });

  describe("SessionSynopsis structure", () => {
    it("has required fields", () => {
      const entries = parseSessionHistory(SAMPLE_JSONL);
      const synopsis = extractSynopsis(entries, "session_test", "/work/test");

      if (synopsis) {
        expect(typeof synopsis.sessionId).toBe("string");
        expect(typeof synopsis.projectPath).toBe("string");
        expect(typeof synopsis.synopsis).toBe("string");
        expect(synopsis.createdAt instanceof Date).toBe(true);
        expect(typeof synopsis.messageCount).toBe("number");
      }
    });
  });
});
