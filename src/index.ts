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

// ============================================================================
// Tier 3 - Context Injection
// ============================================================================

// Main entry point
export { runContextInjection, handleAskResponse, handleAutoInjection, wouldProduceContext, getConfidenceSummary } from "./tier3-injection";
export type { InjectionOptions } from "./tier3-injection";

// Types
export type {
  InjectionAction,
  InjectionDecision,
  ContextSource,
  FormattedContext,
  AskOption,
  AskQuestion,
  AskPatternRequest,
  SessionACRState,
  Tier3Config,
  InjectionResult,
} from "./tier3-types";

export {
  SOURCE_PRIORITY,
  InjectionActionSchema,
  InjectionDecisionSchema,
  ContextSourceSchema,
  FormattedContextSchema,
  AskOptionSchema,
  AskQuestionSchema,
  AskPatternRequestSchema,
  SessionACRStateSchema,
  Tier3ConfigSchema,
  InjectionResultSchema,
  createEmptyInjectionResult,
  createSessionACRState,
  createDefaultTier3Config,
  getSourcePriority,
} from "./tier3-types";

// Confidence routing
export {
  shouldInjectAutomatically,
  shouldAskUser,
  isEntityRejected,
  isSourceApproved,
  classifyDecision,
  classifyTier1Matches,
  classifyTier2Results,
  filterByAction,
  getAutoInjectDecisions,
  getAskDecisions,
  getSkipDecisions,
} from "./tier3-confidence-router";

// Context formatting
export {
  entityMatchToContextSource,
  rankedResultToContextSource,
  formatSingleContext,
  formatMultipleContexts,
  formatTruncationIndicator,
  createFormattedContext,
  deduplicateSources,
  mergeSources,
  extractPreview,
} from "./tier3-formatter";

// Token budget
export {
  countTokens,
  countTokensMultiple,
  enforceTokenBudget,
  truncateSource,
  fitsInBudget,
  remainingBudget,
  isBudgetExhausted,
  addTokenCounts,
  getTotalTokenCount,
  getBudgetSummary,
} from "./tier3-token-budget";
export type { BudgetEnforcementResult } from "./tier3-token-budget";

// Session state
export {
  initSessionState,
  parseSessionState,
  rejectEntity,
  isRejected,
  unrejectEntity,
  approveSource,
  isApproved,
  unapproveSource,
  getApprovalTime,
  recordInjection,
  getInjectionCount,
  getTotalTokensInjected,
  getSessionDuration,
  getSessionDurationMinutes,
  getStateSummary,
  serializeState,
  deserializeState,
  resetState,
  resetRejections,
  resetApprovals,
} from "./tier3-session-state";

// Ask pattern
export {
  generateAskPattern,
  generateQuestion,
  generateMultiSourceAskPattern,
  parseAskResponse,
  isAcceptResponse,
  isRejectResponse,
  isPreviewResponse,
  formatSourceForDisplay,
  formatTimeAgo,
  calculateDaysAgo,
  isValidAskPattern,
} from "./tier3-ask-pattern";
export type { AskResponse } from "./tier3-ask-pattern";

// ============================================================================
// Tier 4 - Forgetting Policies (Temporal Decay)
// ============================================================================

// Types
export type {
  ContentType,
  ContentMetadata,
  DecayedResult,
  Tier4Config,
  DecayOptions,
} from "./tier4-types";

export {
  ContentTypeSchema,
  ContentMetadataSchema,
  DecayedResultSchema,
  Tier4ConfigSchema,
  DecayOptionsSchema,
  HALF_LIFE_DAYS,
  createDefaultTier4Config,
  getHalfLife,
  createDecayedResult,
} from "./tier4-types";

// Decay calculation
export {
  calculateDecayFactor,
  applyTemporalDecay,
  calculateAgeDays,
  calculateAgeDaysFromTimestamp,
  applyDecayWithMetadata,
  applyDecaySimple,
  applyDecayBatch,
  shouldArchive,
  daysUntilConfidence,
  getDecaySummary,
} from "./tier4-decay";

// Content type classification
export {
  classifyByPath,
  classifyBySourceType,
  classifyContent,
  getHalfLifeForPath,
  getHalfLifeForSourceType,
  isValidContentType,
  parseContentType,
  getContentTypeDescription,
  getContentTypesByHalfLife,
} from "./tier4-content-type";

// Metadata parsing
export {
  extractFrontmatter,
  parseFrontmatterDate,
  parseTTL,
  getFileTimestamps,
  extractMetadata,
  extractMetadataSync,
  createDefaultMetadata,
  isPermanent,
  usesDefaultDecay,
  hasExplicitExpiration,
  getExpirationDate,
  isExpired,
} from "./tier4-metadata";

// Integration with Tier 1 and Tier 2
export type {
  DecayedEntityMatch,
  DecayedRankedResult,
  DecayedGrepResult,
} from "./tier4-integration";

export {
  applyDecayToMatch,
  applyDecayToMatches,
  applyDecayToMatchesSync,
  applyDecayToRankedResult,
  applyDecayToRankedResults,
  applyDecayToRankedResultsSync,
  applyDecayToUnifiedResult,
  aggregateDecayedConfidence,
  shouldEscalateWithDecay,
  getCurrentTimestamp,
  timestampDaysAgo,
  getDecayStats,
} from "./tier4-integration";

// ============================================================================
// Maestro Session Indexing (F-005)
// ============================================================================

// Types
export type {
  MaestroEntryType,
  MaestroEntry,
  MaestroHistoryFile,
  MaestroEmbeddingInput,
  MaestroIndexState,
  MaestroFileState,
} from "./maestro-types";

export {
  MaestroEntryTypeSchema,
  MaestroEntrySchema,
  MaestroHistoryFileSchema,
  MaestroEmbeddingInputSchema,
  MaestroFileStateSchema,
  MaestroIndexStateSchema,
  MAESTRO_CONFIG,
  generateSourceId,
  parseSourceId,
  createEmptyIndexState,
} from "./maestro-types";

// Parser
export {
  parseMaestroHistoryFile,
  parseHistoryDirectory,
  filterIndexableEntries,
  toEmbeddingInputs,
  isValidMaestroFile,
} from "./maestro-parser";

// Indexer
export type { SyncOptions, SyncResult } from "./maestro-indexer";

export {
  loadIndexState,
  saveIndexState,
  detectChangedFiles,
  syncMaestroIndex,
  clearMaestroIndex,
} from "./maestro-indexer";
