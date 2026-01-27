/**
 * ACR CLI Commands - Tests
 *
 * Tests for F-008 CLI commands: --metrics, --log, --config, --metrics-reset
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { resetConfigCache } from "../src/logging-config";
import { Logger } from "../src/logger";
import { MetricsStore } from "../src/metrics";

describe("ACR CLI Commands", () => {
  let testDir: string;
  let testConfigPath: string;
  let testLogPath: string;
  let testDbPath: string;

  beforeEach(() => {
    resetConfigCache();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "acr-cli-test-"));
    testConfigPath = path.join(testDir, "config.json");
    testLogPath = path.join(testDir, "acr.log");
    testDbPath = path.join(testDir, "metrics.db");

    // Create config file for testing
    fs.writeFileSync(
      testConfigPath,
      JSON.stringify({
        debug: false,
        logging: {
          enabled: true,
          path: testLogPath,
          maxSize: 10485760,
          maxFiles: 5,
        },
        metrics: {
          enabled: true,
          path: testDbPath,
          retentionDays: 30,
        },
      })
    );
  });

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("--metrics command", () => {
    it("shows metrics summary with no data", () => {
      const metrics = new MetricsStore(testConfigPath);
      const summary = metrics.getSummary(7);

      expect(summary.totalQueries).toBe(0);
      expect(summary.avgTotalMs).toBe(0);
      expect(summary.tier2EscalationRate).toBe(0);
      metrics.close();
    });

    it("shows correct averages after queries", () => {
      const metrics = new MetricsStore(testConfigPath);

      // Record some queries
      metrics.record({
        queryHash: "abc",
        queryLength: 20,
        tier1Matches: 10,
        tier1Confidence: 0.8,
        tier1Ms: 50,
        tier2Escalated: false,
        totalMs: 50,
      });

      metrics.record({
        queryHash: "def",
        queryLength: 30,
        tier1Matches: 20,
        tier1Confidence: 0.6,
        tier1Ms: 100,
        tier2Escalated: true,
        tier2Matches: 5,
        tier2TopSimilarity: 0.9,
        tier2Ms: 200,
        totalMs: 300,
      });

      const summary = metrics.getSummary(7);
      expect(summary.totalQueries).toBe(2);
      expect(summary.tier1.avgMatches).toBe(15);
      expect(summary.tier2EscalationRate).toBe(0.5);
      metrics.close();
    });
  });

  describe("--log command", () => {
    it("returns empty array when no log file", () => {
      const logger = new Logger(testConfigPath);
      const entries = logger.getRecentEntries(10);
      expect(entries).toEqual([]);
    });

    it("returns entries in reverse chronological order", () => {
      const logger = new Logger(testConfigPath);

      // Log some entries
      logger.log({
        ts: "2024-01-01T10:00:00Z",
        query: "first query",
        tier1: { matches: 5, confidence: 0.8, ms: 50 },
        tier2: null,
        totalMs: 50,
      });

      logger.log({
        ts: "2024-01-01T11:00:00Z",
        query: "second query",
        tier1: { matches: 10, confidence: 0.9, ms: 60 },
        tier2: null,
        totalMs: 60,
      });

      const entries = logger.getRecentEntries(10);
      expect(entries.length).toBe(2);
      // Most recent first
      expect(entries[0].query).toBe("second query");
      expect(entries[1].query).toBe("first query");
    });

    it("respects n limit", () => {
      const logger = new Logger(testConfigPath);

      // Log multiple entries
      for (let i = 0; i < 5; i++) {
        logger.log({
          ts: new Date().toISOString(),
          query: `query ${i}`,
          tier1: { matches: i, confidence: 0.5, ms: 10 },
          tier2: null,
          totalMs: 10,
        });
      }

      const entries = logger.getRecentEntries(3);
      expect(entries.length).toBe(3);
    });
  });

  describe("--config command", () => {
    it("returns valid config object", () => {
      // Import dynamically to use test config
      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const config = getLoggingConfig(testConfigPath);

      expect(config).toBeDefined();
      expect(config.logging).toBeDefined();
      expect(config.logging.enabled).toBe(true);
      expect(config.metrics).toBeDefined();
      expect(config.metrics.enabled).toBe(true);
    });
  });

  describe("--metrics-reset command", () => {
    it("clears all metrics data", () => {
      const metrics = new MetricsStore(testConfigPath);

      // Record some data
      metrics.record({
        queryHash: "test",
        queryLength: 20,
        tier1Matches: 10,
        tier1Confidence: 0.8,
        tier1Ms: 50,
        tier2Escalated: false,
        totalMs: 50,
      });

      // Verify data exists
      let summary = metrics.getSummary(7);
      expect(summary.totalQueries).toBe(1);

      // Reset
      metrics.reset();

      // Verify data is cleared
      summary = metrics.getSummary(7);
      expect(summary.totalQueries).toBe(0);
      metrics.close();
    });
  });
});
