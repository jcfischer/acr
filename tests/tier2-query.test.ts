/**
 * ACR Tier 2 - Query Construction Tests
 *
 * TDD RED: Tests written BEFORE implementation
 */

import { describe, expect, it } from "bun:test";
import {
  extractKeyPhrases,
  constructSemanticQuery,
} from "../src/tier2-query";
import type { SearchContext } from "../src/types";

describe("ACR Tier 2 Query Construction", () => {
  describe("extractKeyPhrases", () => {
    it("extracts noun phrases from simple prompt", () => {
      const phrases = extractKeyPhrases("Help me with the authentication system");
      expect(phrases).toContain("authentication system");
    });

    it("extracts proper nouns", () => {
      const phrases = extractKeyPhrases("Daniel mentioned the Scuol project");
      expect(phrases.some((p) => p.toLowerCase().includes("daniel"))).toBe(true);
      expect(phrases.some((p) => p.toLowerCase().includes("scuol"))).toBe(true);
    });

    it("filters out common stopwords", () => {
      const phrases = extractKeyPhrases("The quick brown fox jumps over the lazy dog");
      expect(phrases).not.toContain("the");
      expect(phrases).not.toContain("over");
    });

    it("handles technical terms", () => {
      const phrases = extractKeyPhrases(
        "Implement OAuth2 authentication with JWT tokens"
      );
      expect(phrases.some((p) => p.toLowerCase().includes("oauth"))).toBe(true);
      expect(phrases.some((p) => p.toLowerCase().includes("jwt"))).toBe(true);
    });

    it("returns empty array for empty input", () => {
      const phrases = extractKeyPhrases("");
      expect(phrases).toEqual([]);
    });

    it("extracts multi-word phrases", () => {
      const phrases = extractKeyPhrases(
        "We need to fix the user registration flow"
      );
      expect(
        phrases.some((p) => p.toLowerCase().includes("user registration"))
      ).toBe(true);
    });

    it("handles camelCase and PascalCase terms", () => {
      const phrases = extractKeyPhrases(
        "Check the UserService and authController"
      );
      expect(phrases.some((p) => p.includes("UserService") || p.includes("User Service"))).toBe(true);
    });

    it("limits number of phrases returned", () => {
      const longPrompt =
        "This is a very long prompt with many different words and phrases that could all be extracted as key phrases for the semantic search query construction process";
      const phrases = extractKeyPhrases(longPrompt);
      expect(phrases.length).toBeLessThanOrEqual(10);
    });
  });

  describe("constructSemanticQuery", () => {
    const mockContext: SearchContext = {
      entities: ["Daniel", "Scuol"],
      workingDir: "/Users/fischer/work/kai-improvement-roadmap",
      recentFiles: ["src/index.ts", "README.md"],
      rawPrompt: "Help with the Scuol project",
    };

    it("creates a SemanticQuery with required fields", () => {
      const query = constructSemanticQuery(
        "Help with the authentication system",
        mockContext
      );

      expect(query.queryText).toBeDefined();
      expect(query.queryText.length).toBeGreaterThan(0);
      expect(query.projectContext).toBe("kai-improvement-roadmap");
    });

    it("includes extracted key phrases in queryText", () => {
      const query = constructSemanticQuery(
        "Help with the authentication system",
        mockContext
      );

      expect(query.queryText.toLowerCase()).toContain("authentication");
    });

    it("includes Tier 1 entities in query", () => {
      const query = constructSemanticQuery(
        "Help with the project",
        mockContext,
        [{ entity: "UserService", source: "file.ts", snippet: "", line: 1, confidence: 0.8 }]
      );

      expect(query.queryText).toContain("UserService");
    });

    it("extracts project name from workingDir", () => {
      const query = constructSemanticQuery("Help", mockContext);
      expect(query.projectContext).toBe("kai-improvement-roadmap");
    });

    it("detects recent temporal hints", () => {
      const query = constructSemanticQuery(
        "What did we discuss last week?",
        mockContext
      );
      expect(query.temporalHint).toBe("recent");
    });

    it("detects any temporal hints", () => {
      const query = constructSemanticQuery(
        "Find all discussions about authentication",
        mockContext
      );
      expect(query.temporalHint).toBe("any");
    });

    it("returns valid SemanticQuery structure", () => {
      const query = constructSemanticQuery("Test query", mockContext);

      expect(typeof query.queryText).toBe("string");
      expect(typeof query.projectContext).toBe("string");
      expect(
        query.temporalHint === undefined ||
          query.temporalHint === "recent" ||
          query.temporalHint === "any"
      ).toBe(true);
    });

    it("handles empty Tier 1 matches gracefully", () => {
      const query = constructSemanticQuery("Help with project", mockContext, []);
      expect(query.queryText).toBeDefined();
      expect(query.queryText.length).toBeGreaterThan(0);
    });
  });
});
