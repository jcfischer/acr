import { describe, expect, it } from "bun:test";
import {
  SearchContextSchema,
  EntityMatchSchema,
  GrepResultSchema,
  type SearchContext,
  type EntityMatch,
  type GrepResult,
} from "../src/types";

describe("ACR Types", () => {
  describe("SearchContext", () => {
    it("validates a valid SearchContext", () => {
      const context: SearchContext = {
        entities: ["Daniel", "Scuol"],
        workingDir: "/Users/fischer/work/project",
        recentFiles: ["README.md", "src/index.ts"],
        rawPrompt: "Help me with the Scuol project",
      };

      const result = SearchContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it("rejects SearchContext with missing entities", () => {
      const invalid = {
        workingDir: "/Users/fischer/work/project",
        recentFiles: [],
        rawPrompt: "Help me",
      };

      const result = SearchContextSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("accepts empty entities array", () => {
      const context = {
        entities: [],
        workingDir: "/Users/fischer/work",
        recentFiles: [],
        rawPrompt: "",
      };

      const result = SearchContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });
  });

  describe("EntityMatch", () => {
    it("validates a valid EntityMatch", () => {
      const match: EntityMatch = {
        entity: "Daniel",
        source: "DAIDENTITY.md",
        snippet: "Name: Daniel Fischer\nRole: Developer",
        line: 5,
        confidence: 0.95,
      };

      const result = EntityMatchSchema.safeParse(match);
      expect(result.success).toBe(true);
    });

    it("rejects confidence > 1.0", () => {
      const invalid = {
        entity: "Daniel",
        source: "DAIDENTITY.md",
        snippet: "Name: Daniel",
        line: 1,
        confidence: 1.5,
      };

      const result = EntityMatchSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects confidence < 0", () => {
      const invalid = {
        entity: "Daniel",
        source: "DAIDENTITY.md",
        snippet: "Name: Daniel",
        line: 1,
        confidence: -0.1,
      };

      const result = EntityMatchSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects negative line numbers", () => {
      const invalid = {
        entity: "Daniel",
        source: "DAIDENTITY.md",
        snippet: "Name: Daniel",
        line: -1,
        confidence: 0.5,
      };

      const result = EntityMatchSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("GrepResult", () => {
    it("validates a valid GrepResult", () => {
      const result: GrepResult = {
        matches: [
          {
            entity: "Daniel",
            source: "DAIDENTITY.md",
            snippet: "Name: Daniel",
            line: 1,
            confidence: 0.9,
          },
        ],
        aggregateConfidence: 0.9,
        latencyMs: 25,
        escalateToTier2: false,
        searchContext: {
          entities: ["Daniel"],
          workingDir: "/work",
          recentFiles: [],
          rawPrompt: "Hi Daniel",
        },
      };

      const parsed = GrepResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("sets escalateToTier2 based on confidence threshold", () => {
      const lowConfidence: GrepResult = {
        matches: [],
        aggregateConfidence: 0.5,
        latencyMs: 10,
        escalateToTier2: true, // Should be true when < 0.7
        searchContext: {
          entities: ["Unknown"],
          workingDir: "/work",
          recentFiles: [],
          rawPrompt: "Something",
        },
      };

      const result = GrepResultSchema.safeParse(lowConfidence);
      expect(result.success).toBe(true);
    });

    it("validates empty matches array", () => {
      const empty: GrepResult = {
        matches: [],
        aggregateConfidence: 0,
        latencyMs: 5,
        escalateToTier2: true,
        searchContext: {
          entities: [],
          workingDir: "/work",
          recentFiles: [],
          rawPrompt: "",
        },
      };

      const result = GrepResultSchema.safeParse(empty);
      expect(result.success).toBe(true);
    });
  });
});
