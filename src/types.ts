/**
 * ACR Tier 1 - Type Definitions
 *
 * Core types for Autonomous Contextual Recall grep-based entity detection.
 * All types include Zod schemas for runtime validation.
 */

import { z } from "zod";

// ============================================================================
// SearchContext - Input to the grep pipeline
// ============================================================================

export const SearchContextSchema = z.object({
  /** Entities extracted from user prompt to search for */
  entities: z.array(z.string()),
  /** Current working directory path */
  workingDir: z.string(),
  /** Recently mentioned file paths */
  recentFiles: z.array(z.string()),
  /** Original user prompt */
  rawPrompt: z.string(),
});

export type SearchContext = z.infer<typeof SearchContextSchema>;

// ============================================================================
// EntityMatch - Single match result
// ============================================================================

export const EntityMatchSchema = z.object({
  /** The entity that was searched for */
  entity: z.string(),
  /** Source file path (relative to USER/) */
  source: z.string(),
  /** Context snippet (±3 lines around match) */
  snippet: z.string(),
  /** Line number where match was found */
  line: z.number().int().nonnegative(),
  /** Confidence score 0.0 - 1.0 */
  confidence: z.number().min(0).max(1),
});

export type EntityMatch = z.infer<typeof EntityMatchSchema>;

// ============================================================================
// GrepResult - Aggregated pipeline output
// ============================================================================

export const GrepResultSchema = z.object({
  /** All matches found */
  matches: z.array(EntityMatchSchema),
  /** Maximum confidence across all matches */
  aggregateConfidence: z.number().min(0).max(1),
  /** Time taken for grep operation in milliseconds */
  latencyMs: z.number().nonnegative(),
  /** Whether to escalate to Tier 2 (Resona) - true if aggregateConfidence < 0.7 */
  escalateToTier2: z.boolean(),
  /** Original search context for debugging */
  searchContext: SearchContextSchema,
});

export type GrepResult = z.infer<typeof GrepResultSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty GrepResult for when no matches are found or on error
 */
export function createEmptyResult(
  searchContext: SearchContext,
  latencyMs: number = 0
): GrepResult {
  return {
    matches: [],
    aggregateConfidence: 0,
    latencyMs,
    escalateToTier2: true, // Always escalate when no matches
    searchContext,
  };
}

/**
 * Determine if result should escalate to Tier 2
 * Threshold: 0.7 (from config, but hardcoded here for type module independence)
 */
export function shouldEscalate(aggregateConfidence: number): boolean {
  return aggregateConfidence < 0.7;
}
