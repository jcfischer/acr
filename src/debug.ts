/**
 * ACR Debug Utilities
 *
 * Debug output helpers with timing utilities.
 * Part of F-008: Logging, Metrics & Debug Mode
 */

import { debug as configDebug, isDebugEnabled } from "./logging-config";

// ============================================================================
// Re-exports
// ============================================================================

export { isDebugEnabled };

/**
 * Conditional debug output to stderr (re-export from logging-config)
 */
export const debug = configDebug;

// ============================================================================
// Timing Utilities
// ============================================================================

/**
 * Start a timer
 * @returns Current timestamp in milliseconds
 */
export function startTimer(): number {
  return Date.now();
}

/**
 * Calculate elapsed time since start
 * @param start - Start timestamp from startTimer()
 * @returns Elapsed time in milliseconds
 */
export function elapsed(start: number): number {
  return Date.now() - start;
}

// ============================================================================
// Formatted Debug Helpers
// ============================================================================

/**
 * Log query start with extracted entities
 * @param query - The query string
 * @param entities - Extracted entities from the query
 * @param configPath - Optional config path for testing
 */
export function debugQuery(
  query: string,
  entities: string[],
  configPath?: string
): void {
  debug(`Query: "${query}"`, configPath);
  debug(`Entities extracted: [${entities.map((e) => `"${e}"`).join(", ")}]`, configPath);
}

/**
 * Log Tier 1 results
 * @param matches - Number of grep matches
 * @param confidence - Confidence score (0-1)
 * @param ms - Time in milliseconds
 * @param configPath - Optional config path for testing
 */
export function debugTier1(
  matches: number,
  confidence: number,
  ms: number,
  configPath?: string
): void {
  debug(`Tier 1: ${matches} matches in ${ms}ms`, configPath);
  if (confidence < 1.0) {
    debug(
      `Tier 1 confidence: ${confidence.toFixed(2)}, escalating to Tier 2`,
      configPath
    );
  } else {
    debug(`Tier 1 confidence: ${confidence.toFixed(2)}, sufficient`, configPath);
  }
}

/**
 * Log Tier 2 results
 * @param matches - Number of semantic matches
 * @param topSim - Top similarity score (0-1)
 * @param ms - Time in milliseconds
 * @param configPath - Optional config path for testing
 */
export function debugTier2(
  matches: number,
  topSim: number,
  ms: number,
  configPath?: string
): void {
  debug(`Tier 2: vector search returned ${matches} results in ${ms}ms`, configPath);
  debug(`Tier 2: top similarity ${topSim.toFixed(2)}`, configPath);
}

/**
 * Log embedding generation
 * @param ms - Time in milliseconds
 * @param dims - Number of dimensions
 * @param configPath - Optional config path for testing
 */
export function debugEmbedding(
  ms: number,
  dims: number,
  configPath?: string
): void {
  debug(`Tier 2: embedding generated in ${ms}ms (${dims} dims)`, configPath);
}

/**
 * Log total query time
 * @param ms - Total time in milliseconds
 * @param configPath - Optional config path for testing
 */
export function debugTotal(ms: number, configPath?: string): void {
  debug(`Total time: ${ms}ms`, configPath);
}
