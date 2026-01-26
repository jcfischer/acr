/**
 * ACR Tier 1 - Entity Extractor Tests
 *
 * TDD tests for T-2.1 (proper nouns), T-2.2 (project names), T-2.3 (file paths)
 */

import { describe, expect, it } from "bun:test";
import {
  extractProperNouns,
  extractProjectName,
  extractFilePaths,
  extractEntities,
} from "../src/entity-extractor";

describe("Entity Extractor", () => {
  // =========================================================================
  // T-2.1: Proper Noun Extraction
  // =========================================================================
  describe("extractProperNouns", () => {
    it("extracts capitalized words from prompt", () => {
      const prompt = "Help me with the Daniel project in Scuol";
      const nouns = extractProperNouns(prompt);
      expect(nouns).toContain("Daniel");
      expect(nouns).toContain("Scuol");
    });

    it("filters out stopwords even when capitalized", () => {
      const prompt = "The Project is about Daniel";
      const nouns = extractProperNouns(prompt);
      expect(nouns).not.toContain("The");
      expect(nouns).toContain("Project");
      expect(nouns).toContain("Daniel");
    });

    it("handles acronyms (all caps)", () => {
      const prompt = "Configure the API for AWS integration";
      const nouns = extractProperNouns(prompt);
      expect(nouns).toContain("API");
      expect(nouns).toContain("AWS");
    });

    it("filters words shorter than minimum length", () => {
      const prompt = "AI is great for ML tasks";
      const nouns = extractProperNouns(prompt);
      expect(nouns).not.toContain("AI"); // 2 chars, below minimum of 3
      expect(nouns).not.toContain("ML"); // 2 chars
    });

    it("handles multi-word proper nouns with hyphens", () => {
      const prompt = "Working on kai-improvement-roadmap project";
      const nouns = extractProperNouns(prompt);
      // Should not extract hyphenated as single entity here
      // but should handle it gracefully
      expect(Array.isArray(nouns)).toBe(true);
    });

    it("returns empty array for prompt with no proper nouns", () => {
      const prompt = "help me fix the bug";
      const nouns = extractProperNouns(prompt);
      expect(nouns).toEqual([]);
    });

    it("deduplicates repeated proper nouns", () => {
      const prompt = "Daniel helped Daniel with the Daniel project";
      const nouns = extractProperNouns(prompt);
      expect(nouns.filter((n) => n === "Daniel").length).toBe(1);
    });
  });

  // =========================================================================
  // T-2.2: Project Name Extraction
  // =========================================================================
  describe("extractProjectName", () => {
    it("extracts project name from cwd path", () => {
      const cwd = "/Users/fischer/work/kai-improvement-roadmap";
      const name = extractProjectName(cwd);
      expect(name).toBe("kai-improvement-roadmap");
    });

    it("handles nested directory paths", () => {
      const cwd = "/Users/fischer/work/projects/subdir/my-project";
      const name = extractProjectName(cwd);
      expect(name).toBe("my-project");
    });

    it("handles trailing slash", () => {
      const cwd = "/Users/fischer/work/my-project/";
      const name = extractProjectName(cwd);
      expect(name).toBe("my-project");
    });

    it("handles root directory", () => {
      const cwd = "/";
      const name = extractProjectName(cwd);
      expect(name).toBe("");
    });

    it("handles home directory", () => {
      const cwd = "/Users/fischer";
      const name = extractProjectName(cwd);
      expect(name).toBe("fischer");
    });
  });

  // =========================================================================
  // T-2.3: File Path Extraction
  // =========================================================================
  describe("extractFilePaths", () => {
    it("extracts absolute file paths from prompt", () => {
      const prompt = "Edit /Users/fischer/work/project/src/index.ts";
      const paths = extractFilePaths(prompt);
      expect(paths).toContain("index.ts");
    });

    it("extracts relative file paths from prompt", () => {
      const prompt = "Look at src/components/Button.tsx and fix it";
      const paths = extractFilePaths(prompt);
      expect(paths).toContain("Button.tsx");
    });

    it("extracts multiple file paths", () => {
      const prompt = "Compare README.md with docs/GUIDE.md";
      const paths = extractFilePaths(prompt);
      expect(paths).toContain("README.md");
      expect(paths).toContain("GUIDE.md");
    });

    it("handles paths with dots in directory names", () => {
      const prompt = "Check .claude/settings.json";
      const paths = extractFilePaths(prompt);
      expect(paths).toContain("settings.json");
    });

    it("returns empty array when no paths found", () => {
      const prompt = "help me with the project";
      const paths = extractFilePaths(prompt);
      expect(paths).toEqual([]);
    });

    it("returns basename only, not full path", () => {
      const prompt = "Edit /very/long/path/to/file.ts";
      const paths = extractFilePaths(prompt);
      expect(paths).toContain("file.ts");
      expect(paths).not.toContain("/very/long/path/to/file.ts");
    });
  });

  // =========================================================================
  // Integration: extractEntities (combines all extractors)
  // =========================================================================
  describe("extractEntities", () => {
    it("combines all entity types", () => {
      const prompt = "Help Daniel with README.md in Scuol";
      const cwd = "/Users/fischer/work/my-project";
      const context = extractEntities(prompt, cwd);

      expect(context.entities).toContain("Daniel");
      expect(context.entities).toContain("Scuol");
      expect(context.entities).toContain("README.md");
      expect(context.entities).toContain("my-project");
      expect(context.workingDir).toBe(cwd);
      expect(context.rawPrompt).toBe(prompt);
    });

    it("deduplicates across extractors", () => {
      const prompt = "Fix my-project README.md";
      const cwd = "/Users/fischer/work/my-project";
      const context = extractEntities(prompt, cwd);

      // my-project appears in both prompt and cwd - should be deduplicated
      const myProjectCount = context.entities.filter(
        (e) => e === "my-project"
      ).length;
      expect(myProjectCount).toBe(1);
    });

    it("returns valid SearchContext structure", () => {
      const context = extractEntities("test prompt", "/test/path");

      expect(context).toHaveProperty("entities");
      expect(context).toHaveProperty("workingDir");
      expect(context).toHaveProperty("recentFiles");
      expect(context).toHaveProperty("rawPrompt");
      expect(Array.isArray(context.entities)).toBe(true);
      expect(Array.isArray(context.recentFiles)).toBe(true);
    });
  });
});
