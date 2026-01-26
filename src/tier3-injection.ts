/**
 * ACR Tier 3 - Context Injection Orchestrator
 *
 * Main entry point for the Context Injection layer.
 * Receives Tier 1 and Tier 2 results, routes them through confidence
 * classification, token budget enforcement, and outputs formatted context
 * ready for injection.
 */

import type { GrepResult, EntityMatch } from "./types";
import type { SemanticResult, RankedResult } from "./tier2-types";
import type {
  InjectionResult,
  FormattedContext,
  AskPatternRequest,
  InjectionDecision,
  ContextSource,
  SessionACRState,
  Tier3Config,
} from "./tier3-types";
import {
  createEmptyInjectionResult,
  createDefaultTier3Config,
  createSessionACRState,
} from "./tier3-types";
import {
  classifyDecision,
  getAutoInjectDecisions,
  getAskDecisions,
} from "./tier3-confidence-router";
import {
  entityMatchToContextSource,
  rankedResultToContextSource,
  mergeSources,
  createFormattedContext,
} from "./tier3-formatter";
import {
  countTokens,
  enforceTokenBudget,
  addTokenCounts,
} from "./tier3-token-budget";
import {
  recordInjection,
  rejectEntity,
  approveSource,
} from "./tier3-session-state";
import { generateAskPattern, generateMultiSourceAskPattern } from "./tier3-ask-pattern";

// ============================================================================
// Options Interface
// ============================================================================

export interface InjectionOptions {
  /** Current session state (for rejection tracking) */
  sessionState?: SessionACRState;
  /** Configuration overrides */
  config?: Partial<Tier3Config>;
  /** Primary entity being searched for (for ask patterns) */
  primaryEntity?: string;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run the full context injection pipeline.
 *
 * Takes Tier 1 grep results and optional Tier 2 semantic results,
 * determines what to inject automatically vs ask about,
 * formats the context, and returns injection-ready output.
 *
 * @param tier1Result Results from runTier1Grep
 * @param tier2Result Optional results from runTier2Semantic
 * @param options Pipeline options
 * @returns InjectionResult with formatted context and/or ask pattern
 */
export async function runContextInjection(
  tier1Result: GrepResult,
  tier2Result: SemanticResult | null = null,
  options: InjectionOptions = {}
): Promise<InjectionResult> {
  const startTime = performance.now();

  const config = {
    ...createDefaultTier3Config(),
    ...options.config,
  };

  const sessionState = options.sessionState || createSessionACRState();
  const primaryEntity =
    options.primaryEntity ||
    tier1Result.searchContext.entities[0] ||
    "context";

  // If no results from either tier, return empty
  if (
    tier1Result.matches.length === 0 &&
    (!tier2Result || tier2Result.results.length === 0)
  ) {
    return createEmptyInjectionResult(performance.now() - startTime);
  }

  // Convert matches to context sources with token counts
  const tier1Sources = tier1Result.matches.map((match) =>
    entityMatchToContextSource(match, countTokens(match.snippet))
  );

  const tier2Sources = tier2Result
    ? tier2Result.results.map((result) =>
        rankedResultToContextSource(result, countTokens(result.content))
      )
    : [];

  // Merge and deduplicate sources
  const allSources = mergeSources(tier1Sources, tier2Sources);

  // Classify each source
  const decisions: InjectionDecision[] = allSources.map((source) =>
    classifyDecision(
      source.confidence,
      source.source,
      primaryEntity,
      sessionState,
      config
    )
  );

  // Separate by decision type
  const autoInjectDecisions = getAutoInjectDecisions(decisions);
  const askDecisions = getAskDecisions(decisions);

  // Get sources for auto-injection
  const autoInjectSources = allSources.filter((source, index) =>
    decisions[index].action === "inject"
  );

  // Get sources that need user confirmation
  const askSources = allSources.filter((source, index) =>
    decisions[index].action === "ask"
  );

  // Enforce token budget on auto-inject sources
  const budgetResult = enforceTokenBudget(
    addTokenCounts(autoInjectSources),
    config
  );

  // Create formatted context
  const formattedContext =
    budgetResult.includedSources.length > 0
      ? createFormattedContext(
          budgetResult.includedSources,
          budgetResult.truncated,
          allSources.length
        )
      : null;

  // Generate ask pattern if there are sources to ask about
  const askPattern = generateAskPatternIfNeeded(
    primaryEntity,
    askSources,
    config
  );

  const latencyMs = performance.now() - startTime;

  return {
    formattedContext,
    askPattern,
    decisions,
    latencyMs,
    hasContext: formattedContext !== null || askPattern !== null,
    debugInfo: config.debug
      ? {
          tier1Count: tier1Result.matches.length,
          tier2Count: tier2Result?.results.length ?? 0,
          mergedCount: allSources.length,
          autoInjectCount: autoInjectSources.length,
          askCount: askSources.length,
          budgetUsed: budgetResult.totalTokens,
          budgetMax: config.maxTokenBudget,
        }
      : undefined,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate ask pattern if there are sources to ask about.
 */
function generateAskPatternIfNeeded(
  entity: string,
  askSources: ContextSource[],
  config: Tier3Config
): AskPatternRequest | null {
  if (askSources.length === 0) {
    return null;
  }

  // If only one source, use single ask pattern
  if (askSources.length === 1) {
    return generateAskPattern(entity, askSources[0]);
  }

  // Multiple sources - use multi-source pattern
  return generateMultiSourceAskPattern(entity, askSources);
}

// ============================================================================
// Session State Helpers
// ============================================================================

/**
 * Update session state after user responds to ask pattern.
 */
export function handleAskResponse(
  state: SessionACRState,
  response: "include" | "skip",
  entity: string,
  source: string,
  tokenCount: number
): SessionACRState {
  if (response === "include") {
    let newState = approveSource(state, source);
    newState = recordInjection(newState, tokenCount);
    return newState;
  }

  return rejectEntity(state, entity);
}

/**
 * Update session state after automatic injection.
 */
export function handleAutoInjection(
  state: SessionACRState,
  sources: ContextSource[]
): SessionACRState {
  let newState = state;

  for (const source of sources) {
    newState = approveSource(newState, source.source);
    newState = recordInjection(newState, source.tokenCount);
  }

  return newState;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick check if injection would produce any context.
 *
 * Useful for deciding whether to run the full pipeline.
 */
export function wouldProduceContext(
  tier1Result: GrepResult,
  tier2Result: SemanticResult | null
): boolean {
  const hasT1 = tier1Result.matches.length > 0;
  const hasT2 = tier2Result && tier2Result.results.length > 0;
  return hasT1 || hasT2;
}

/**
 * Get a quick confidence summary without running full pipeline.
 */
export function getConfidenceSummary(
  tier1Result: GrepResult,
  tier2Result: SemanticResult | null
): {
  maxConfidence: number;
  avgConfidence: number;
  sourceCount: number;
} {
  const allConfidences: number[] = [
    ...tier1Result.matches.map((m) => m.confidence),
    ...(tier2Result?.results.map((r) => r.similarity) ?? []),
  ];

  if (allConfidences.length === 0) {
    return { maxConfidence: 0, avgConfidence: 0, sourceCount: 0 };
  }

  const maxConfidence = Math.max(...allConfidences);
  const avgConfidence =
    allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length;

  return {
    maxConfidence,
    avgConfidence,
    sourceCount: allConfidences.length,
  };
}

// ============================================================================
// Exports
// ============================================================================

export type { InjectionOptions };
