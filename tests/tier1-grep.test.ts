/**
 * ACR Tier 1 - Integration Tests
 *
 * TDD tests for T-5.1 (aggregator) and T-5.2 (main entry)
 */

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import {
  aggregateResults,
  runTier1Grep,
} from "../src/tier1-grep";
import type { EntityMatch, SearchContext, GrepResult } from "../src/types";

// Test fixtures directory
const TEST_DIR = "/tmp/acr-integration-test";

beforeAll(() => {
  // Create test USER directory structure
  mkdirSync(join(TEST_DIR, "USER"), { recursive: true });

  // Create test files
  writeFileSync(
    join(TEST_DIR, "USER", "DAIDENTITY.md"),
    `# Daniel's Identity

Name: Daniel Miessler
Location: Scuol, Switzerland
Profession: Security researcher
`
  );

  writeFileSync(
    join(TEST_DIR, "USER", "PROJECTS.md"),
    `# Projects

## kai-improvement-roadmap
Path: ~/work/kai-improvement-roadmap
Description: Improvement roadmap for KAI

## reporter
Path: ~/work/reporter
Description: SOC report generator
`
  );

  writeFileSync(
    join(TEST_DIR, "USER", "NOTES.md"),
    `# Random Notes

Just some notes without relevant entities.
Nothing special here.
`
  );
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("ACR Tier 1 Integration", () => {
  // =========================================================================
  // T-5.1: Result Aggregator
  // =========================================================================
  describe("aggregateResults", () => {
    it("calculates aggregate confidence as max", () => {
      const matches: EntityMatch[] = [
        { entity: "A", source: "a.md", snippet: "A", line: 1, confidence: 0.5 },
        { entity: "B", source: "b.md", snippet: "B", line: 1, confidence: 0.9 },
        { entity: "C", source: "c.md", snippet: "C", line: 1, confidence: 0.3 },
      ];
      const context: SearchContext = {
        entities: ["A", "B", "C"],
        workingDir: "/test",
        recentFiles: [],
        rawPrompt: "test",
      };

      const result = aggregateResults(matches, context, 10);
      expect(result.aggregateConfidence).toBe(0.9);
    });

    it("sets escalateToTier2 when confidence below threshold", () => {
      const matches: EntityMatch[] = [
        { entity: "A", source: "a.md", snippet: "A", line: 1, confidence: 0.5 },
      ];
      const context: SearchContext = {
        entities: ["A"],
        workingDir: "/test",
        recentFiles: [],
        rawPrompt: "test",
      };

      const result = aggregateResults(matches, context, 10);
      expect(result.escalateToTier2).toBe(true); // 0.5 < 0.7
    });

    it("does not escalate when confidence above threshold", () => {
      const matches: EntityMatch[] = [
        { entity: "A", source: "a.md", snippet: "A", line: 1, confidence: 0.9 },
      ];
      const context: SearchContext = {
        entities: ["A"],
        workingDir: "/test",
        recentFiles: [],
        rawPrompt: "test",
      };

      const result = aggregateResults(matches, context, 10);
      expect(result.escalateToTier2).toBe(false);
    });

    it("always escalates when no matches", () => {
      const context: SearchContext = {
        entities: ["NotFound"],
        workingDir: "/test",
        recentFiles: [],
        rawPrompt: "test",
      };

      const result = aggregateResults([], context, 10);
      expect(result.escalateToTier2).toBe(true);
      expect(result.aggregateConfidence).toBe(0);
    });

    it("sorts matches by confidence descending", () => {
      const matches: EntityMatch[] = [
        { entity: "A", source: "a.md", snippet: "A", line: 1, confidence: 0.3 },
        { entity: "B", source: "b.md", snippet: "B", line: 1, confidence: 0.9 },
        { entity: "C", source: "c.md", snippet: "C", line: 1, confidence: 0.6 },
      ];
      const context: SearchContext = {
        entities: ["A", "B", "C"],
        workingDir: "/test",
        recentFiles: [],
        rawPrompt: "test",
      };

      const result = aggregateResults(matches, context, 10);
      expect(result.matches[0].confidence).toBe(0.9);
      expect(result.matches[1].confidence).toBe(0.6);
      expect(result.matches[2].confidence).toBe(0.3);
    });

    it("records latency in result", () => {
      const context: SearchContext = {
        entities: [],
        workingDir: "/test",
        recentFiles: [],
        rawPrompt: "test",
      };

      const result = aggregateResults([], context, 42);
      expect(result.latencyMs).toBe(42);
    });

    it("includes search context in result", () => {
      const context: SearchContext = {
        entities: ["Test"],
        workingDir: "/my/path",
        recentFiles: ["a.ts"],
        rawPrompt: "original prompt",
      };

      const result = aggregateResults([], context, 10);
      expect(result.searchContext).toEqual(context);
    });
  });

  // =========================================================================
  // T-5.2: Main Entry Point
  // =========================================================================
  describe("runTier1Grep", () => {
    it("finds entities in USER directory", async () => {
      const result = await runTier1Grep(
        "Tell me about Daniel",
        TEST_DIR,
        join(TEST_DIR, "USER")
      );

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches.some((m) => m.entity === "Daniel")).toBe(true);
    });

    it("returns valid GrepResult structure", async () => {
      const result = await runTier1Grep(
        "Help with the project",
        TEST_DIR,
        join(TEST_DIR, "USER")
      );

      expect(result).toHaveProperty("matches");
      expect(result).toHaveProperty("aggregateConfidence");
      expect(result).toHaveProperty("latencyMs");
      expect(result).toHaveProperty("escalateToTier2");
      expect(result).toHaveProperty("searchContext");
    });

    it("records latency under 100ms for small USER dir", async () => {
      const result = await runTier1Grep(
        "Quick search",
        TEST_DIR,
        join(TEST_DIR, "USER")
      );

      expect(result.latencyMs).toBeLessThan(100);
    });

    it("handles empty USER directory gracefully", async () => {
      const emptyDir = join(TEST_DIR, "EMPTY");
      mkdirSync(emptyDir, { recursive: true });

      const result = await runTier1Grep("test", TEST_DIR, emptyDir);

      expect(result.matches).toEqual([]);
      expect(result.escalateToTier2).toBe(true);

      rmSync(emptyDir, { recursive: true });
    });

    it("extracts project name from cwd", async () => {
      const result = await runTier1Grep(
        "help me",
        "/Users/fischer/work/kai-improvement-roadmap",
        join(TEST_DIR, "USER")
      );

      expect(result.searchContext.entities).toContain("kai-improvement-roadmap");
    });

    it("combines proper nouns and file paths", async () => {
      const result = await runTier1Grep(
        "Check Daniel in README.md",
        TEST_DIR,
        join(TEST_DIR, "USER")
      );

      const entities = result.searchContext.entities;
      expect(entities).toContain("Daniel");
      expect(entities).toContain("README.md");
    });
  });
});
