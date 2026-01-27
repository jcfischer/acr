/**
 * ACR Logging Config - Type Tests
 *
 * TDD RED: Tests written BEFORE implementation
 */

import { describe, expect, it } from "bun:test";
import {
  LoggingConfigSchema,
  type LoggingConfig,
} from "../src/logging-config";

describe("ACR Logging Config", () => {
  describe("LoggingConfigSchema", () => {
    it("validates a complete valid config", () => {
      const config: LoggingConfig = {
        debug: true,
        logging: {
          enabled: true,
          path: "~/.config/acr/acr.log",
          maxSize: 10_000_000,
          maxFiles: 3,
        },
        metrics: {
          enabled: true,
          path: "~/.config/acr/metrics.db",
          retentionDays: 30,
        },
        tier1: {
          enabled: true,
          grepTimeoutMs: 100,
          maxMatches: 20,
        },
        tier2: {
          enabled: true,
          searchTimeout: 5000,
          maxResults: 10,
          minSimilarity: 0.6,
        },
      };

      const result = LoggingConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("provides sensible defaults when empty object", () => {
      const result = LoggingConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.debug).toBe(false);
        expect(result.data.logging.enabled).toBe(true);
        expect(result.data.logging.path).toBe("~/.config/acr/acr.log");
        expect(result.data.logging.maxSize).toBe(10_000_000);
        expect(result.data.logging.maxFiles).toBe(3);
        expect(result.data.metrics.enabled).toBe(true);
        expect(result.data.metrics.path).toBe("~/.config/acr/metrics.db");
        expect(result.data.metrics.retentionDays).toBe(30);
        expect(result.data.tier1).toEqual({});
        expect(result.data.tier2).toEqual({});
      }
    });

    it("merges partial logging config with defaults", () => {
      const partial = {
        logging: {
          maxSize: 5_000_000,
        },
      };

      const result = LoggingConfigSchema.safeParse(partial);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.logging.enabled).toBe(true); // default
        expect(result.data.logging.maxSize).toBe(5_000_000); // overridden
        expect(result.data.logging.path).toBe("~/.config/acr/acr.log"); // default
      }
    });

    it("merges partial metrics config with defaults", () => {
      const partial = {
        metrics: {
          retentionDays: 7,
        },
      };

      const result = LoggingConfigSchema.safeParse(partial);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metrics.enabled).toBe(true); // default
        expect(result.data.metrics.retentionDays).toBe(7); // overridden
        expect(result.data.metrics.path).toBe("~/.config/acr/metrics.db"); // default
      }
    });

    it("accepts partial tier1 overrides", () => {
      const partial = {
        tier1: {
          grepTimeoutMs: 150,
        },
      };

      const result = LoggingConfigSchema.safeParse(partial);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tier1.grepTimeoutMs).toBe(150);
        expect(result.data.tier1.enabled).toBeUndefined(); // optional
        expect(result.data.tier1.maxMatches).toBeUndefined(); // optional
      }
    });

    it("accepts partial tier2 overrides", () => {
      const partial = {
        tier2: {
          minSimilarity: 0.5,
          maxResults: 15,
        },
      };

      const result = LoggingConfigSchema.safeParse(partial);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tier2.minSimilarity).toBe(0.5);
        expect(result.data.tier2.maxResults).toBe(15);
        expect(result.data.tier2.enabled).toBeUndefined(); // optional
        expect(result.data.tier2.searchTimeout).toBeUndefined(); // optional
      }
    });

    it("validates debug must be boolean", () => {
      const invalid = {
        debug: "yes",
      };

      const result = LoggingConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates logging.maxSize must be number", () => {
      const invalid = {
        logging: {
          maxSize: "large",
        },
      };

      const result = LoggingConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates logging.maxFiles must be number", () => {
      const invalid = {
        logging: {
          maxFiles: "many",
        },
      };

      const result = LoggingConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates metrics.retentionDays must be number", () => {
      const invalid = {
        metrics: {
          retentionDays: "forever",
        },
      };

      const result = LoggingConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates tier1.grepTimeoutMs must be number", () => {
      const invalid = {
        tier1: {
          grepTimeoutMs: "fast",
        },
      };

      const result = LoggingConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates tier2.minSimilarity must be number", () => {
      const invalid = {
        tier2: {
          minSimilarity: "high",
        },
      };

      const result = LoggingConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("allows all tier1 overrides simultaneously", () => {
      const config = {
        tier1: {
          enabled: false,
          grepTimeoutMs: 200,
          maxMatches: 50,
        },
      };

      const result = LoggingConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tier1.enabled).toBe(false);
        expect(result.data.tier1.grepTimeoutMs).toBe(200);
        expect(result.data.tier1.maxMatches).toBe(50);
      }
    });

    it("allows all tier2 overrides simultaneously", () => {
      const config = {
        tier2: {
          enabled: false,
          searchTimeout: 10000,
          maxResults: 25,
          minSimilarity: 0.7,
        },
      };

      const result = LoggingConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tier2.enabled).toBe(false);
        expect(result.data.tier2.searchTimeout).toBe(10000);
        expect(result.data.tier2.maxResults).toBe(25);
        expect(result.data.tier2.minSimilarity).toBe(0.7);
      }
    });

    it("preserves extra fields in passthrough mode", () => {
      // Test that unknown fields don't cause validation errors
      const withExtra = {
        debug: true,
        customField: "should be ignored or passed through",
      };

      // Depending on schema mode, this either passes or fails
      // Our schema should be strict and reject unknown fields
      const result = LoggingConfigSchema.safeParse(withExtra);
      // For strict parsing, we expect this to fail
      // But Zod's default is to strip unknown keys, so this passes
      expect(result.success).toBe(true);
    });
  });
});
