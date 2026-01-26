/**
 * Tests for memory-parser.ts
 * F-006 PAI Memory Indexing - Parser Module
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  extractFrontmatter,
  parseFrontmatterTimestamp,
  extractTitle,
  parseMemoryFile,
  scanMemoryDirectory,
  scanAllMemoryDirectories,
  toEmbeddingInputs,
} from "../src/memory-parser";
import type { MemoryEntry } from "../src/memory-types";

// ============================================================================
// Test Fixtures
// ============================================================================

let testDir: string;

beforeAll(async () => {
  testDir = await mkdtemp(join(tmpdir(), "memory-parser-test-"));
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

const VALID_FRONTMATTER = `---
capture_type: LEARNING
timestamp: 2026-01-04 12:14:37
session_id: 52c3464f-c6d5-4b8b-9766-831b1086802e
executor: main
---

# Test Learning Title

This is the content of the learning.`;

const NO_FRONTMATTER = `# Just a Title

Content without frontmatter. This needs to be long enough to pass the minimum content length filter that is applied during parsing.`;

const MALFORMED_FRONTMATTER = `---
capture_type: LEARNING
timestamp: not-a-date
---

# Malformed

Content here.`;

// ============================================================================
// extractFrontmatter Tests
// ============================================================================

describe("extractFrontmatter", () => {
  test("extracts valid frontmatter", () => {
    const result = extractFrontmatter(VALID_FRONTMATTER);
    expect(result.frontmatter.capture_type).toBe("LEARNING");
    expect(result.frontmatter.session_id).toBe("52c3464f-c6d5-4b8b-9766-831b1086802e");
  });

  test("returns body without frontmatter markers", () => {
    const result = extractFrontmatter(VALID_FRONTMATTER);
    expect(result.body).toContain("# Test Learning Title");
    expect(result.body).not.toContain("---");
  });

  test("handles content without frontmatter", () => {
    const result = extractFrontmatter(NO_FRONTMATTER);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(NO_FRONTMATTER);
  });

  test("handles empty content", () => {
    const result = extractFrontmatter("");
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("");
  });

  test("handles frontmatter with only opening marker", () => {
    const content = "---\nkey: value\nno closing marker";
    const result = extractFrontmatter(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });
});

// ============================================================================
// parseFrontmatterTimestamp Tests
// ============================================================================

describe("parseFrontmatterTimestamp", () => {
  test("parses YYYY-MM-DD HH:mm:ss format", () => {
    const ts = parseFrontmatterTimestamp("2026-01-04 12:14:37");
    expect(ts).toBeGreaterThan(0);
    // Verify it's roughly correct (within a day of expected)
    const date = new Date(ts!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(4);
  });

  test("parses ISO format", () => {
    const ts = parseFrontmatterTimestamp("2026-01-04T12:14:37Z");
    expect(ts).toBeGreaterThan(0);
  });

  test("parses date-only format", () => {
    const ts = parseFrontmatterTimestamp("2026-01-04");
    expect(ts).toBeGreaterThan(0);
  });

  test("returns null for invalid format", () => {
    expect(parseFrontmatterTimestamp("not-a-date")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseFrontmatterTimestamp("")).toBeNull();
  });

  test("handles numeric timestamp", () => {
    const ts = parseFrontmatterTimestamp("1704369277000");
    expect(ts).toBe(1704369277000);
  });
});

// ============================================================================
// extractTitle Tests
// ============================================================================

describe("extractTitle", () => {
  test("extracts title from first heading", () => {
    const title = extractTitle("# My Title\n\nContent here", "fallback.md");
    expect(title).toBe("My Title");
  });

  test("extracts title with extra spaces", () => {
    const title = extractTitle("#   Spaced Title  \n\nContent", "fallback.md");
    expect(title).toBe("Spaced Title");
  });

  test("uses filename as fallback", () => {
    const title = extractTitle("No heading here", "my-file-name.md");
    expect(title).toBe("my-file-name");
  });

  test("cleans filename fallback", () => {
    const title = extractTitle("No heading", "2026-01-04_some-title-here.md");
    expect(title).toContain("some-title-here");
  });

  test("handles empty content", () => {
    const title = extractTitle("", "fallback.md");
    expect(title).toBe("fallback");
  });

  test("ignores non-h1 headings", () => {
    const title = extractTitle("## H2 Title\n### H3", "fallback.md");
    expect(title).toBe("fallback");
  });
});

// ============================================================================
// parseMemoryFile Tests
// ============================================================================

describe("parseMemoryFile", () => {
  test("parses valid file with frontmatter", async () => {
    const filePath = join(testDir, "Learning", "valid.md");
    await mkdir(join(testDir, "Learning"), { recursive: true });
    await writeFile(filePath, VALID_FRONTMATTER);

    const entry = await parseMemoryFile(filePath);
    expect(entry).not.toBeNull();
    expect(entry!.captureType).toBe("LEARNING");
    expect(entry!.title).toBe("Test Learning Title");
    expect(entry!.sessionId).toBe("52c3464f-c6d5-4b8b-9766-831b1086802e");
  });

  test("parses file without frontmatter using path inference", async () => {
    const filePath = join(testDir, "Decisions", "no-frontmatter.md");
    await mkdir(join(testDir, "Decisions"), { recursive: true });
    await writeFile(filePath, NO_FRONTMATTER);

    const entry = await parseMemoryFile(filePath);
    expect(entry).not.toBeNull();
    expect(entry!.captureType).toBe("DECISION");
    expect(entry!.title).toBe("Just a Title");
  });

  test("returns null for non-existent file", async () => {
    const entry = await parseMemoryFile("/non/existent/file.md");
    expect(entry).toBeNull();
  });

  test("returns null for file below minimum content length", async () => {
    const filePath = join(testDir, "short.md");
    await writeFile(filePath, "# Hi\n\nToo short");

    const entry = await parseMemoryFile(filePath, 100);
    expect(entry).toBeNull();
  });

  test("uses file mtime when no timestamp in frontmatter", async () => {
    const filePath = join(testDir, "no-timestamp.md");
    await writeFile(filePath, "# No Timestamp\n\nContent without timestamp in frontmatter that is long enough.");

    const entry = await parseMemoryFile(filePath, 10);
    expect(entry).not.toBeNull();
    expect(entry!.timestamp).toBeGreaterThan(0);
  });
});

// ============================================================================
// scanMemoryDirectory Tests
// ============================================================================

describe("scanMemoryDirectory", () => {
  test("finds all .md files in directory", async () => {
    const scanDir = join(testDir, "scan-test");
    await mkdir(scanDir, { recursive: true });
    await writeFile(join(scanDir, "file1.md"), "content");
    await writeFile(join(scanDir, "file2.md"), "content");
    await writeFile(join(scanDir, "file3.txt"), "content"); // Should be ignored

    const files = await scanMemoryDirectory(scanDir);
    expect(files.length).toBe(2);
    expect(files.every(f => f.endsWith(".md"))).toBe(true);
  });

  test("scans nested directories", async () => {
    const scanDir = join(testDir, "nested-test");
    await mkdir(join(scanDir, "2026-01"), { recursive: true });
    await writeFile(join(scanDir, "root.md"), "content");
    await writeFile(join(scanDir, "2026-01", "nested.md"), "content");

    const files = await scanMemoryDirectory(scanDir);
    expect(files.length).toBe(2);
  });

  test("returns empty array for non-existent directory", async () => {
    const files = await scanMemoryDirectory("/non/existent/dir");
    expect(files).toEqual([]);
  });

  test("returns empty array for empty directory", async () => {
    const emptyDir = join(testDir, "empty-dir");
    await mkdir(emptyDir, { recursive: true });

    const files = await scanMemoryDirectory(emptyDir);
    expect(files).toEqual([]);
  });
});

// ============================================================================
// scanAllMemoryDirectories Tests
// ============================================================================

describe("scanAllMemoryDirectories", () => {
  test("scans multiple directories", async () => {
    const baseDir = join(testDir, "multi-scan");
    await mkdir(join(baseDir, "Learning"), { recursive: true });
    await mkdir(join(baseDir, "Decisions"), { recursive: true });
    await writeFile(join(baseDir, "Learning", "learn.md"), "content");
    await writeFile(join(baseDir, "Decisions", "decide.md"), "content");

    const result = await scanAllMemoryDirectories(baseDir, ["Learning", "Decisions"]);
    expect(result.get("Learning")?.length).toBe(1);
    expect(result.get("Decisions")?.length).toBe(1);
  });

  test("handles missing directories gracefully", async () => {
    const baseDir = join(testDir, "partial-scan");
    await mkdir(join(baseDir, "Learning"), { recursive: true });
    await writeFile(join(baseDir, "Learning", "file.md"), "content");

    const result = await scanAllMemoryDirectories(baseDir, ["Learning", "Missing"]);
    expect(result.get("Learning")?.length).toBe(1);
    expect(result.get("Missing")).toEqual([]);
  });
});

// ============================================================================
// toEmbeddingInputs Tests
// ============================================================================

describe("toEmbeddingInputs", () => {
  test("converts entries to embedding inputs", () => {
    const entries: MemoryEntry[] = [
      {
        filePath: "/path/to/Learning/file.md",
        captureType: "LEARNING",
        timestamp: Date.now(),
        title: "Test",
        content: "Content here",
      },
    ];

    const inputs = toEmbeddingInputs(entries);
    expect(inputs.length).toBe(1);
    expect(inputs[0].sourceId).toContain("memory:LEARNING:");
    expect(inputs[0].content).toBe("Content here");
    expect(inputs[0].metadata.captureType).toBe("LEARNING");
  });

  test("handles multiple entries", () => {
    const entries: MemoryEntry[] = [
      {
        filePath: "/path/Learning/a.md",
        captureType: "LEARNING",
        timestamp: Date.now(),
        title: "A",
        content: "Content A",
      },
      {
        filePath: "/path/Decisions/b.md",
        captureType: "DECISION",
        timestamp: Date.now(),
        title: "B",
        content: "Content B",
      },
    ];

    const inputs = toEmbeddingInputs(entries);
    expect(inputs.length).toBe(2);
    expect(inputs[0].sourceId).toContain("LEARNING");
    expect(inputs[1].sourceId).toContain("DECISION");
  });

  test("generates unique source IDs", () => {
    const entries: MemoryEntry[] = [
      {
        filePath: "/path/Learning/file1.md",
        captureType: "LEARNING",
        timestamp: Date.now(),
        title: "File 1",
        content: "Content 1",
      },
      {
        filePath: "/path/Learning/file2.md",
        captureType: "LEARNING",
        timestamp: Date.now(),
        title: "File 2",
        content: "Content 2",
      },
    ];

    const inputs = toEmbeddingInputs(entries);
    expect(inputs[0].sourceId).not.toBe(inputs[1].sourceId);
  });
});
