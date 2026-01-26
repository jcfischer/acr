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
export {
  loadIndexState as loadSessionIndexState,
  saveIndexState as saveSessionIndexState,
  shouldReindexSession,
  getChangedSessions,
  syncSessionIndex,
  clearSessionIndex,
  getSessionIndexStatus,
} from "./session-indexer";

// Session types
export type {
  ParsedTurn,
  ParsedSession,
  SessionEmbeddingInput,
  IndexedSessionState,
  SessionIndexState,
  SyncOptions as SessionSyncOptions,
  SyncResultWithEmbeddings as SessionSyncResult,
} from "./session-types";

export {
  SESSION_CONFIG,
  ParsedTurnSchema,
  ParsedSessionSchema,
  SessionEmbeddingInputSchema,
  IndexedSessionStateSchema,
  SessionIndexStateSchema,
  createEmptyIndexState as createEmptySessionIndexState,
  generateSourceId as generateSessionSourceId,
} from "./session-types";

// Session parser
export {
  scanSessionFiles,
  parseSessionFile,
  toEmbeddingInputs as toSessionEmbeddingInputs,
  filterTurnsForEmbedding,
} from "./session-parser";
export type { SessionFileInfo } from "./session-parser";

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
  IndexedFileState,
  SyncOptions,
  SyncResult,
  SyncResultWithEmbeddings,
  IndexStatus,
} from "./maestro-types";

export {
  MaestroEntryTypeSchema,
  MaestroEntrySchema,
  MaestroHistoryFileSchema,
  MaestroEmbeddingInputSchema,
  IndexedFileStateSchema,
  MaestroIndexStateSchema,
  SyncOptionsSchema,
  SyncResultSchema,
  IndexStatusSchema,
  MAESTRO_CONFIG,
  generateSourceId,
  createEmptyIndexState,
  createEmbeddingInput,
} from "./maestro-types";
export type { SyncProgressCallback, SyncOptionsWithProgress } from "./maestro-types";

// Parser
export {
  parseMaestroHistoryFile,
  parseHistoryDirectory,
  filterIndexableEntries,
  toEmbeddingInputs,
  isValidMaestroFile,
} from "./maestro-parser";

// Indexer
export {
  loadIndexState,
  saveIndexState,
  getChangedFiles,
  shouldReindexFile,
  syncMaestroIndex,
  clearMaestroIndex,
  getMaestroIndexStatus,
  runMaestroSync,
  runMaestroStatus,
  runMaestroClear,
} from "./maestro-indexer";
export type { ChangedFile } from "./maestro-indexer";

// ============================================================================
// PAI Memory Indexing (F-006)
// ============================================================================

// Types
export type {
  MemoryCaptureType,
  MemoryEntry,
  MemoryEmbeddingInput,
  MemoryFileState,
  MemoryIndexState,
} from "./memory-types";

export {
  MemoryCaptureTypeSchema,
  MemoryEntrySchema,
  MemoryEmbeddingInputSchema,
  MemoryFileStateSchema,
  MemoryIndexStateSchema,
  MEMORY_CONFIG,
  generateSourceId as generateMemorySourceId,
  parseSourceId as parseMemorySourceId,
  createEmptyIndexState as createEmptyMemoryIndexState,
  captureTypeFromPath,
} from "./memory-types";

// Parser
export {
  extractFrontmatter as extractMemoryFrontmatter,
  parseFrontmatterTimestamp,
  extractTitle,
  parseMemoryFile,
  scanMemoryDirectory,
  scanAllMemoryDirectories,
  toEmbeddingInputs as toMemoryEmbeddingInputs,
} from "./memory-parser";

// Indexer
export type { MemorySyncConfig, MemorySyncResult, MemorySyncResultWithEmbeddings, ChangeDetectionResult } from "./memory-indexer";

export {
  loadIndexState as loadMemoryIndexState,
  saveIndexState as saveMemoryIndexState,
  detectChanges,
  syncMemoryIndex,
  clearMemoryIndex,
} from "./memory-indexer";

// ============================================================================
// Resona Integration (F-007)
// ============================================================================

// Embedding Types
export type {
  EmbeddingSource,
  EmbeddingInput,
  EmbeddingRecord,
  EmbeddingConfig,
} from "./embedding-types";

export {
  EmbeddingSourceSchema,
  EmbeddingInputSchema,
  EmbeddingRecordSchema,
  EmbeddingConfigSchema,
  EMBEDDING_CONFIG,
  createDefaultConfig as createDefaultEmbeddingConfig,
  validateConfig as validateEmbeddingConfig,
} from "./embedding-types";

// Embedding Service
export { EmbeddingService } from "./embedding-service";
export type { EmbeddingServiceConfig } from "./embedding-service";

// Vector Store
export { VectorStore } from "./vector-store";
export type {
  EmbeddingStoreRecord,
  SearchResult as VectorSearchResult,
  TableStats,
  SearchFilter,
} from "./vector-store";

// Embedding Indexer
export { indexEmbeddings } from "./embedding-indexer";
export type { IndexableInput, IndexingResult, IndexingOptions } from "./embedding-indexer";

// Resona Adapter (enhanced)
export type { VectorSearchOptions } from "./resona-adapter";

// Progress Bar Utility
export {
  formatProgressBar,
  createCliProgressReporter,
  Spinner,
} from "./progress";
export type {
  ProgressBarOptions,
  ProgressReporter,
  ProgressCallback,
} from "./progress";
