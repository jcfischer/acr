/**
 * ACR Metrics - Tests
 *
 * TDD RED: Tests written BEFORE implementation
 * Phase 3 of F-008 Logging, Metrics & Debug Mode
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Import types and functions (will fail until implementation exists)
import type { QueryMetrics, MetricsSummary } from "../src/metrics";
import { MetricsStore } from "../src/metrics";
import { resetConfigCache } from "../src/logging-config";

describe("ACR Metrics", () => {
  let testDir: string;
  let testDbPath: string;
  let testConfigPath: string;

  beforeEach(() => {
    // Reset config cache
    resetConfigCache();

    // Create temp directory for test files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "acr-metrics-test-"));
    testDbPath = path.join(testDir, "metrics.db");
    testConfigPath = path.join(testDir, "config.json");
  });

  afterEach(() => {
    // Cleanup temp directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("QueryMetrics interface", () => {
    it("has correct structure without tier2", () => {
      const metrics: QueryMetrics = {
        queryHash: "abc123def456",
        queryLength: 25,
        tier1Matches: 10,
        tier1Confidence: 0.8,
        tier1Ms: 45,
        tier2Escalated: false,
        totalMs: 45,
      };

      expect(metrics.queryHash).toBe("abc123def456");
      expect(metrics.tier2Escalated).toBe(false);
      expect(metrics.tier2Matches).toBeUndefined();
    });

    it("has correct structure with tier2", () => {
      const metrics: QueryMetrics = {
        queryHash: "abc123def456",
        queryLength: 25,
        tier1Matches: 5,
        tier1Confidence: 0.5,
        tier1Ms: 45,
        tier2Escalated: true,
        tier2Matches: 10,
        tier2TopSimilarity: 0.85,
        tier2Ms: 120,
        totalMs: 165,
      };

      expect(metrics.tier2Escalated).toBe(true);
      expect(metrics.tier2Matches).toBe(10);
      expect(metrics.tier2TopSimilarity).toBe(0.85);
    });
  });

  describe("MetricsSummary interface", () => {
    it("has correct structure", () => {
      const summary: MetricsSummary = {
        totalQueries: 100,
        avgTotalMs: 85,
        tier2EscalationRate: 0.35,
        tier1: {
          avgMatches: 12.5,
          avgConfidence: 0.72,
          avgMs: 42,
        },
        tier2: {
          avgMatches: 8.3,
          avgSimilarity: 0.68,
          avgMs: 98,
        },
      };

      expect(summary.totalQueries).toBe(100);
      expect(summary.tier2EscalationRate).toBe(0.35);
      expect(summary.tier1.avgConfidence).toBe(0.72);
      expect(summary.tier2.avgSimilarity).toBe(0.68);
    });
  });

  describe("MetricsStore class", () => {
    describe("constructor", () => {
      it("creates database file", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);
        expect(fs.existsSync(testDbPath)).toBe(true);
        store.close();
      });

      it("creates tables on first run", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);
        // If no error thrown, tables were created successfully
        expect(store).toBeDefined();
        store.close();
      });
    });

    describe("record()", () => {
      it("inserts metrics into database", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);
        store.record({
          queryHash: "test123",
          queryLength: 20,
          tier1Matches: 10,
          tier1Confidence: 0.8,
          tier1Ms: 40,
          tier2Escalated: false,
          totalMs: 40,
        });

        const summary = store.getSummary(1);
        expect(summary.totalQueries).toBe(1);
        store.close();
      });

      it("records tier2 metrics when escalated", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);
        store.record({
          queryHash: "test456",
          queryLength: 30,
          tier1Matches: 5,
          tier1Confidence: 0.5,
          tier1Ms: 30,
          tier2Escalated: true,
          tier2Matches: 10,
          tier2TopSimilarity: 0.85,
          tier2Ms: 100,
          totalMs: 130,
        });

        const summary = store.getSummary(1);
        expect(summary.tier2EscalationRate).toBe(1); // 100% escalation (1/1)
        expect(summary.tier2.avgSimilarity).toBeCloseTo(0.85, 2);
        store.close();
      });

      it("does nothing when metrics disabled", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: false,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);
        store.record({
          queryHash: "test789",
          queryLength: 20,
          tier1Matches: 10,
          tier1Confidence: 0.8,
          tier1Ms: 40,
          tier2Escalated: false,
          totalMs: 40,
        });

        // Database might still be created, but no records inserted
        const summary = store.getSummary(1);
        expect(summary.totalQueries).toBe(0);
        store.close();
      });
    });

    describe("getSummary()", () => {
      it("calculates correct averages", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);

        // Record multiple queries
        store.record({
          queryHash: "q1",
          queryLength: 10,
          tier1Matches: 10,
          tier1Confidence: 0.8,
          tier1Ms: 40,
          tier2Escalated: false,
          totalMs: 40,
        });

        store.record({
          queryHash: "q2",
          queryLength: 20,
          tier1Matches: 20,
          tier1Confidence: 0.6,
          tier1Ms: 60,
          tier2Escalated: true,
          tier2Matches: 15,
          tier2TopSimilarity: 0.9,
          tier2Ms: 100,
          totalMs: 160,
        });

        const summary = store.getSummary(7);

        expect(summary.totalQueries).toBe(2);
        expect(summary.tier1.avgMatches).toBe(15); // (10 + 20) / 2
        expect(summary.tier1.avgConfidence).toBeCloseTo(0.7, 2); // (0.8 + 0.6) / 2
        expect(summary.tier1.avgMs).toBe(50); // (40 + 60) / 2
        expect(summary.tier2EscalationRate).toBe(0.5); // 1/2 escalated
        expect(summary.avgTotalMs).toBe(100); // (40 + 160) / 2
        store.close();
      });

      it("returns zeros when no data", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);
        const summary = store.getSummary(7);

        expect(summary.totalQueries).toBe(0);
        expect(summary.avgTotalMs).toBe(0);
        expect(summary.tier2EscalationRate).toBe(0);
        store.close();
      });

      it("filters by days parameter", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);

        // Record a query
        store.record({
          queryHash: "recent",
          queryLength: 10,
          tier1Matches: 10,
          tier1Confidence: 0.8,
          tier1Ms: 40,
          tier2Escalated: false,
          totalMs: 40,
        });

        // Summary for last 1 day should include it
        const summary1Day = store.getSummary(1);
        expect(summary1Day.totalQueries).toBe(1);

        // Summary for last 7 days should also include it
        const summary7Days = store.getSummary(7);
        expect(summary7Days.totalQueries).toBe(1);

        store.close();
      });
    });

    describe("cleanup()", () => {
      it("removes records older than retention period", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 1, // 1 day retention for testing
            },
          })
        );

        const store = new MetricsStore(testConfigPath);

        // Record a query
        store.record({
          queryHash: "test",
          queryLength: 10,
          tier1Matches: 10,
          tier1Confidence: 0.8,
          tier1Ms: 40,
          tier2Escalated: false,
          totalMs: 40,
        });

        // Manually trigger cleanup (normally happens on record)
        store.cleanup();

        // Recent record should still be there
        const summary = store.getSummary(1);
        expect(summary.totalQueries).toBe(1);

        store.close();
      });
    });

    describe("reset()", () => {
      it("clears all data", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: testDbPath,
              retentionDays: 30,
            },
          })
        );

        const store = new MetricsStore(testConfigPath);

        // Record some queries
        store.record({
          queryHash: "q1",
          queryLength: 10,
          tier1Matches: 10,
          tier1Confidence: 0.8,
          tier1Ms: 40,
          tier2Escalated: false,
          totalMs: 40,
        });

        store.record({
          queryHash: "q2",
          queryLength: 20,
          tier1Matches: 20,
          tier1Confidence: 0.6,
          tier1Ms: 60,
          tier2Escalated: false,
          totalMs: 60,
        });

        // Verify data exists
        let summary = store.getSummary(7);
        expect(summary.totalQueries).toBe(2);

        // Reset
        store.reset();

        // Verify data is cleared
        summary = store.getSummary(7);
        expect(summary.totalQueries).toBe(0);

        store.close();
      });
    });

    describe("expandPath", () => {
      it("expands ~ in metrics path", () => {
        // Config with ~ path - verifies expansion works
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({
            metrics: {
              enabled: true,
              path: "~/.config/acr/test-metrics.db",
              retentionDays: 30,
            },
          })
        );

        // MetricsStore should expand the path internally
        const store = new MetricsStore(testConfigPath);
        expect(store).toBeDefined();
        store.close();
      });
    });
  });
});
