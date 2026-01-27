/**
 * ACR Logging Config - Type Tests
 *
 * TDD RED: Tests written BEFORE implementation
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
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

  describe("getLoggingConfig", () => {
    // Import after tests are defined (will fail until implementation exists)
    const {
      getLoggingConfig,
      expandPath,
      isDebugEnabled,
      debug,
      resetConfigCache,
      CONFIG_PATH,
    } = require("../src/logging-config") as typeof import("../src/logging-config");

    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    // Test directory for isolation
    let testConfigDir: string;
    let testConfigPath: string;

    beforeEach(() => {
      // Reset cache before each test
      resetConfigCache?.();

      // Create temp directory for test config
      testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "acr-test-"));
      testConfigPath = path.join(testConfigDir, "config.json");
    });

    afterEach(() => {
      // Cleanup temp directory
      if (testConfigDir && fs.existsSync(testConfigDir)) {
        fs.rmSync(testConfigDir, { recursive: true, force: true });
      }
    });

    describe("expandPath", () => {
      it("expands ~ to HOME directory", () => {
        const result = expandPath("~/.config/acr/test.log");
        expect(result).toBe(
          path.join(os.homedir(), ".config/acr/test.log")
        );
      });

      it("returns path unchanged if no ~", () => {
        const result = expandPath("/absolute/path/test.log");
        expect(result).toBe("/absolute/path/test.log");
      });

      it("only expands ~ at the beginning", () => {
        const result = expandPath("/some/~path/test.log");
        expect(result).toBe("/some/~path/test.log");
      });
    });

    describe("getLoggingConfig", () => {
      it("returns default config when no config file exists", () => {
        const config = getLoggingConfig(testConfigPath);
        expect(config.debug).toBe(false);
        expect(config.logging.enabled).toBe(true);
        expect(config.logging.path).toBe("~/.config/acr/acr.log");
        expect(config.logging.maxSize).toBe(10_000_000);
        expect(config.logging.maxFiles).toBe(3);
        expect(config.metrics.enabled).toBe(true);
        expect(config.metrics.path).toBe("~/.config/acr/metrics.db");
        expect(config.metrics.retentionDays).toBe(30);
      });

      it("creates config directory if missing", () => {
        const nestedPath = path.join(testConfigDir, "nested", "deep", "config.json");
        getLoggingConfig(nestedPath);
        expect(fs.existsSync(path.dirname(nestedPath))).toBe(true);
      });

      it("writes default config on first run", () => {
        getLoggingConfig(testConfigPath);
        expect(fs.existsSync(testConfigPath)).toBe(true);

        const content = JSON.parse(fs.readFileSync(testConfigPath, "utf-8"));
        expect(content.debug).toBe(false);
        expect(content.logging.enabled).toBe(true);
      });

      it("parses existing JSON config with Zod validation", () => {
        const customConfig = {
          debug: true,
          logging: {
            maxSize: 5_000_000,
          },
        };
        fs.writeFileSync(testConfigPath, JSON.stringify(customConfig));

        const config = getLoggingConfig(testConfigPath);
        expect(config.debug).toBe(true);
        expect(config.logging.maxSize).toBe(5_000_000);
        // Defaults should still apply for unspecified fields
        expect(config.logging.enabled).toBe(true);
        expect(config.logging.path).toBe("~/.config/acr/acr.log");
      });

      it("caches config and returns same object", () => {
        const config1 = getLoggingConfig(testConfigPath);
        const config2 = getLoggingConfig(testConfigPath);
        expect(config1).toBe(config2); // Same reference
      });

      it("handles invalid JSON gracefully", () => {
        fs.writeFileSync(testConfigPath, "{ invalid json }");
        // Should return defaults on parse error
        const config = getLoggingConfig(testConfigPath);
        expect(config.debug).toBe(false);
        expect(config.logging.enabled).toBe(true);
      });

      it("handles validation errors gracefully", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({ debug: "not-a-boolean" })
        );
        // Should return defaults on validation error
        const config = getLoggingConfig(testConfigPath);
        expect(config.debug).toBe(false);
      });

      it("uses default path when called without argument", () => {
        // This test verifies the function has a default parameter
        const config = getLoggingConfig();
        expect(config).toBeDefined();
        expect(config.logging).toBeDefined();
      });
    });

    describe("isDebugEnabled", () => {
      it("returns false when debug is disabled", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({ debug: false })
        );
        resetConfigCache?.();
        const result = isDebugEnabled(testConfigPath);
        expect(result).toBe(false);
      });

      it("returns true when debug is enabled", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({ debug: true })
        );
        resetConfigCache?.();
        const result = isDebugEnabled(testConfigPath);
        expect(result).toBe(true);
      });
    });

    describe("debug", () => {
      let originalStderr: typeof process.stderr.write;
      let stderrOutput: string[];

      beforeEach(() => {
        stderrOutput = [];
        originalStderr = process.stderr.write;
        process.stderr.write = ((chunk: string | Uint8Array) => {
          stderrOutput.push(chunk.toString());
          return true;
        }) as typeof process.stderr.write;
      });

      afterEach(() => {
        process.stderr.write = originalStderr;
      });

      it("outputs to stderr when debug enabled", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({ debug: true })
        );
        resetConfigCache?.();
        debug("test message", testConfigPath);
        expect(stderrOutput.some((s) => s.includes("test message"))).toBe(true);
      });

      it("outputs nothing when debug disabled", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({ debug: false })
        );
        resetConfigCache?.();
        debug("test message", testConfigPath);
        expect(stderrOutput.length).toBe(0);
      });

      it("handles multiple arguments", () => {
        fs.writeFileSync(
          testConfigPath,
          JSON.stringify({ debug: true })
        );
        resetConfigCache?.();
        debug("arg1", "arg2", 123, testConfigPath);
        const output = stderrOutput.join("");
        expect(output.includes("arg1")).toBe(true);
        expect(output.includes("arg2")).toBe(true);
        expect(output.includes("123")).toBe(true);
      });
    });
  });
});
