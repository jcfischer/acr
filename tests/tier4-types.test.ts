/**
 * Tests for ACR Tier 4 - Type Definitions
 */

import { describe, it, expect } from "bun:test";
import {
  ContentTypeSchema,
  ContentMetadataSchema,
  DecayedResultSchema,
  Tier4ConfigSchema,
  DecayOptionsSchema,
  HALF_LIFE_DAYS,
  createDefaultTier4Config,
  getHalfLife,
  createDecayedResult,
} from "../src/tier4-types";

describe("Tier 4 Types", () => {
  describe("ContentTypeSchema", () => {
    it("accepts valid content types", () => {
      expect(ContentTypeSchema.parse("identity")).toBe("identity");
      expect(ContentTypeSchema.parse("contacts")).toBe("contacts");
      expect(ContentTypeSchema.parse("projects")).toBe("projects");
      expect(ContentTypeSchema.parse("learnings")).toBe("learnings");
      expect(ContentTypeSchema.parse("sessions")).toBe("sessions");
      expect(ContentTypeSchema.parse("operational")).toBe("operational");
    });

    it("rejects invalid content types", () => {
      expect(() => ContentTypeSchema.parse("invalid")).toThrow();
      expect(() => ContentTypeSchema.parse("")).toThrow();
    });
  });

  describe("HALF_LIFE_DAYS", () => {
    it("has correct values per spec", () => {
      expect(HALF_LIFE_DAYS.identity).toBe(180);
      expect(HALF_LIFE_DAYS.contacts).toBe(90);
      expect(HALF_LIFE_DAYS.projects).toBe(60);
      expect(HALF_LIFE_DAYS.learnings).toBe(45);
      expect(HALF_LIFE_DAYS.sessions).toBe(30);
      expect(HALF_LIFE_DAYS.operational).toBe(14);
    });

    it("has all content types", () => {
      const types = ["identity", "contacts", "projects", "learnings", "sessions", "operational"];
      for (const type of types) {
        expect(HALF_LIFE_DAYS[type as keyof typeof HALF_LIFE_DAYS]).toBeDefined();
      }
    });
  });

  describe("ContentMetadataSchema", () => {
    it("validates complete metadata", () => {
      const metadata = {
        created: new Date("2024-01-01"),
        updated: new Date("2024-01-15"),
        ttl: 30,
        contentType: "sessions",
        preserveReason: "Important context",
      };
      expect(() => ContentMetadataSchema.parse(metadata)).not.toThrow();
    });

    it("validates minimal metadata", () => {
      const metadata = {
        created: new Date(),
        updated: new Date(),
        contentType: "operational",
      };
      expect(() => ContentMetadataSchema.parse(metadata)).not.toThrow();
    });

    it("accepts TTL values: 0 (permanent), -1 (default), positive (days)", () => {
      const base = {
        created: new Date(),
        updated: new Date(),
        contentType: "sessions" as const,
      };

      expect(() => ContentMetadataSchema.parse({ ...base, ttl: 0 })).not.toThrow();
      expect(() => ContentMetadataSchema.parse({ ...base, ttl: -1 })).not.toThrow();
      expect(() => ContentMetadataSchema.parse({ ...base, ttl: 30 })).not.toThrow();
      expect(() => ContentMetadataSchema.parse({ ...base, ttl: 180 })).not.toThrow();
    });
  });

  describe("DecayedResultSchema", () => {
    it("validates complete decayed result", () => {
      const result = {
        rawConfidence: 0.9,
        decayedConfidence: 0.45,
        ageDays: 30,
        decayFactor: 0.5,
        contentType: "sessions",
        halfLifeDays: 30,
        decayBypassed: false,
      };
      expect(() => DecayedResultSchema.parse(result)).not.toThrow();
    });

    it("enforces confidence bounds", () => {
      const base = {
        rawConfidence: 0.9,
        decayedConfidence: 0.45,
        ageDays: 30,
        decayFactor: 0.5,
        contentType: "sessions" as const,
        halfLifeDays: 30,
        decayBypassed: false,
      };

      // Valid bounds
      expect(() => DecayedResultSchema.parse({ ...base, rawConfidence: 0 })).not.toThrow();
      expect(() => DecayedResultSchema.parse({ ...base, rawConfidence: 1 })).not.toThrow();

      // Invalid bounds
      expect(() => DecayedResultSchema.parse({ ...base, rawConfidence: -0.1 })).toThrow();
      expect(() => DecayedResultSchema.parse({ ...base, rawConfidence: 1.1 })).toThrow();
    });
  });

  describe("Tier4ConfigSchema", () => {
    it("provides defaults", () => {
      const config = Tier4ConfigSchema.parse({});
      expect(config.enabled).toBe(true);
      expect(config.archiveThreshold).toBe(0.1);
      expect(config.historicalMode).toBe(false);
    });

    it("validates custom configuration", () => {
      const config = Tier4ConfigSchema.parse({
        enabled: false,
        archiveThreshold: 0.05,
        historicalMode: true,
        halfLifeOverrides: { sessions: 45 },
      });
      expect(config.enabled).toBe(false);
      expect(config.archiveThreshold).toBe(0.05);
      expect(config.historicalMode).toBe(true);
      expect(config.halfLifeOverrides?.sessions).toBe(45);
    });
  });

  describe("createDefaultTier4Config", () => {
    it("returns default configuration", () => {
      const config = createDefaultTier4Config();
      expect(config.enabled).toBe(true);
      expect(config.archiveThreshold).toBe(0.1);
      expect(config.historicalMode).toBe(false);
    });
  });

  describe("getHalfLife", () => {
    it("returns default half-life without config", () => {
      expect(getHalfLife("identity")).toBe(180);
      expect(getHalfLife("sessions")).toBe(30);
      expect(getHalfLife("operational")).toBe(14);
    });

    it("uses config overrides when provided", () => {
      const config = createDefaultTier4Config();
      config.halfLifeOverrides = { sessions: 60 };

      expect(getHalfLife("sessions", config)).toBe(60);
      expect(getHalfLife("identity", config)).toBe(180); // Not overridden
    });
  });

  describe("createDecayedResult", () => {
    it("creates result with no decay", () => {
      const result = createDecayedResult(0.8, "contacts");
      expect(result.rawConfidence).toBe(0.8);
      expect(result.decayedConfidence).toBe(0.8);
      expect(result.ageDays).toBe(0);
      expect(result.decayFactor).toBe(1.0);
      expect(result.contentType).toBe("contacts");
      expect(result.halfLifeDays).toBe(90);
      expect(result.decayBypassed).toBe(false);
    });

    it("defaults to operational content type", () => {
      const result = createDecayedResult(0.5);
      expect(result.contentType).toBe("operational");
      expect(result.halfLifeDays).toBe(14);
    });
  });
});
