/**
 * ACR Logger - Tests
 *
 * TDD RED: Tests written BEFORE implementation
 * Phase 2 of F-008 Logging, Metrics & Debug Mode
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Import types and functions (will fail until implementation exists)
import type { QueryLogEntry } from "../src/logger";
import { Logger } from "../src/logger";
import { resetConfigCache } from "../src/logging-config";

describe("ACR Logger", () => {
  let testDir: string;
  let testLogPath: string;
  let testConfigPath: string;

  beforeEach(() => {
    // Reset config cache
    resetConfigCache();

    // Create temp directory for test files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "acr-logger-test-"));
    testLogPath = path.join(testDir, "acr.log");
    testConfigPath = path.join(testDir, "config.json");
  });

  afterEach(() => {
    // Cleanup temp directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("QueryLogEntry interface", () => {
    it("has correct structure", () => {
      const entry: QueryLogEntry = {
        ts: "2026-01-27T00:00:00.000Z",
        query: "test query",
        tier1: {
          matches: 5,
          confidence: 0.8,
          ms: 30,
        },
        tier2: null,
        totalMs: 30,
      };

      expect(entry.ts).toBeDefined();
      expect(entry.query).toBeDefined();
      expect(entry.tier1.matches).toBe(5);
      expect(entry.tier1.confidence).toBe(0.8);
      expect(entry.tier1.ms).toBe(30);
      expect(entry.tier2).toBeNull();
      expect(entry.totalMs).toBe(30);
    });

    it("supports tier2 results", () => {
      const entry: QueryLogEntry = {
        ts: "2026-01-27T00:00:00.000Z",
        query: "test query with tier2",
        tier1: {
          matches: 5,
          confidence: 0.5,
          ms: 30,
        },
        tier2: {
          matches: 10,
          topSim: 0.85,
          ms: 120,
        },
        totalMs: 150,
      };

      expect(entry.tier2).not.toBeNull();
      expect(entry.tier2!.matches).toBe(10);
      expect(entry.tier2!.topSim).toBe(0.85);
      expect(entry.tier2!.ms).toBe(120);
    });
  });

  describe("Logger class", () => {
    describe("constructor", () => {
      it("creates Logger instance with config", () => {
        // Write config enabling logging with test path
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            logging: {
              enabled: true,
              path: testLogPath,
              maxSize: 1000,
              maxFiles: 3,
            },
          })
        );

        const logger = new Logger(testConfigPath);
        expect(logger).toBeDefined();
      });
    });

    describe("log()", () => {
      it("writes JSONL entry to file", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            logging: {
              enabled: true,
              path: testLogPath,
              maxSize: 10_000_000,
              maxFiles: 3,
            },
          })
        );

        const logger = new Logger(testConfigPath);
        const entry: QueryLogEntry = {
          ts: "2026-01-27T12:00:00.000Z",
          query: "test query",
          tier1: { matches: 5, confidence: 0.8, ms: 30 },
          tier2: null,
          totalMs: 30,
        };

        logger.log(entry);

        expect(fs.existsSync(testLogPath)).toBe(true);
        const content = fs.readFileSync(testLogPath, "utf-8");
        const parsed = JSON.parse(content.trim());
        expect(parsed.query).toBe("test query");
        expect(parsed.tier1.matches).toBe(5);
      });

      it("appends multiple entries as JSONL", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            logging: {
              enabled: true,
              path: testLogPath,
              maxSize: 10_000_000,
              maxFiles: 3,
            },
          })
        );

        const logger = new Logger(testConfigPath);

        logger.log({
          ts: "2026-01-27T12:00:00.000Z",
          query: "first query",
          tier1: { matches: 5, confidence: 0.8, ms: 30 },
          tier2: null,
          totalMs: 30,
        });

        logger.log({
          ts: "2026-01-27T12:01:00.000Z",
          query: "second query",
          tier1: { matches: 10, confidence: 0.6, ms: 40 },
          tier2: { matches: 8, topSim: 0.75, ms: 100 },
          totalMs: 140,
        });

        const lines = fs
          .readFileSync(testLogPath, "utf-8")
          .trim()
          .split("\n");
        expect(lines.length).toBe(2);

        const first = JSON.parse(lines[0]);
        const second = JSON.parse(lines[1]);
        expect(first.query).toBe("first query");
        expect(second.query).toBe("second query");
        expect(second.tier2).not.toBeNull();
      });

      it("does nothing when logging disabled", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            logging: {
              enabled: false,
              path: testLogPath,
              maxSize: 10_000_000,
              maxFiles: 3,
            },
          })
        );

        const logger = new Logger(testConfigPath);
        logger.log({
          ts: "2026-01-27T12:00:00.000Z",
          query: "test",
          tier1: { matches: 1, confidence: 0.5, ms: 10 },
          tier2: null,
          totalMs: 10,
        });

        expect(fs.existsSync(testLogPath)).toBe(false);
      });

      it("creates parent directories if needed", () => {
        const nestedLogPath = path.join(testDir, "nested", "deep", "acr.log");
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            logging: {
              enabled: true,
              path: nestedLogPath,
              maxSize: 10_000_000,
              maxFiles: 3,
            },
          })
        );

        const logger = new Logger(testConfigPath);
        logger.log({
          ts: "2026-01-27T12:00:00.000Z",
          query: "test",
          tier1: { matches: 1, confidence: 0.5, ms: 10 },
          tier2: null,
          totalMs: 10,
        });

        expect(fs.existsSync(nestedLogPath)).toBe(true);
      });
    });

    describe("rotation", () => {
      it("rotates file when maxSize exceeded", () => {
        // Set very small maxSize to trigger rotation
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            logging: {
              enabled: true,
              path: testLogPath,
              maxSize: 100, // 100 bytes to trigger rotation quickly
              maxFiles: 3,
            },
          })
        );

        const logger = new Logger(testConfigPath);

        // Write entries until rotation happens
        for (let i = 0; i < 5; i++) {
          logger.log({
            ts: `2026-01-27T12:0${i}:00.000Z`,
            query: `query number ${i} with some extra text to make it bigger`,
            tier1: { matches: i, confidence: 0.5, ms: 10 },
            tier2: null,
            totalMs: 10,
          });
        }

        // Check rotation file exists
        expect(fs.existsSync(`${testLogPath}.1`)).toBe(true);
      });

      it("keeps only maxFiles rotated files", () => {
        // Set very small maxSize and maxFiles
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            logging: {
              enabled: true,
              path: testLogPath,
              maxSize: 50, // Very small to trigger multiple rotations
              maxFiles: 2,
            },
          })
        );

        const logger = new Logger(testConfigPath);

        // Write many entries to trigger multiple rotations
        for (let i = 0; i < 20; i++) {
          logger.log({
            ts: `2026-01-27T12:${String(i).padStart(2, "0")}:00.000Z`,
            query: `query ${i} extra padding text for size`,
            tier1: { matches: i, confidence: 0.5, ms: 10 },
            tier2: null,
            totalMs: 10,
          });
        }

        // Should have main file + maxFiles rotated files
        expect(fs.existsSync(testLogPath)).toBe(true);
        expect(fs.existsSync(`${testLogPath}.1`)).toBe(true);
        expect(fs.existsSync(`${testLogPath}.2`)).toBe(true);
        // .3 should NOT exist since maxFiles is 2
        expect(fs.existsSync(`${testLogPath}.3`)).toBe(false);
      });
    });

    describe("expandPath", () => {
      it("expands ~ in log path", () => {
        // Config with ~ path (won't work for actual writing in test, but verifies expansion)
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            logging: {
              enabled: true,
              path: "~/.config/acr/test.log",
              maxSize: 10_000_000,
              maxFiles: 3,
            },
          })
        );

        // Logger should expand the path internally
        // We verify this works by checking the Logger doesn't throw
        const logger = new Logger(testConfigPath);
        expect(logger).toBeDefined();
      });
    });
  });

  describe("getRecentEntries()", () => {
    it("returns last n entries from log", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          logging: {
            enabled: true,
            path: testLogPath,
            maxSize: 10_000_000,
            maxFiles: 3,
          },
        })
      );

      const logger = new Logger(testConfigPath);

      // Write several entries
      for (let i = 0; i < 5; i++) {
        logger.log({
          ts: `2026-01-27T12:0${i}:00.000Z`,
          query: `query ${i}`,
          tier1: { matches: i, confidence: 0.5, ms: 10 },
          tier2: null,
          totalMs: 10,
        });
      }

      const recent = logger.getRecentEntries(3);
      expect(recent.length).toBe(3);
      // Should be most recent first
      expect(recent[0].query).toBe("query 4");
      expect(recent[1].query).toBe("query 3");
      expect(recent[2].query).toBe("query 2");
    });

    it("returns empty array when log file does not exist", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          logging: {
            enabled: true,
            path: testLogPath,
            maxSize: 10_000_000,
            maxFiles: 3,
          },
        })
      );

      const logger = new Logger(testConfigPath);
      const recent = logger.getRecentEntries(10);
      expect(recent).toEqual([]);
    });

    it("returns all entries when n > total entries", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          logging: {
            enabled: true,
            path: testLogPath,
            maxSize: 10_000_000,
            maxFiles: 3,
          },
        })
      );

      const logger = new Logger(testConfigPath);
      logger.log({
        ts: "2026-01-27T12:00:00.000Z",
        query: "only query",
        tier1: { matches: 1, confidence: 0.5, ms: 10 },
        tier2: null,
        totalMs: 10,
      });

      const recent = logger.getRecentEntries(100);
      expect(recent.length).toBe(1);
    });
  });
});
