/**
 * Tests for ACR Tier 4 - Temporal Decay Calculation
 */

import { describe, it, expect } from "bun:test";
import {
  calculateDecayFactor,
  applyTemporalDecay,
  calculateAgeDays,
  calculateAgeDaysFromTimestamp,
  applyDecayWithMetadata,
  applyDecaySimple,
  applyDecayBatch,
  shouldArchive,
  daysUntilConfidence,
  getDecaySummary,
} from "../src/tier4-decay";
import { createDefaultTier4Config, HALF_LIFE_DAYS } from "../src/tier4-types";
import type { ContentMetadata } from "../src/tier4-types";

describe("Tier 4 Decay", () => {
  describe("calculateDecayFactor", () => {
    it("returns 1.0 for new content (age 0)", () => {
      expect(calculateDecayFactor(0, 30)).toBe(1.0);
    });

    it("returns 0.5 at exactly one half-life", () => {
      expect(calculateDecayFactor(30, 30)).toBeCloseTo(0.5, 5);
      expect(calculateDecayFactor(90, 90)).toBeCloseTo(0.5, 5);
      expect(calculateDecayFactor(180, 180)).toBeCloseTo(0.5, 5);
    });

    it("returns 0.25 at two half-lives", () => {
      expect(calculateDecayFactor(60, 30)).toBeCloseTo(0.25, 5);
    });

    it("returns 0.125 at three half-lives (87.5% decay)", () => {
      expect(calculateDecayFactor(90, 30)).toBeCloseTo(0.125, 5);
    });

    it("handles fractional ages", () => {
      // Half of a half-life
      expect(calculateDecayFactor(15, 30)).toBeCloseTo(Math.sqrt(0.5), 5);
    });

    it("returns 1.0 for invalid half-life", () => {
      expect(calculateDecayFactor(30, 0)).toBe(1.0);
      expect(calculateDecayFactor(30, -10)).toBe(1.0);
    });

    it("returns 1.0 for negative age", () => {
      expect(calculateDecayFactor(-10, 30)).toBe(1.0);
    });
  });

  describe("applyTemporalDecay", () => {
    it("applies decay correctly", () => {
      // 30-day old content with 30-day half-life
      expect(applyTemporalDecay(1.0, 30, 30)).toBeCloseTo(0.5, 5);
      expect(applyTemporalDecay(0.8, 30, 30)).toBeCloseTo(0.4, 5);
    });

    it("preserves confidence for new content", () => {
      expect(applyTemporalDecay(0.9, 0, 30)).toBe(0.9);
    });

    it("handles spec examples correctly", () => {
      // 30-day half-life default
      const halfLife = 30;

      // "Context older than 30 days has confidence reduced by 50%"
      expect(applyTemporalDecay(1.0, 30, halfLife)).toBeCloseTo(0.5, 5);

      // "Context older than 90 days has confidence reduced by 87.5%"
      expect(applyTemporalDecay(1.0, 90, halfLife)).toBeCloseTo(0.125, 5);
    });
  });

  describe("calculateAgeDays", () => {
    it("calculates age correctly", () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      expect(calculateAgeDays(thirtyDaysAgo, now)).toBeCloseTo(30, 1);
    });

    it("returns 0 for future dates", () => {
      const now = new Date();
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      expect(calculateAgeDays(future, now)).toBe(0);
    });

    it("handles same date", () => {
      const date = new Date();
      expect(calculateAgeDays(date, date)).toBe(0);
    });
  });

  describe("calculateAgeDaysFromTimestamp", () => {
    it("calculates from timestamps", () => {
      const now = Date.now();
      const thirtyDaysAgoMs = now - 30 * 24 * 60 * 60 * 1000;
      expect(calculateAgeDaysFromTimestamp(thirtyDaysAgoMs, now)).toBeCloseTo(30, 1);
    });
  });

  describe("applyDecayWithMetadata", () => {
    it("applies decay based on content type", () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const metadata: ContentMetadata = {
        created: thirtyDaysAgo,
        updated: thirtyDaysAgo,
        contentType: "sessions", // 30-day half-life
      };

      const result = applyDecayWithMetadata(1.0, metadata, createDefaultTier4Config(), {
        referenceDate: now,
      });

      expect(result.rawConfidence).toBe(1.0);
      expect(result.decayedConfidence).toBeCloseTo(0.5, 1);
      expect(result.contentType).toBe("sessions");
      expect(result.halfLifeDays).toBe(30);
      expect(result.decayBypassed).toBe(false);
    });

    it("bypasses decay for TTL=0 (permanent)", () => {
      const metadata: ContentMetadata = {
        created: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year old
        updated: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        contentType: "operational",
        ttl: 0, // Permanent
        preserveReason: "Critical info",
      };

      const result = applyDecayWithMetadata(1.0, metadata);

      expect(result.decayedConfidence).toBe(1.0);
      expect(result.decayBypassed).toBe(true);
    });

    it("bypasses decay in historical mode", () => {
      const metadata: ContentMetadata = {
        created: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        updated: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        contentType: "sessions",
      };

      const config = createDefaultTier4Config();
      config.historicalMode = true;

      const result = applyDecayWithMetadata(1.0, metadata, config);

      expect(result.decayedConfidence).toBe(1.0);
      expect(result.decayBypassed).toBe(true);
    });

    it("bypasses decay when disabled", () => {
      const metadata: ContentMetadata = {
        created: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        updated: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        contentType: "sessions",
      };

      const config = createDefaultTier4Config();
      config.enabled = false;

      const result = applyDecayWithMetadata(1.0, metadata, config);

      expect(result.decayedConfidence).toBe(1.0);
      expect(result.decayBypassed).toBe(true);
    });
  });

  describe("applyDecaySimple", () => {
    it("applies decay for each content type", () => {
      const ageDays = 30;
      const confidence = 1.0;

      // Sessions: 30-day half-life, should be 0.5
      const sessionsResult = applyDecaySimple(confidence, "sessions", ageDays);
      expect(sessionsResult.decayedConfidence).toBeCloseTo(0.5, 1);

      // Operational: 14-day half-life, should be ~0.21 after 30 days
      const opResult = applyDecaySimple(confidence, "operational", ageDays);
      expect(opResult.decayedConfidence).toBeLessThan(0.3);

      // Identity: 180-day half-life, should be ~0.89 after 30 days
      const idResult = applyDecaySimple(confidence, "identity", ageDays);
      expect(idResult.decayedConfidence).toBeGreaterThan(0.85);
    });
  });

  describe("applyDecayBatch", () => {
    it("applies decay to multiple items", () => {
      const items = [
        { confidence: 1.0, contentType: "sessions" as const, ageDays: 30 },
        { confidence: 0.8, contentType: "identity" as const, ageDays: 30 },
        { confidence: 0.6, contentType: "operational" as const, ageDays: 30 },
      ];

      const results = applyDecayBatch(items);

      expect(results).toHaveLength(3);
      expect(results[0].contentType).toBe("sessions");
      expect(results[0].decayedConfidence).toBeCloseTo(0.5, 1);
      expect(results[1].contentType).toBe("identity");
      expect(results[1].decayedConfidence).toBeGreaterThan(0.7); // Slower decay
    });
  });

  describe("shouldArchive", () => {
    it("returns true when below threshold", () => {
      expect(shouldArchive(0.05)).toBe(true);
      expect(shouldArchive(0.09)).toBe(true);
    });

    it("returns false when above threshold", () => {
      expect(shouldArchive(0.1)).toBe(false);
      expect(shouldArchive(0.5)).toBe(false);
      expect(shouldArchive(1.0)).toBe(false);
    });

    it("uses custom threshold", () => {
      expect(shouldArchive(0.15, 0.2)).toBe(true);
      expect(shouldArchive(0.25, 0.2)).toBe(false);
    });
  });

  describe("daysUntilConfidence", () => {
    it("calculates time to reach target", () => {
      // With 30-day half-life, time to reach 0.5 from 1.0 is 30 days
      expect(daysUntilConfidence(1.0, 0.5, 30)).toBeCloseTo(30, 1);

      // Time to reach 0.25 from 1.0 is 60 days (2 half-lives)
      expect(daysUntilConfidence(1.0, 0.25, 30)).toBeCloseTo(60, 1);
    });

    it("returns 0 when already at or above target", () => {
      expect(daysUntilConfidence(0.5, 0.5, 30)).toBe(0);
      expect(daysUntilConfidence(0.5, 0.6, 30)).toBe(0);
    });

    it("returns Infinity for target 0", () => {
      expect(daysUntilConfidence(1.0, 0, 30)).toBe(Infinity);
    });
  });

  describe("getDecaySummary", () => {
    it("formats decayed result", () => {
      const result = {
        rawConfidence: 1.0,
        decayedConfidence: 0.5,
        ageDays: 30,
        decayFactor: 0.5,
        contentType: "sessions" as const,
        halfLifeDays: 30,
        decayBypassed: false,
      };

      const summary = getDecaySummary(result);
      expect(summary).toContain("100.0%");
      expect(summary).toContain("50.0%");
      expect(summary).toContain("30 days");
    });

    it("formats bypassed result", () => {
      const result = {
        rawConfidence: 1.0,
        decayedConfidence: 1.0,
        ageDays: 90,
        decayFactor: 1.0,
        contentType: "identity" as const,
        halfLifeDays: 180,
        decayBypassed: true,
      };

      const summary = getDecaySummary(result);
      expect(summary).toContain("bypassed");
    });
  });
});
