/**
 * ACR - Autonomous Contextual Recall
 *
 * Two-tier architecture for automatic context retrieval:
 *
 * - **Tier 1**: Fast grep-based entity detection
 * - **Tier 2**: Resona semantic search (activated when Tier 1 confidence is low)
 *
 * Usage:
 * ```typescript
 * import { runTier1Grep, runTier2Semantic } from './acr';
 *
 * // Tier 1: Fast grep search
 * const tier1Result = await runTier1Grep(
 *   "Help me with Daniel's project",
 *   process.cwd()
 * );
 *
 * // Check if should escalate to Tier 2
 * if (tier1Result.escalateToTier2) {
 *   const tier2Result = await runTier2Semantic(tier1Result, prompt);
 *   console.log('Semantic results:', tier2Result.results);
 * } else {
 *   console.log('Grep matches:', tier1Result.matches);
 * }
 * ```
 *
 * Environment Variables:
 * - ACR_ENABLED: Set to "false" to disable ACR (default: enabled)
 * - ACR_TIER2_ENABLED: Set to "false" to disable Tier 2 (default: enabled)
 */

// ============================================================================
// Tier 1 - Grep-based entity detection
// ============================================================================

// Main entry point
export { runTier1Grep, aggregateResults } from "./tier1-grep";

// Types
export type { SearchContext, EntityMatch, GrepResult } from "./types";
export {
  SearchContextSchema,
  EntityMatchSchema,
  GrepResultSchema,
  createEmptyResult,
  shouldEscalate,
} from "./types";

// Entity extraction
export {
  extractEntities,
  extractProperNouns,
  extractProjectName,
  extractFilePaths,
} from "./entity-extractor";

// Grep engine
export {
  grepFile,
  grepFiles,
  readFileWithTimeout,
  isBinaryFile,
  extractContextWindow,
} from "./grep-engine";

// Match scoring
export { scoreMatch, scoreMatches } from "./match-scorer";

// Configuration
export {
  ACR_CONFIG,
  STOPWORDS,
  MATCH_SCORES,
  SEARCHABLE_EXTENSIONS,
  EXCLUDED_DIRS,
  isStopword,
  isValidEntityLength,
} from "./config";

// ============================================================================
// Tier 2 - Resona semantic search
// ============================================================================

// Main entry point
export { runTier2Semantic } from "./tier2-resona";
export type { Tier2Options } from "./tier2-resona";

// Types
export type {
  SemanticQuery,
  UnifiedResult,
  RankedResult,
  ActivationDecision,
  SemanticResult,
  Tier2Config,
  SourceType,
} from "./tier2-types";

export {
  SemanticQuerySchema,
  UnifiedResultSchema,
  RankedResultSchema,
  ActivationDecisionSchema,
  SemanticResultSchema,
  Tier2ConfigSchema,
  SourceTypeSchema,
  createEmptySemanticResult,
  createDefaultConfig,
} from "./tier2-types";

// Activation
export { shouldActivateTier2, detectExplicitTrigger } from "./tier2-activation";

// Query construction
export { extractKeyPhrases, constructSemanticQuery } from "./tier2-query";

// Result ranking
export { rankResults, deduplicateResults, computeDedupHash } from "./tier2-ranker";

// Resona adapter
export { ResonaAdapter } from "./resona-adapter";

// Session indexer
export { parseSessionHistory, extractSynopsis } from "./session-indexer";
export type { SessionEntry, SessionSynopsis } from "./session-indexer";

// Configuration
export { TIER2_CONFIG, isTriggerPhrase } from "./tier2-config";
