/**
 * ACR Tier 1 - Configuration
 *
 * Stopwords, thresholds, and configuration for grep-based entity detection.
 * Supports config file overrides via ~/.config/acr/config.json
 */

import { getLoggingConfig } from "./logging-config";

// ============================================================================
// Stopwords - Common words to filter from entity extraction
// ============================================================================

/**
 * English stopwords to exclude from entity extraction.
 * These are common words that rarely represent meaningful entities.
 */
export const STOPWORDS = new Set([
  // Articles
  "the",
  "a",
  "an",
  // Pronouns
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  // Common verbs
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  // Prepositions
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "up",
  "about",
  "into",
  "over",
  "after",
  // Conjunctions
  "and",
  "but",
  "or",
  "nor",
  "so",
  "yet",
  // Common adverbs
  "not",
  "no",
  "yes",
  "just",
  "only",
  "also",
  "very",
  "too",
  "more",
  "most",
  "now",
  "then",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "some",
  "any",
  "other",
  // Question words (when not capitalized)
  "what",
  "which",
  "who",
  "whom",
  // Common coding terms that aren't entities
  "function",
  "const",
  "let",
  "var",
  "return",
  "import",
  "export",
  "default",
  "async",
  "await",
  "true",
  "false",
  "null",
  "undefined",
]);

// ============================================================================
// Thresholds and Limits
// ============================================================================

/**
 * Configuration for ACR Tier 1 grep pipeline
 */
export const ACR_CONFIG = {
  /** Minimum entity length to consider (filters out short words) */
  minEntityLength: 3,

  /** Maximum entity length (prevents overly long matches) */
  maxEntityLength: 50,

  /** Confidence threshold for escalating to Tier 2 (Resona) */
  tier2EscalationThreshold: 0.7,

  /** Maximum time allowed for grep operation in milliseconds */
  grepTimeoutMs: 75,

  /** Number of context lines before and after match */
  contextLines: 3,

  /** Maximum number of matches to return */
  maxMatches: 20,

  /** Maximum file size to read in bytes (skip large files) */
  maxFileSizeBytes: 100_000, // 100KB

  /** Feature flag for ACR */
  enabled: process.env.ACR_ENABLED !== "false",
} as const;

// ============================================================================
// Scoring Weights
// ============================================================================

/**
 * Confidence score weights for different match types
 */
export const MATCH_SCORES = {
  /** Exact case-sensitive match */
  exact: 1.0,

  /** Match at word boundary (whole word) */
  wordBoundary: 0.8,

  /** Partial match (substring) */
  partial: 0.6,

  /** Penalty for case-insensitive match */
  caseInsensitivePenalty: -0.1,
} as const;

// ============================================================================
// File Patterns
// ============================================================================

/**
 * File extensions to include in grep search
 */
export const SEARCHABLE_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
]);

/**
 * Directories to exclude from search
 */
export const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a word is a stopword (case-insensitive)
 */
export function isStopword(word: string): boolean {
  return STOPWORDS.has(word.toLowerCase());
}

/**
 * Check if entity meets length requirements
 */
export function isValidEntityLength(entity: string): boolean {
  return (
    entity.length >= ACR_CONFIG.minEntityLength &&
    entity.length <= ACR_CONFIG.maxEntityLength
  );
}

/**
 * Tier 1 config type (mutable version for overrides)
 */
export type Tier1Config = {
  minEntityLength: number;
  maxEntityLength: number;
  tier2EscalationThreshold: number;
  grepTimeoutMs: number;
  contextLines: number;
  maxMatches: number;
  maxFileSizeBytes: number;
  enabled: boolean;
};

/**
 * Get Tier 1 config with overrides applied.
 * Priority: config file > env vars > defaults
 */
export function getTier1Config(): Tier1Config {
  const loggingConfig = getLoggingConfig();
  const tier1Overrides = loggingConfig.tier1 ?? {};

  return {
    minEntityLength: ACR_CONFIG.minEntityLength,
    maxEntityLength: ACR_CONFIG.maxEntityLength,
    tier2EscalationThreshold: ACR_CONFIG.tier2EscalationThreshold,
    contextLines: ACR_CONFIG.contextLines,
    maxFileSizeBytes: ACR_CONFIG.maxFileSizeBytes,
    // Config file overrides (highest priority)
    grepTimeoutMs: tier1Overrides.grepTimeoutMs ?? ACR_CONFIG.grepTimeoutMs,
    maxMatches: tier1Overrides.maxMatches ?? ACR_CONFIG.maxMatches,
    // Env var override for enabled (lower priority than config file)
    enabled:
      tier1Overrides.enabled !== undefined
        ? tier1Overrides.enabled
        : process.env.ACR_ENABLED !== "false",
  };
}
