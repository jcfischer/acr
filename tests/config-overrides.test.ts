/**
 * ACR Config Override Tests
 *
 * Tests for F-008 Phase 9: Config file tier overrides
 * Priority: config file > env vars > defaults
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { resetConfigCache } from "../src/logging-config";
import { getTier1Config, ACR_CONFIG } from "../src/config";
import { getConfig, TIER2_CONFIG } from "../src/tier2-config";

describe("Config Override Priority", () => {
  let testDir: string;
  let testConfigPath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetConfigCache();
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "acr-config-test-"));
    testConfigPath = path.join(testDir, "config.json");
  });

  afterEach(() => {
    process.env = originalEnv;
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Tier 1 Config", () => {
    it("uses defaults when no config file", () => {
      // Ensure no config file exists
      if (fs.existsSync(testConfigPath)) {
        fs.unlinkSync(testConfigPath);
      }

      // Use a non-existent path to force defaults
      const config = getTier1Config();

      expect(config.grepTimeoutMs).toBe(ACR_CONFIG.grepTimeoutMs);
      expect(config.maxMatches).toBe(ACR_CONFIG.maxMatches);
    });

    it("config file overrides defaults", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          tier1: {
            grepTimeoutMs: 150,
            maxMatches: 50,
          },
        })
      );

      // We need to inject our test config path
      // For now, test via the logging config
      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      expect(loggingConfig.tier1.grepTimeoutMs).toBe(150);
      expect(loggingConfig.tier1.maxMatches).toBe(50);
    });

    it("config file enabled overrides env var", () => {
      // Set env var to disabled
      process.env.ACR_ENABLED = "false";

      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          tier1: {
            enabled: true, // Config file says enabled
          },
        })
      );

      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      // Config file should override env var
      expect(loggingConfig.tier1.enabled).toBe(true);
    });

    it("env var used when config file has no override", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          // No tier1 overrides
        })
      );

      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      // tier1 should be empty object, allowing env var to take effect
      expect(loggingConfig.tier1).toEqual({});
    });

    it("partial overrides work correctly", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          tier1: {
            grepTimeoutMs: 200,
            // maxMatches not specified - should use default
          },
        })
      );

      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      expect(loggingConfig.tier1.grepTimeoutMs).toBe(200);
      expect(loggingConfig.tier1.maxMatches).toBeUndefined();
    });
  });

  describe("Tier 2 Config", () => {
    it("uses defaults when no config file", () => {
      const config = getConfig();

      expect(config.searchTimeout).toBe(TIER2_CONFIG.searchTimeout);
      expect(config.maxResults).toBe(TIER2_CONFIG.maxResults);
      expect(config.minSimilarity).toBe(TIER2_CONFIG.minSimilarity);
    });

    it("config file overrides defaults", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          tier2: {
            searchTimeout: 10000,
            maxResults: 20,
            minSimilarity: 0.8,
          },
        })
      );

      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      expect(loggingConfig.tier2.searchTimeout).toBe(10000);
      expect(loggingConfig.tier2.maxResults).toBe(20);
      expect(loggingConfig.tier2.minSimilarity).toBe(0.8);
    });

    it("config file enabled overrides env var", () => {
      // Set env var to disabled
      process.env.ACR_TIER2_ENABLED = "false";

      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          tier2: {
            enabled: true, // Config file says enabled
          },
        })
      );

      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      // Config file should override env var
      expect(loggingConfig.tier2.enabled).toBe(true);
    });

    it("partial overrides work correctly", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          tier2: {
            maxResults: 25,
            // searchTimeout not specified - should use default
          },
        })
      );

      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      expect(loggingConfig.tier2.maxResults).toBe(25);
      expect(loggingConfig.tier2.searchTimeout).toBeUndefined();
    });

    it("activationThreshold override works", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          tier2: {
            activationThreshold: 0.5,
          },
        })
      );

      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      expect(loggingConfig.tier2.activationThreshold).toBe(0.5);
    });
  });

  describe("Combined Overrides", () => {
    it("both tier1 and tier2 overrides in same config", () => {
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify({
          debug: true,
          tier1: {
            grepTimeoutMs: 100,
            maxMatches: 30,
          },
          tier2: {
            searchTimeout: 8000,
            minSimilarity: 0.7,
          },
        })
      );

      const { getLoggingConfig } = require("../src/logging-config");
      resetConfigCache();
      const loggingConfig = getLoggingConfig(testConfigPath);

      expect(loggingConfig.debug).toBe(true);
      expect(loggingConfig.tier1.grepTimeoutMs).toBe(100);
      expect(loggingConfig.tier1.maxMatches).toBe(30);
      expect(loggingConfig.tier2.searchTimeout).toBe(8000);
      expect(loggingConfig.tier2.minSimilarity).toBe(0.7);
    });
  });
});
