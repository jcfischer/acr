/**
 * ACR Tier 2 - Configuration
 *
 * Thresholds, trigger phrases, and configuration for semantic retrieval.
 * Supports config file overrides via ~/.config/acr/config.json
 */

import { join } from "path";
import { getLoggingConfig } from "./logging-config";

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration for ACR Tier 2 semantic retrieval
 */
export const TIER2_CONFIG = {
  /** Confidence threshold below which Tier 2 activates (0.0-1.0) */
  activationThreshold: 0.7,

  /** Maximum time allowed for semantic search in milliseconds */
  searchTimeout: 5000,

  /** Maximum number of results to return */
  maxResults: 10,

  /** Minimum similarity score to include in results (0.0-1.0) */
  minSimilarity: 0.6,

  /** Source priority boosts for ranking (added to similarity score) */
  sourcePriority: {
    user: 0.1, // USER/ files get highest boost
    session: 0.05, // Session history gets medium boost
    tana: 0, // Tana exports get no boost
  },

  /** Path to LanceDB embedding database */
  embeddingDbPath: join(
    process.env.HOME || "",
    ".claude/embeddings/acr.lance"
  ),

  /** Path to session history directory */
  sessionHistoryPath: join(process.env.HOME || "", ".claude/projects"),

  /** Feature flag for Tier 2 */
  enabled: process.env.ACR_TIER2_ENABLED !== "false",
} as const;

// ============================================================================
// Trigger Phrases
// ============================================================================

/**
 * Phrases that explicitly trigger Tier 2 semantic search.
 * When detected in a prompt, Tier 2 activates regardless of Tier 1 confidence.
 */
export const TRIGGER_PHRASES = [
  "remember when",
  "we discussed",
  "earlier session",
  "last time",
  "previous conversation",
  "you mentioned",
  "we talked about",
  "from before",
  "recall when",
  "as we discussed",
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a prompt contains any trigger phrase (case-insensitive)
 */
export function isTriggerPhrase(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return TRIGGER_PHRASES.some((phrase) => lowerPrompt.includes(phrase));
}

/**
 * Tier 2 config type (mutable version for overrides)
 */
export type Tier2Config = {
  activationThreshold: number;
  searchTimeout: number;
  maxResults: number;
  minSimilarity: number;
  sourcePriority: {
    user: number;
    session: number;
    tana: number;
  };
  embeddingDbPath: string;
  sessionHistoryPath: string;
  enabled: boolean;
};

/**
 * Get Tier 2 config with overrides applied.
 * Priority: config file > env vars > defaults
 */
export function getConfig(): Tier2Config {
  const loggingConfig = getLoggingConfig();
  const tier2Overrides = loggingConfig.tier2 ?? {};

  return {
    activationThreshold:
      tier2Overrides.activationThreshold ?? TIER2_CONFIG.activationThreshold,
    searchTimeout: tier2Overrides.searchTimeout ?? TIER2_CONFIG.searchTimeout,
    maxResults: tier2Overrides.maxResults ?? TIER2_CONFIG.maxResults,
    minSimilarity: tier2Overrides.minSimilarity ?? TIER2_CONFIG.minSimilarity,
    sourcePriority: { ...TIER2_CONFIG.sourcePriority },
    embeddingDbPath: TIER2_CONFIG.embeddingDbPath,
    sessionHistoryPath: TIER2_CONFIG.sessionHistoryPath,
    // Env var override for enabled (lower priority than config file)
    enabled:
      tier2Overrides.enabled !== undefined
        ? tier2Overrides.enabled
        : process.env.ACR_TIER2_ENABLED !== "false",
  };
}
