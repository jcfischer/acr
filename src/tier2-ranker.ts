/**
 * ACR Tier 2 - Result Ranker
 *
 * Ranks, filters, and deduplicates semantic search results.
 */

import { createHash } from "crypto";
import type { UnifiedResult, RankedResult, SourceType } from "./tier2-types";
import { TIER2_CONFIG } from "./tier2-config";

// ============================================================================
// Types
// ============================================================================

/**
 * Ranking configuration options
 */
export interface RankingConfig {
  /** Maximum results to return */
  maxResults?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Source priority boosts */
  sourcePriority?: Record<SourceType, number>;
}

// ============================================================================
// T-6.2: Deduplication
// ============================================================================

/**
 * Maximum content length for dedup hash computation
 */
const DEDUP_CONTENT_LENGTH = 500;

/**
 * Compute a deduplication hash for a result.
 *
 * Hash is based on:
 * - First 500 chars of content
 * - Source type (user/session/tana)
 *
 * @param result Result to compute hash for
 * @returns SHA-256 hash string (first 16 chars)
 */
export function computeDedupHash(result: UnifiedResult): string {
  const contentPrefix = result.content.slice(0, DEDUP_CONTENT_LENGTH);
  const hashInput = `${contentPrefix}|${result.source}`;

  return createHash("sha256").update(hashInput).digest("hex").slice(0, 16);
}

/**
 * Deduplicate results by content hash.
 *
 * When duplicates are found, keeps the one with highest similarity.
 *
 * @param results Results to deduplicate
 * @returns Deduplicated results
 */
export function deduplicateResults(results: UnifiedResult[]): UnifiedResult[] {
  if (results.length === 0) {
    return [];
  }

  // Sort by similarity descending first
  const sorted = [...results].sort((a, b) => b.similarity - a.similarity);

  const seen = new Map<string, UnifiedResult>();

  for (const result of sorted) {
    const hash = computeDedupHash(result);
    if (!seen.has(hash)) {
      seen.set(hash, result);
    }
    // If already seen, skip (we already have the higher similarity version)
  }

  return Array.from(seen.values());
}

// ============================================================================
// T-6.1: Result Ranking
// ============================================================================

/**
 * Apply source priority boost to similarity score.
 *
 * @param similarity Raw similarity score
 * @param source Source type
 * @param priorities Source priority configuration
 * @returns Boosted similarity (capped at 1.0)
 */
function applySourceBoost(
  similarity: number,
  source: SourceType,
  priorities: Record<SourceType, number>
): number {
  const boost = priorities[source] || 0;
  return Math.min(1.0, similarity + boost);
}

/**
 * Rank and filter semantic search results.
 *
 * Processing steps:
 * 1. Deduplicate by content hash
 * 2. Apply source priority boosts
 * 3. Sort by boosted similarity descending
 * 4. Filter by minimum similarity
 * 5. Limit to maxResults
 * 6. Assign sequential ranks
 *
 * @param results Raw results from unified search
 * @param config Optional ranking configuration
 * @returns Ranked and filtered results
 */
export function rankResults(
  results: UnifiedResult[],
  config: RankingConfig = {}
): RankedResult[] {
  if (results.length === 0) {
    return [];
  }

  const {
    maxResults = TIER2_CONFIG.maxResults,
    minSimilarity = TIER2_CONFIG.minSimilarity,
    sourcePriority = TIER2_CONFIG.sourcePriority,
  } = config;

  // Step 1: Deduplicate
  const deduped = deduplicateResults(results);

  // Step 2-3: Apply boosts and sort
  const boosted = deduped.map((result) => ({
    ...result,
    similarity: applySourceBoost(result.similarity, result.source, sourcePriority),
  }));

  boosted.sort((a, b) => b.similarity - a.similarity);

  // Step 4: Filter by minimum similarity
  const filtered = boosted.filter((r) => r.similarity >= minSimilarity);

  // Step 5: Limit results
  const limited = filtered.slice(0, maxResults);

  // Step 6: Assign ranks and compute dedup hashes
  return limited.map((result, index) => ({
    content: result.content,
    source: result.source,
    sourceId: result.sourceId,
    similarity: result.similarity,
    rank: index,
    dedupHash: computeDedupHash(result),
  }));
}
