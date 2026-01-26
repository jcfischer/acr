/**
 * ACR Tier 1 - Grep Engine Tests
 *
 * TDD tests for T-3.1 (file reader), T-3.2 (parallel grep), T-3.3 (context window)
 */

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import {
  readFileWithTimeout,
  isBinaryFile,
  grepFile,
  grepFiles,
  extractContextWindow,
} from "../src/grep-engine";

// Test fixtures directory
const TEST_DIR = "/tmp/acr-test-fixtures";

beforeAll(() => {
  // Create test directory and files
  mkdirSync(TEST_DIR, { recursive: true });

  // Text file with multiple lines
  writeFileSync(
    join(TEST_DIR, "test.md"),
    `# Test Document

This is line 1.
Daniel is mentioned here.
This is line 3.
More content here.
Scuol appears on this line.
Final line of content.
`
  );

  // Binary file (PNG header)
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  writeFileSync(join(TEST_DIR, "image.png"), pngHeader);

  // Empty file
  writeFileSync(join(TEST_DIR, "empty.txt"), "");

  // Large file for timeout testing
  const largeContent = "x".repeat(50000);
  writeFileSync(join(TEST_DIR, "large.txt"), largeContent);

  // JSON file
  writeFileSync(
    join(TEST_DIR, "config.json"),
    JSON.stringify({ name: "Daniel", location: "Scuol" }, null, 2)
  );
});

afterAll(() => {
  // Cleanup test fixtures
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Grep Engine", () => {
  // =========================================================================
  // T-3.1: File Reader with Timeout
  // =========================================================================
  describe("readFileWithTimeout", () => {
    it("reads a text file successfully", async () => {
      const content = await readFileWithTimeout(join(TEST_DIR, "test.md"));
      expect(content).toContain("Daniel");
      expect(content).toContain("Scuol");
    });

    it("returns null for non-existent file", async () => {
      const content = await readFileWithTimeout(
        join(TEST_DIR, "nonexistent.txt")
      );
      expect(content).toBeNull();
    });

    it("returns empty string for empty file", async () => {
      const content = await readFileWithTimeout(join(TEST_DIR, "empty.txt"));
      expect(content).toBe("");
    });

    it("respects timeout parameter", async () => {
      // This should succeed with reasonable timeout
      const content = await readFileWithTimeout(
        join(TEST_DIR, "test.md"),
        5000
      );
      expect(content).not.toBeNull();
    });
  });

  // =========================================================================
  // Binary File Detection
  // =========================================================================
  describe("isBinaryFile", () => {
    it("detects PNG as binary", async () => {
      const isBinary = await isBinaryFile(join(TEST_DIR, "image.png"));
      expect(isBinary).toBe(true);
    });

    it("detects markdown as text", async () => {
      const isBinary = await isBinaryFile(join(TEST_DIR, "test.md"));
      expect(isBinary).toBe(false);
    });

    it("detects JSON as text", async () => {
      const isBinary = await isBinaryFile(join(TEST_DIR, "config.json"));
      expect(isBinary).toBe(false);
    });

    it("returns false for empty file", async () => {
      const isBinary = await isBinaryFile(join(TEST_DIR, "empty.txt"));
      expect(isBinary).toBe(false);
    });
  });

  // =========================================================================
  // T-3.2: Parallel File Grep
  // =========================================================================
  describe("grepFile", () => {
    it("finds entity matches in file", async () => {
      const matches = await grepFile(join(TEST_DIR, "test.md"), ["Daniel"]);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].entity).toBe("Daniel");
      expect(matches[0].source).toContain("test.md");
    });

    it("finds multiple entities in same file", async () => {
      const matches = await grepFile(join(TEST_DIR, "test.md"), [
        "Daniel",
        "Scuol",
      ]);
      const entities = matches.map((m) => m.entity);
      expect(entities).toContain("Daniel");
      expect(entities).toContain("Scuol");
    });

    it("returns empty array for no matches", async () => {
      const matches = await grepFile(join(TEST_DIR, "test.md"), ["XyzNotFound"]);
      expect(matches).toEqual([]);
    });

    it("skips binary files", async () => {
      const matches = await grepFile(join(TEST_DIR, "image.png"), ["PNG"]);
      expect(matches).toEqual([]);
    });

    it("includes line number in match", async () => {
      const matches = await grepFile(join(TEST_DIR, "test.md"), ["Daniel"]);
      expect(matches[0].line).toBeGreaterThan(0);
    });
  });

  describe("grepFiles", () => {
    it("searches multiple files in parallel", async () => {
      const files = [
        join(TEST_DIR, "test.md"),
        join(TEST_DIR, "config.json"),
      ];
      const matches = await grepFiles(files, ["Daniel"]);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("handles mixed binary and text files", async () => {
      const files = [
        join(TEST_DIR, "test.md"),
        join(TEST_DIR, "image.png"),
        join(TEST_DIR, "config.json"),
      ];
      const matches = await grepFiles(files, ["Daniel"]);
      // Should only have matches from text files
      expect(matches.every((m) => !m.source.endsWith(".png"))).toBe(true);
    });

    it("returns empty array for empty file list", async () => {
      const matches = await grepFiles([], ["Daniel"]);
      expect(matches).toEqual([]);
    });
  });

  // =========================================================================
  // T-3.3: Context Window Extraction
  // =========================================================================
  describe("extractContextWindow", () => {
    const testContent = `Line 1
Line 2
Line 3
Line 4 with MATCH here
Line 5
Line 6
Line 7`;

    it("extracts lines around match", () => {
      const window = extractContextWindow(testContent, 4, 2);
      expect(window).toContain("Line 2");
      expect(window).toContain("Line 3");
      expect(window).toContain("Line 4 with MATCH here");
      expect(window).toContain("Line 5");
      expect(window).toContain("Line 6");
    });

    it("handles match at start of file", () => {
      const content = `MATCH on line 1
Line 2
Line 3`;
      const window = extractContextWindow(content, 1, 2);
      expect(window).toContain("MATCH on line 1");
      expect(window).toContain("Line 2");
    });

    it("handles match at end of file", () => {
      const content = `Line 1
Line 2
MATCH on last line`;
      const window = extractContextWindow(content, 3, 2);
      expect(window).toContain("Line 2");
      expect(window).toContain("MATCH on last line");
    });

    it("respects context line count", () => {
      const window = extractContextWindow(testContent, 4, 1);
      const lines = window.split("\n").filter((l) => l.trim());
      // Should have 1 before + match + 1 after = 3 lines max
      expect(lines.length).toBeLessThanOrEqual(3);
    });
  });
});
