/**
 * ACR Tier 2 - Type Definitions
 *
 * Types for Resona semantic retrieval tier.
 * All types include Zod schemas for runtime validation.
 */

import { z } from "zod";

// ============================================================================
// Source Type - Shared enum for data sources
// ============================================================================

export const SourceTypeSchema = z.enum(["user", "session", "tana", "maestro"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

// ============================================================================
// SemanticQuery - Input to semantic search pipeline
// ============================================================================

export const SemanticQuerySchema = z.object({
  /** Natural language query text for embedding */
  queryText: z.string().min(1, "Query text cannot be empty"),
  /** Current project context for grounding */
  projectContext: z.string(),
  /** Temporal hint for filtering results */
  temporalHint: z.enum(["recent", "any"]).optional(),
  /** Preferred sources to search (in order) */
  sourcePreference: z.array(SourceTypeSchema).optional(),
});

export type SemanticQuery = z.infer<typeof SemanticQuerySchema>;

// ============================================================================
// UnifiedResult - Raw result from Resona unified search
// ============================================================================

export const UnifiedResultSchema = z.object({
  /** Unique document ID */
  id: z.string(),
  /** Text content of the result */
  content: z.string(),
  /** Source type: user, session, or tana */
  source: SourceTypeSchema,
  /** Source-specific identifier (file path, session ID, node ID) */
  sourceId: z.string(),
  /** Similarity score 0.0 - 1.0 */
  similarity: z.number().min(0).max(1),
  /** Optional metadata from the source */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UnifiedResult = z.infer<typeof UnifiedResultSchema>;

// ============================================================================
// RankedResult - Processed result with ranking applied
// ============================================================================

export const RankedResultSchema = z.object({
  /** Text content of the result */
  content: z.string(),
  /** Source type: user, session, or tana */
  source: SourceTypeSchema,
  /** Source-specific identifier */
  sourceId: z.string(),
  /** Similarity score after source priority boost */
  similarity: z.number().min(0).max(1),
  /** Rank position (0-indexed) */
  rank: z.number().int().nonnegative(),
  /** Hash for deduplication */
  dedupHash: z.string(),
});

export type RankedResult = z.infer<typeof RankedResultSchema>;

// ============================================================================
// ActivationDecision - Whether to activate Tier 2
// ============================================================================

export const ActivationReasonSchema = z.enum([
  "low_confidence",
  "no_results",
  "explicit_request",
  "disabled",
]);

export type ActivationReason = z.infer<typeof ActivationReasonSchema>;

export const ActivationDecisionSchema = z.object({
  /** Whether Tier 2 should be activated */
  shouldActivate: z.boolean(),
  /** Reason for the decision */
  reason: ActivationReasonSchema,
  /** Tier 1 confidence score that triggered this decision */
  tier1Confidence: z.number().min(0).max(1),
});

export type ActivationDecision = z.infer<typeof ActivationDecisionSchema>;

// ============================================================================
// SemanticResult - Final output from Tier 2 pipeline
// ============================================================================

export const SemanticResultSchema = z.object({
  /** Ranked results from semantic search */
  results: z.array(RankedResultSchema),
  /** Time spent on query construction in ms */
  queryLatencyMs: z.number().nonnegative(),
  /** Time spent on embedding generation in ms */
  embeddingLatencyMs: z.number().nonnegative(),
  /** Total end-to-end latency in ms */
  totalLatencyMs: z.number().nonnegative(),
  /** Whether Tier 2 was actually activated */
  activated: z.boolean(),
  /** Reason for activation (if activated) */
  activationReason: z.string().optional(),
});

export type SemanticResult = z.infer<typeof SemanticResultSchema>;

// ============================================================================
// Tier2Config - Configuration for Tier 2 behavior
// ============================================================================

export const Tier2ConfigSchema = z.object({
  /** Confidence threshold below which Tier 2 activates */
  activationThreshold: z.number().min(0).max(1).default(0.7),
  /** Whether Tier 2 is enabled */
  enabled: z.boolean().default(true),
  /** Maximum number of results to return */
  maxResults: z.number().int().positive().default(10),
  /** Minimum similarity score to include in results */
  minSimilarity: z.number().min(0).max(1).default(0.6),
  /** Search timeout in milliseconds */
  searchTimeout: z.number().int().positive().default(5000),
  /** Source priority boosts for ranking */
  sourcePriority: z
    .object({
      user: z.number().default(0.1),
      session: z.number().default(0.05),
      tana: z.number().default(0),
    })
    .default({ user: 0.1, session: 0.05, tana: 0 }),
  /** Path to LanceDB embedding database */
  embeddingDbPath: z.string().default("~/.claude/embeddings/acr.lance"),
  /** Path to session history directory */
  sessionHistoryPath: z.string().default("~/.claude/projects"),
});

export type Tier2Config = z.infer<typeof Tier2ConfigSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty SemanticResult for when search is not activated or fails
 */
export function createEmptySemanticResult(
  activated: boolean = false,
  activationReason?: string
): SemanticResult {
  return {
    results: [],
    queryLatencyMs: 0,
    embeddingLatencyMs: 0,
    totalLatencyMs: 0,
    activated,
    activationReason,
  };
}

/**
 * Create default Tier2Config with environment overrides
 */
export function createDefaultConfig(): Tier2Config {
  return Tier2ConfigSchema.parse({
    enabled: process.env.ACR_TIER2_ENABLED !== "false",
  });
}
