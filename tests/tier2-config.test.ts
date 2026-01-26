/**
 * ACR Tier 2 - Configuration Tests
 *
 * TDD RED: Tests written BEFORE implementation
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  TIER2_CONFIG,
  TRIGGER_PHRASES,
  isTriggerPhrase,
  getConfig,
} from "../src/tier2-config";

describe("ACR Tier 2 Configuration", () => {
  describe("TIER2_CONFIG defaults", () => {
    it("has activation threshold of 0.7", () => {
      expect(TIER2_CONFIG.activationThreshold).toBe(0.7);
    });

    it("has search timeout of 5000ms", () => {
      expect(TIER2_CONFIG.searchTimeout).toBe(5000);
    });

    it("has max results of 10", () => {
      expect(TIER2_CONFIG.maxResults).toBe(10);
    });

    it("has min similarity of 0.6", () => {
      expect(TIER2_CONFIG.minSimilarity).toBe(0.6);
    });

    it("has correct source priority boosts", () => {
      expect(TIER2_CONFIG.sourcePriority.user).toBe(0.1);
      expect(TIER2_CONFIG.sourcePriority.session).toBe(0.05);
      expect(TIER2_CONFIG.sourcePriority.tana).toBe(0);
    });

    it("has default embedding db path", () => {
      expect(TIER2_CONFIG.embeddingDbPath).toContain("embeddings/acr.lance");
    });

    it("has default session history path", () => {
      expect(TIER2_CONFIG.sessionHistoryPath).toContain(".claude/projects");
    });
  });

  describe("TRIGGER_PHRASES", () => {
    it("contains 'remember when'", () => {
      expect(TRIGGER_PHRASES).toContain("remember when");
    });

    it("contains 'we discussed'", () => {
      expect(TRIGGER_PHRASES).toContain("we discussed");
    });

    it("contains 'earlier session'", () => {
      expect(TRIGGER_PHRASES).toContain("earlier session");
    });

    it("contains 'last time'", () => {
      expect(TRIGGER_PHRASES).toContain("last time");
    });

    it("contains 'previous conversation'", () => {
      expect(TRIGGER_PHRASES).toContain("previous conversation");
    });
  });

  describe("isTriggerPhrase", () => {
    it("detects 'remember when' in prompt", () => {
      expect(isTriggerPhrase("Do you remember when we worked on this?")).toBe(
        true
      );
    });

    it("detects 'we discussed' in prompt", () => {
      expect(isTriggerPhrase("As we discussed earlier, the API...")).toBe(true);
    });

    it("detects trigger phrases case-insensitively", () => {
      expect(isTriggerPhrase("REMEMBER WHEN we talked?")).toBe(true);
      expect(isTriggerPhrase("We Discussed this")).toBe(true);
    });

    it("returns false for prompts without trigger phrases", () => {
      expect(isTriggerPhrase("Help me fix this bug")).toBe(false);
      expect(isTriggerPhrase("What is the weather like?")).toBe(false);
    });

    it("detects 'earlier session' in prompt", () => {
      expect(
        isTriggerPhrase("In an earlier session we worked on authentication")
      ).toBe(true);
    });
  });

  describe("getConfig", () => {
    const originalEnv = process.env.ACR_TIER2_ENABLED;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.ACR_TIER2_ENABLED;
      } else {
        process.env.ACR_TIER2_ENABLED = originalEnv;
      }
    });

    it("returns enabled=true by default", () => {
      delete process.env.ACR_TIER2_ENABLED;
      const config = getConfig();
      expect(config.enabled).toBe(true);
    });

    it("returns enabled=false when env var is 'false'", () => {
      process.env.ACR_TIER2_ENABLED = "false";
      const config = getConfig();
      expect(config.enabled).toBe(false);
    });

    it("returns enabled=true when env var is 'true'", () => {
      process.env.ACR_TIER2_ENABLED = "true";
      const config = getConfig();
      expect(config.enabled).toBe(true);
    });

    it("includes all default config values", () => {
      const config = getConfig();
      expect(config.activationThreshold).toBe(0.7);
      expect(config.searchTimeout).toBe(5000);
      expect(config.maxResults).toBe(10);
    });
  });
});
