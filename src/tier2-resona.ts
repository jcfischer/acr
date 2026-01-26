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
import { constructSemanticQuery, generateAnswerFocusedQuery } from "./tier2-query";
import { ResonaAdapter } from "./resona-adapter";
import { rankResults } from "./tier2-ranker";
import type { UnifiedResult } from "./tier2-types";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for Tier 2 semantic search
 */
export interface Tier2Options {
  /** Enable/disable Tier 2 (default: true) */
  enabled?: boolean;
  /** Force activation regardless of Tier 1 confidence (default: false) */
  forceActivation?: boolean;
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
    forceActivation = false,
    activationThreshold = TIER2_CONFIG.activationThreshold,
    maxResults = TIER2_CONFIG.maxResults,
    minSimilarity = TIER2_CONFIG.minSimilarity,
    searchTimeout = TIER2_CONFIG.searchTimeout,
  } = options;

  // Check if disabled via options
  if (!enabled) {
    return createResult([], "disabled", false, startTime);
  }

  // If force activation is set, skip all gates and execute directly
  if (forceActivation) {
    return await executeSemanticSearch(
      tier1Result,
      prompt,
      "forced",
      { maxResults, minSimilarity, searchTimeout },
      startTime
    );
  }

  // Check for explicit trigger phrases first
  const hasExplicitTrigger = detectExplicitTrigger(prompt);
  if (hasExplicitTrigger) {
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
 * Execute the semantic search pipeline with multi-query support.
 *
 * For recall queries (e.g., "do you remember where we compared X vs Y"),
 * runs both:
 * 1. Original query (from prompt key phrases)
 * 2. Answer-focused query (targets the comparison content itself)
 *
 * Results are merged and deduplicated before ranking.
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

    // Generate answer-focused query for recall/comparison patterns
    const answerFocusedQuery = generateAnswerFocusedQuery(prompt);

    // Create adapter and search
    const adapter = new ResonaAdapter();

    // Check health first
    const healthy = await adapter.isHealthy();
    if (!healthy) {
      // Graceful degradation - return empty results
      return createResult([], activationReason, true, startTime);
    }

    // Build search promises
    const searchPromises: Promise<UnifiedResult[]>[] = [];

    // Primary query
    searchPromises.push(
      adapter.searchUnified(query.queryText, config.maxResults * 2)
    );

    // Answer-focused query (if available)
    if (answerFocusedQuery) {
      searchPromises.push(
        adapter.searchUnified(answerFocusedQuery, config.maxResults * 2)
      );
    }

    // Execute all queries with timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Search timeout")), config.searchTimeout)
    );

    const allResults = await Promise.race([
      Promise.all(searchPromises),
      timeoutPromise,
    ]);

    // Merge and deduplicate results
    const mergedResults = mergeSearchResults(allResults as UnifiedResult[][]);

    // Rank results
    const rankedResults = rankResults(mergedResults, {
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
 * Merge multiple search result arrays, deduplicating by source ID.
 * When duplicates exist, keep the one with higher similarity score.
 */
function mergeSearchResults(resultArrays: UnifiedResult[][]): UnifiedResult[] {
  const byId = new Map<string, UnifiedResult>();

  for (const results of resultArrays) {
    for (const result of results) {
      const existing = byId.get(result.id);
      if (!existing || result.similarity > existing.similarity) {
        byId.set(result.id, result);
      }
    }
  }

  // Return sorted by similarity (highest first)
  return Array.from(byId.values()).sort((a, b) => b.similarity - a.similarity);
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
export type { SemanticResult, RankedResult };
