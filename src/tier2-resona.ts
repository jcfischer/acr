/**
 * ACR Tier 2 - Resona Semantic Retrieval
 *
 * Main entry point for semantic search using Resona embeddings.
 *
 * Orchestrates:
 * 1. Activation gate - determines if Tier 2 should run
 * 2. Query construction - builds semantic query from prompt
 * 3. Resona search - searches across user/session/tana sources
 * 4. Result ranking - ranks, deduplicates, and filters results
 *
 * Usage:
 * ```typescript
 * import { runTier2Semantic } from './tier2-resona';
 *
 * const result = await runTier2Semantic(tier1Result, prompt);
 * if (result.activated) {
 *   console.log('Semantic results:', result.results);
 * }
 * ```
 */

import type { GrepResult } from "./types";
import type { SemanticResult, RankedResult, Tier2Config } from "./tier2-types";
import { TIER2_CONFIG } from "./tier2-config";
import { shouldActivateTier2, detectExplicitTrigger } from "./tier2-activation";
import { constructSemanticQuery } from "./tier2-query";
import { ResonaAdapter } from "./resona-adapter";
import { rankResults } from "./tier2-ranker";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for Tier 2 semantic search
 */
export interface Tier2Options {
  /** Enable/disable Tier 2 (default: true) */
  enabled?: boolean;
  /** Confidence threshold for activation (default: 0.7) */
  activationThreshold?: number;
  /** Maximum results to return (default: 10) */
  maxResults?: number;
  /** Minimum similarity threshold (default: 0.6) */
  minSimilarity?: number;
  /** Search timeout in ms (default: 5000) */
  searchTimeout?: number;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run Tier 2 semantic search.
 *
 * This is the main orchestration function that:
 * 1. Checks if Tier 2 should activate based on Tier 1 results
 * 2. Constructs a semantic query from the prompt
 * 3. Searches Resona for relevant context
 * 4. Ranks and returns results
 *
 * @param tier1Result Results from Tier 1 grep search
 * @param prompt User's prompt/query
 * @param options Optional configuration
 * @returns Semantic search results with activation status
 */
export async function runTier2Semantic(
  tier1Result: GrepResult,
  prompt: string,
  options: Tier2Options = {}
): Promise<SemanticResult> {
  const startTime = performance.now();

  const {
    enabled = true,
    activationThreshold = TIER2_CONFIG.activationThreshold,
    maxResults = TIER2_CONFIG.maxResults,
    minSimilarity = TIER2_CONFIG.minSimilarity,
    searchTimeout = TIER2_CONFIG.searchTimeout,
  } = options;

  // Check if disabled via options
  if (!enabled) {
    return createResult([], "disabled", false, startTime);
  }

  // Check for explicit trigger phrases first
  const explicitTrigger = detectExplicitTrigger(prompt);
  if (explicitTrigger.hasExplicitTrigger) {
    return await executeSemanticSearch(
      tier1Result,
      prompt,
      "explicit_request",
      { maxResults, minSimilarity, searchTimeout },
      startTime
    );
  }

  // Check activation gate
  const activation = shouldActivateTier2(tier1Result, prompt, {
    activationThreshold,
    enabled: true,
  });

  if (!activation.shouldActivate) {
    return createResult([], "high_confidence", false, startTime);
  }

  // Execute semantic search
  return await executeSemanticSearch(
    tier1Result,
    prompt,
    activation.reason,
    { maxResults, minSimilarity, searchTimeout },
    startTime
  );
}

// ============================================================================
// Internal Functions
// ============================================================================

/**
 * Execute the semantic search pipeline
 */
async function executeSemanticSearch(
  tier1Result: GrepResult,
  prompt: string,
  activationReason: string,
  config: { maxResults: number; minSimilarity: number; searchTimeout: number },
  startTime: number
): Promise<SemanticResult> {
  try {
    // Construct semantic query
    const query = constructSemanticQuery(prompt, tier1Result.searchContext, []);

    // Create adapter and search
    const adapter = new ResonaAdapter();

    // Check health first
    const healthy = await adapter.isHealthy();
    if (!healthy) {
      // Graceful degradation - return empty results
      return createResult([], activationReason, true, startTime);
    }

    // Execute search with timeout
    const searchPromise = adapter.searchUnified(
      query.queryText,
      config.maxResults * 2 // Get more than needed for ranking
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Search timeout")), config.searchTimeout)
    );

    const unifiedResults = await Promise.race([searchPromise, timeoutPromise]);

    // Rank results
    const rankedResults = rankResults(unifiedResults, {
      maxResults: config.maxResults,
      minSimilarity: config.minSimilarity,
    });

    return createResult(rankedResults, activationReason, true, startTime);
  } catch (error) {
    // Graceful degradation on any error
    console.warn("[ACR Tier 2] Search error:", error);
    return createResult([], activationReason, true, startTime);
  }
}

/**
 * Create a SemanticResult with timing
 */
function createResult(
  results: RankedResult[],
  activationReason: string,
  activated: boolean,
  startTime: number
): SemanticResult {
  const totalLatencyMs = performance.now() - startTime;

  return {
    results,
    queryLatencyMs: 0, // Would be tracked separately in production
    embeddingLatencyMs: 0, // Would be tracked separately in production
    totalLatencyMs,
    activated,
    activationReason,
  };
}

// Re-export types for convenience
export type { SemanticResult, RankedResult, Tier2Options };
