/**
 * ACR F-005 - Maestro Parser Tests
 *
 * TDD RED phase: Tests for parsing Maestro history files.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Import parser functions (will fail until implemented)
import {
  parseMaestroHistoryFile,
  parseHistoryDirectory,
  filterIndexableEntries,
  toEmbeddingInputs,
  isValidMaestroFile,
} from "../src/maestro-parser";

import type { MaestroEntry, MaestroEmbeddingInput } from "../src/maestro-types";
import { MAESTRO_CONFIG } from "../src/maestro-types";

// Test fixtures directory
const TEST_DIR = join(tmpdir(), "acr-maestro-parser-test");

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("parseMaestroHistoryFile", () => {
  test("parses a valid history file", async () => {
    const filePath = join(TEST_DIR, "valid.json");
    await writeFile(
      filePath,
      JSON.stringify({
        entries: [
          {
            summary: "Refactored API endpoints",
            timestamp: 1706270400000,
            type: "USER",
            success: true,
          },
          {
            summary: "Fixed tests",
            timestamp: 1706270500000,
            type: "AUTO",
            success: false,
          },
        ],
      })
    );

    const entries = await parseMaestroHistoryFile(filePath);
    expect(entries).toHaveLength(2);
    expect(entries[0].summary).toBe("Refactored API endpoints");
    expect(entries[0].type).toBe("USER");
    expect(entries[1].success).toBe(false);
  });

  test("returns empty array for empty entries", async () => {
    const filePath = join(TEST_DIR, "empty-entries.json");
    await writeFile(filePath, JSON.stringify({ entries: [] }));

    const entries = await parseMaestroHistoryFile(filePath);
    expect(entries).toHaveLength(0);
  });

  test("returns empty array for malformed JSON", async () => {
    const filePath = join(TEST_DIR, "malformed.json");
    await writeFile(filePath, "{ this is not valid json }");

    const entries = await parseMaestroHistoryFile(filePath);
    expect(entries).toHaveLength(0);
  });

  test("returns empty array for missing entries field", async () => {
    const filePath = join(TEST_DIR, "no-entries.json");
    await writeFile(filePath, JSON.stringify({ version: "1.0" }));

    const entries = await parseMaestroHistoryFile(filePath);
    expect(entries).toHaveLength(0);
  });

  test("returns empty array for non-existent file", async () => {
    const entries = await parseMaestroHistoryFile(
      join(TEST_DIR, "does-not-exist.json")
    );
    expect(entries).toHaveLength(0);
  });

  test("filters out invalid entries from valid file", async () => {
    const filePath = join(TEST_DIR, "mixed-validity.json");
    await writeFile(
      filePath,
      JSON.stringify({
        entries: [
          { summary: "Valid entry", timestamp: 1706270400000, type: "USER", success: true },
          { summary: "Missing timestamp", type: "USER", success: true },
          { summary: "Invalid type", timestamp: 1706270400000, type: "INVALID", success: true },
          { summary: "Another valid", timestamp: 1706270500000, type: "AUTO", success: false },
        ],
      })
    );

    const entries = await parseMaestroHistoryFile(filePath);
    // Should only return fully valid entries
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });
});

describe("filterIndexableEntries", () => {
  test("filters out entries with short summaries", () => {
    const entries: MaestroEntry[] = [
      { summary: "This is a long enough summary", timestamp: 1706270400000, type: "USER", success: true },
      { summary: "Short", timestamp: 1706270400000, type: "USER", success: true },
      { summary: "", timestamp: 1706270400000, type: "USER", success: true },
      { summary: "abc", timestamp: 1706270400000, type: "AUTO", success: false },
    ];

    const filtered = filterIndexableEntries(entries);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].summary).toBe("This is a long enough summary");
  });

  test("uses configurable minimum length", () => {
    const entries: MaestroEntry[] = [
      { summary: "12345", timestamp: 1706270400000, type: "USER", success: true },
      { summary: "123456", timestamp: 1706270400000, type: "USER", success: true },
      { summary: "123456789012345", timestamp: 1706270400000, type: "USER", success: true },
    ];

    // Default is 10 (length must be > 10, not >=)
    const filtered = filterIndexableEntries(entries);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].summary).toBe("123456789012345");

    // Custom threshold of 5 (length must be > 5)
    const filteredCustom = filterIndexableEntries(entries, 5);
    expect(filteredCustom).toHaveLength(2); // "123456" (6 chars) and "123456789012345" (15 chars)
  });

  test("returns empty array for empty input", () => {
    const filtered = filterIndexableEntries([]);
    expect(filtered).toHaveLength(0);
  });

  test("includes both successful and failed entries", () => {
    const entries: MaestroEntry[] = [
      { summary: "Successful long task", timestamp: 1706270400000, type: "USER", success: true },
      { summary: "Failed long task too", timestamp: 1706270500000, type: "AUTO", success: false },
    ];

    const filtered = filterIndexableEntries(entries);
    expect(filtered).toHaveLength(2);
  });
});

describe("toEmbeddingInputs", () => {
  test("converts entries to embedding inputs", () => {
    const entries: MaestroEntry[] = [
      { summary: "First task summary", timestamp: 1706270400000, type: "USER", success: true },
      { summary: "Second task summary", timestamp: 1706270500000, type: "AUTO", success: false },
    ];
    const sessionFile = "abc123-def456.json";

    const inputs = toEmbeddingInputs(entries, sessionFile);

    expect(inputs).toHaveLength(2);
    expect(inputs[0].content).toBe("First task summary");
    expect(inputs[0].source).toBe("maestro");
    expect(inputs[0].sourceId).toBe("maestro:abc123-def456:0");
    expect(inputs[0].sessionFile).toBe("abc123-def456.json");
    expect(inputs[0].entryType).toBe("USER");
    expect(inputs[0].success).toBe(true);
    expect(inputs[0].timestamp.getTime()).toBe(1706270400000);

    expect(inputs[1].sourceId).toBe("maestro:abc123-def456:1");
    expect(inputs[1].entryType).toBe("AUTO");
    expect(inputs[1].success).toBe(false);
  });

  test("includes working directory when provided", () => {
    const entries: MaestroEntry[] = [
      { summary: "Task with context", timestamp: 1706270400000, type: "USER", success: true },
    ];

    const inputs = toEmbeddingInputs(entries, "session.json", "/Users/test/project");

    expect(inputs[0].workingDirectory).toBe("/Users/test/project");
  });

  test("returns empty array for empty entries", () => {
    const inputs = toEmbeddingInputs([], "session.json");
    expect(inputs).toHaveLength(0);
  });
});

describe("isValidMaestroFile", () => {
  test("returns true for valid JSON file", async () => {
    const filePath = join(TEST_DIR, "valid-check.json");
    await writeFile(
      filePath,
      JSON.stringify({ entries: [{ summary: "Test", timestamp: 1, type: "USER", success: true }] })
    );

    const isValid = await isValidMaestroFile(filePath);
    expect(isValid).toBe(true);
  });

  test("returns false for malformed JSON", async () => {
    const filePath = join(TEST_DIR, "invalid-check.json");
    await writeFile(filePath, "not json");

    const isValid = await isValidMaestroFile(filePath);
    expect(isValid).toBe(false);
  });

  test("returns false for non-existent file", async () => {
    const isValid = await isValidMaestroFile(join(TEST_DIR, "nonexistent.json"));
    expect(isValid).toBe(false);
  });

  test("returns false for missing entries field", async () => {
    const filePath = join(TEST_DIR, "no-entries-check.json");
    await writeFile(filePath, JSON.stringify({ version: "1.0" }));

    const isValid = await isValidMaestroFile(filePath);
    expect(isValid).toBe(false);
  });
});

describe("parseHistoryDirectory", () => {
  test("parses all valid files in directory", async () => {
    const dir = join(TEST_DIR, "history-dir");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "session1.json"),
      JSON.stringify({
        entries: [{ summary: "Task from session 1", timestamp: 1706270400000, type: "USER", success: true }],
      })
    );
    await writeFile(
      join(dir, "session2.json"),
      JSON.stringify({
        entries: [{ summary: "Task from session 2", timestamp: 1706270500000, type: "AUTO", success: false }],
      })
    );

    const result = await parseHistoryDirectory(dir);

    expect(result.size).toBe(2);
    expect(result.get("session1.json")).toHaveLength(1);
    expect(result.get("session2.json")).toHaveLength(1);
  });

  test("skips non-JSON files", async () => {
    const dir = join(TEST_DIR, "mixed-files");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "valid.json"),
      JSON.stringify({
        entries: [{ summary: "Valid JSON entry", timestamp: 1706270400000, type: "USER", success: true }],
      })
    );
    await writeFile(join(dir, "readme.md"), "# Not JSON");
    await writeFile(join(dir, "config.txt"), "text file");

    const result = await parseHistoryDirectory(dir);

    expect(result.size).toBe(1);
    expect(result.has("valid.json")).toBe(true);
  });

  test("returns empty map for non-existent directory", async () => {
    const result = await parseHistoryDirectory(join(TEST_DIR, "nonexistent-dir"));
    expect(result.size).toBe(0);
  });

  test("skips malformed JSON files", async () => {
    const dir = join(TEST_DIR, "with-malformed");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "valid.json"),
      JSON.stringify({
        entries: [{ summary: "Valid entry here", timestamp: 1706270400000, type: "USER", success: true }],
      })
    );
    await writeFile(join(dir, "malformed.json"), "{ broken json }");

    const result = await parseHistoryDirectory(dir);

    expect(result.size).toBe(1);
    expect(result.has("valid.json")).toBe(true);
  });
});
