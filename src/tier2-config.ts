/**
 * ACR Tier 2 - Configuration
 *
 * Thresholds, trigger phrases, and configuration for semantic retrieval.
 */

import { join } from "path";

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
 * Get current configuration with environment overrides
 */
export function getConfig(): typeof TIER2_CONFIG {
  return {
    ...TIER2_CONFIG,
    enabled: process.env.ACR_TIER2_ENABLED !== "false",
  };
}
