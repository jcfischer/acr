/**
 * ACR Tier 4 - Integration with Tier 1 and Tier 2
 *
 * Applies temporal decay to results from grep and semantic search.
 * Decay is applied post-scoring, preserving original confidence for debugging.
 */

import type { EntityMatch, GrepResult } from "./types";
import type { RankedResult, UnifiedResult } from "./tier2-types";
import type { ContentType, Tier4Config, DecayedResult } from "./tier4-types";
import { createDefaultTier4Config, HALF_LIFE_DAYS } from "./tier4-types";
import {
  applyDecaySimple,
  calculateAgeDaysFromTimestamp,
} from "./tier4-decay";
import { classifyByPath, classifyBySourceType } from "./tier4-content-type";

// ============================================================================
// Extended Types with Decay Info
// ============================================================================

/**
 * EntityMatch extended with decay information.
 */
export interface DecayedEntityMatch extends EntityMatch {
  /** Original confidence before decay */
  rawConfidence: number;
  /** Age of content in days */
  ageDays: number;
  /** Decay factor applied */
  decayFactor: number;
  /** Content type used for decay */
  contentType: ContentType;
  /** Whether decay was bypassed */
  decayBypassed: boolean;
}

/**
 * RankedResult extended with decay information.
 */
export interface DecayedRankedResult extends RankedResult {
  /** Original similarity before decay */
  rawSimilarity: number;
  /** Age of content in days */
  ageDays: number;
  /** Decay factor applied */
  decayFactor: number;
  /** Content type used for decay */
  contentType: ContentType;
  /** Whether decay was bypassed */
  decayBypassed: boolean;
}

/**
 * GrepResult with decayed matches.
 */
export interface DecayedGrepResult extends Omit<GrepResult, "matches"> {
  matches: DecayedEntityMatch[];
  /** Whether decay was applied */
  decayApplied: boolean;
}

// ============================================================================
// Tier 1 Integration
// ============================================================================

/**
 * Apply temporal decay to a single EntityMatch.
 *
 * @param match Original match
 * @param fileTimestampMs Last modified timestamp of the source file (ms)
 * @param config Decay configuration
 * @returns Match with decayed confidence
 */
export function applyDecayToMatch(
  match: EntityMatch,
  fileTimestampMs: number,
  config: Tier4Config = createDefaultTier4Config()
): DecayedEntityMatch {
  const ageDays = calculateAgeDaysFromTimestamp(fileTimestampMs);
  const contentType = classifyByPath(match.source);

  const decayResult = applyDecaySimple(
    match.confidence,
    contentType,
    ageDays,
    config
  );

  return {
    ...match,
    confidence: decayResult.decayedConfidence, // Replace with decayed
    rawConfidence: decayResult.rawConfidence,
    ageDays: decayResult.ageDays,
    decayFactor: decayResult.decayFactor,
    contentType: decayResult.contentType,
    decayBypassed: decayResult.decayBypassed,
  };
}

/**
 * Apply temporal decay to an array of EntityMatches.
 *
 * @param matches Original matches
 * @param getTimestamp Function to get timestamp for a source file
 * @param config Decay configuration
 * @returns Matches with decayed confidence, sorted by decayed confidence
 */
export async function applyDecayToMatches(
  matches: EntityMatch[],
  getTimestamp: (source: string) => Promise<number>,
  config: Tier4Config = createDefaultTier4Config()
): Promise<DecayedEntityMatch[]> {
  if (matches.length === 0 || !config.enabled) {
    // Return original matches if decay disabled
    return matches.map((match) => ({
      ...match,
      rawConfidence: match.confidence,
      ageDays: 0,
      decayFactor: 1.0,
      contentType: classifyByPath(match.source),
      decayBypassed: true,
    }));
  }

  const decayed = await Promise.all(
    matches.map(async (match) => {
      const timestampMs = await getTimestamp(match.source);
      return applyDecayToMatch(match, timestampMs, config);
    })
  );

  // Re-sort by decayed confidence
  return decayed.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Apply decay to matches synchronously when timestamps are already known.
 *
 * @param matches Array of { match, timestampMs } pairs
 * @param config Decay configuration
 * @returns Decayed matches sorted by confidence
 */
export function applyDecayToMatchesSync(
  matches: Array<{ match: EntityMatch; timestampMs: number }>,
  config: Tier4Config = createDefaultTier4Config()
): DecayedEntityMatch[] {
  if (matches.length === 0) {
    return [];
  }

  const decayed = matches.map(({ match, timestampMs }) =>
    applyDecayToMatch(match, timestampMs, config)
  );

  return decayed.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// Tier 2 Integration
// ============================================================================

/**
 * Apply temporal decay to a single RankedResult.
 *
 * @param result Original result
 * @param timestampMs Content timestamp (ms)
 * @param config Decay configuration
 * @returns Result with decayed similarity
 */
export function applyDecayToRankedResult(
  result: RankedResult,
  timestampMs: number,
  config: Tier4Config = createDefaultTier4Config()
): DecayedRankedResult {
  const ageDays = calculateAgeDaysFromTimestamp(timestampMs);

  // Use sourceId for path-based classification, fall back to source type
  const contentType = result.sourceId
    ? classifyByPath(result.sourceId)
    : classifyBySourceType(result.source);

  const decayResult = applyDecaySimple(
    result.similarity,
    contentType,
    ageDays,
    config
  );

  return {
    ...result,
    similarity: decayResult.decayedConfidence, // Replace with decayed
    rawSimilarity: decayResult.rawConfidence,
    ageDays: decayResult.ageDays,
    decayFactor: decayResult.decayFactor,
    contentType: decayResult.contentType,
    decayBypassed: decayResult.decayBypassed,
  };
}

/**
 * Apply temporal decay to an array of RankedResults.
 *
 * @param results Original results
 * @param getTimestamp Function to get timestamp for a source
 * @param config Decay configuration
 * @returns Results with decayed similarity, re-ranked
 */
export async function applyDecayToRankedResults(
  results: RankedResult[],
  getTimestamp: (sourceId: string) => Promise<number>,
  config: Tier4Config = createDefaultTier4Config()
): Promise<DecayedRankedResult[]> {
  if (results.length === 0 || !config.enabled) {
    return results.map((result) => ({
      ...result,
      rawSimilarity: result.similarity,
      ageDays: 0,
      decayFactor: 1.0,
      contentType: result.sourceId
        ? classifyByPath(result.sourceId)
        : classifyBySourceType(result.source),
      decayBypassed: true,
    }));
  }

  const decayed = await Promise.all(
    results.map(async (result) => {
      const sourceKey = result.sourceId || result.source;
      const timestampMs = await getTimestamp(sourceKey);
      return applyDecayToRankedResult(result, timestampMs, config);
    })
  );

  // Re-rank by decayed similarity and update ranks
  decayed.sort((a, b) => b.similarity - a.similarity);
  decayed.forEach((result, index) => {
    result.rank = index;
  });

  return decayed;
}

/**
 * Apply decay to results synchronously when timestamps are already known.
 */
export function applyDecayToRankedResultsSync(
  results: Array<{ result: RankedResult; timestampMs: number }>,
  config: Tier4Config = createDefaultTier4Config()
): DecayedRankedResult[] {
  if (results.length === 0) {
    return [];
  }

  const decayed = results.map(({ result, timestampMs }) =>
    applyDecayToRankedResult(result, timestampMs, config)
  );

  // Re-rank by decayed similarity
  decayed.sort((a, b) => b.similarity - a.similarity);
  decayed.forEach((result, index) => {
    result.rank = index;
  });

  return decayed;
}

// ============================================================================
// Unified Result Processing
// ============================================================================

/**
 * Apply decay to UnifiedResult before ranking.
 */
export function applyDecayToUnifiedResult(
  result: UnifiedResult,
  timestampMs: number,
  config: Tier4Config = createDefaultTier4Config()
): UnifiedResult & { decayInfo: DecayedResult } {
  const contentType = result.sourceId
    ? classifyByPath(result.sourceId)
    : classifyBySourceType(result.source);

  const ageDays = calculateAgeDaysFromTimestamp(timestampMs);
  const decayResult = applyDecaySimple(
    result.similarity,
    contentType,
    ageDays,
    config
  );

  return {
    ...result,
    similarity: decayResult.decayedConfidence,
    decayInfo: decayResult,
  };
}

// ============================================================================
// Aggregate Confidence with Decay
// ============================================================================

/**
 * Calculate aggregate confidence from decayed matches.
 * Uses max confidence after decay, like original aggregateResults.
 *
 * @param matches Decayed matches
 * @returns Aggregate confidence (max of decayed confidences)
 */
export function aggregateDecayedConfidence(
  matches: DecayedEntityMatch[]
): number {
  if (matches.length === 0) {
    return 0;
  }
  return Math.max(...matches.map((m) => m.confidence));
}

/**
 * Recalculate escalation decision based on decayed confidence.
 *
 * @param aggregateConfidence Aggregate confidence after decay
 * @param threshold Escalation threshold (default: 0.7)
 * @returns True if should escalate to Tier 2
 */
export function shouldEscalateWithDecay(
  aggregateConfidence: number,
  threshold: number = 0.7
): boolean {
  return aggregateConfidence < threshold;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get default timestamp for testing (current time).
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Create a timestamp from days ago.
 */
export function timestampDaysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

/**
 * Get decay statistics for a set of results.
 */
export function getDecayStats(
  results: Array<{ decayFactor: number; decayBypassed: boolean }>
): {
  totalResults: number;
  decayedCount: number;
  bypassedCount: number;
  avgDecayFactor: number;
  minDecayFactor: number;
  maxDecayFactor: number;
} {
  const decayed = results.filter((r) => !r.decayBypassed);
  const bypassed = results.filter((r) => r.decayBypassed);

  const factors = decayed.map((r) => r.decayFactor);
  const avgDecayFactor =
    factors.length > 0
      ? factors.reduce((sum, f) => sum + f, 0) / factors.length
      : 1.0;

  return {
    totalResults: results.length,
    decayedCount: decayed.length,
    bypassedCount: bypassed.length,
    avgDecayFactor,
    minDecayFactor: factors.length > 0 ? Math.min(...factors) : 1.0,
    maxDecayFactor: factors.length > 0 ? Math.max(...factors) : 1.0,
  };
}
