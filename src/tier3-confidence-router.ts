/**
 * ACR Tier 3 - Confidence-Based Router
 *
 * Decision logic for injection vs ask vs skip.
 * Implements FR-1 from F-003 spec.
 */

import type { EntityMatch } from "./types";
import type { RankedResult } from "./tier2-types";
import type {
  InjectionAction,
  InjectionDecision,
  Tier3Config,
  SessionACRState,
} from "./tier3-types";
import { createDefaultTier3Config } from "./tier3-types";

// ============================================================================
// Core Routing Logic
// ============================================================================

/**
 * Determine if context should be injected automatically.
 *
 * Per spec FR-1:
 * - High confidence from identity sources (>= 0.9): always inject
 * - High confidence general (>= 0.7): inject
 * - Medium confidence (>= 0.5): ask user
 * - Low confidence (< 0.5): silently skip
 */
export function shouldInjectAutomatically(
  confidence: number,
  source: string,
  config: Tier3Config = createDefaultTier3Config()
): boolean {
  // High confidence from identity sources: always inject
  if (
    confidence >= 0.9 &&
    source.toLowerCase().includes("user/daidentity")
  ) {
    return true;
  }

  // High confidence general: inject
  return confidence >= config.autoInjectThreshold;
}

/**
 * Determine if we should ask the user about this context.
 *
 * Returns true if confidence is in the "ask" range (0.5 - 0.7 by default).
 */
export function shouldAskUser(
  confidence: number,
  config: Tier3Config = createDefaultTier3Config()
): boolean {
  return (
    confidence >= config.askThreshold &&
    confidence < config.autoInjectThreshold
  );
}

/**
 * Check if an entity has been rejected in this session.
 */
export function isEntityRejected(
  entity: string,
  state: SessionACRState
): boolean {
  return state.rejectedEntities.some(
    (rejected) => rejected.toLowerCase() === entity.toLowerCase()
  );
}

/**
 * Check if a source has been approved in this session.
 */
export function isSourceApproved(
  source: string,
  state: SessionACRState
): boolean {
  const lowerSource = source.toLowerCase();
  return Object.keys(state.acceptedSources).some(
    (approved) => approved.toLowerCase() === lowerSource
  );
}

// ============================================================================
// Main Routing Function
// ============================================================================

/**
 * Classify what action to take for a piece of context.
 *
 * @param confidence Confidence score 0-1
 * @param source Source path or identifier
 * @param entity Entity that triggered this context (for rejection tracking)
 * @param state Current session state
 * @param config Configuration
 * @returns InjectionDecision with action and reasoning
 */
export function classifyDecision(
  confidence: number,
  source: string,
  entity: string,
  state: SessionACRState,
  config: Tier3Config = createDefaultTier3Config()
): InjectionDecision {
  // Check if entity was previously rejected this session
  if (isEntityRejected(entity, state)) {
    return {
      action: "skip",
      confidence,
      source,
      reason: `Entity "${entity}" was rejected earlier in this session`,
    };
  }

  // Check if source was previously approved this session
  if (isSourceApproved(source, state)) {
    return {
      action: "inject",
      confidence,
      source,
      reason: `Source "${source}" was approved earlier in this session`,
    };
  }

  // High confidence from identity sources
  if (
    confidence >= 0.9 &&
    source.toLowerCase().includes("user/daidentity")
  ) {
    return {
      action: "inject",
      confidence,
      source,
      reason: "High confidence identity context (>= 0.9)",
    };
  }

  // High confidence general
  if (confidence >= config.autoInjectThreshold) {
    return {
      action: "inject",
      confidence,
      source,
      reason: `High confidence (${confidence.toFixed(2)} >= ${config.autoInjectThreshold})`,
    };
  }

  // Medium confidence - ask user
  if (confidence >= config.askThreshold) {
    return {
      action: "ask",
      confidence,
      source,
      reason: `Medium confidence (${config.askThreshold} <= ${confidence.toFixed(2)} < ${config.autoInjectThreshold})`,
    };
  }

  // Low confidence - skip silently
  return {
    action: "skip",
    confidence,
    source,
    reason: `Low confidence (${confidence.toFixed(2)} < ${config.askThreshold})`,
  };
}

// ============================================================================
// Batch Classification
// ============================================================================

/**
 * Classify decisions for all Tier 1 matches.
 */
export function classifyTier1Matches(
  matches: EntityMatch[],
  state: SessionACRState,
  config: Tier3Config = createDefaultTier3Config()
): InjectionDecision[] {
  return matches.map((match) =>
    classifyDecision(match.confidence, match.source, match.entity, state, config)
  );
}

/**
 * Classify decisions for all Tier 2 results.
 */
export function classifyTier2Results(
  results: RankedResult[],
  entity: string,
  state: SessionACRState,
  config: Tier3Config = createDefaultTier3Config()
): InjectionDecision[] {
  return results.map((result) =>
    classifyDecision(result.similarity, result.sourceId, entity, state, config)
  );
}

// ============================================================================
// Filtering Helpers
// ============================================================================

/**
 * Filter decisions by action type.
 */
export function filterByAction(
  decisions: InjectionDecision[],
  action: InjectionAction
): InjectionDecision[] {
  return decisions.filter((d) => d.action === action);
}

/**
 * Get all decisions that should be auto-injected.
 */
export function getAutoInjectDecisions(
  decisions: InjectionDecision[]
): InjectionDecision[] {
  return filterByAction(decisions, "inject");
}

/**
 * Get all decisions that should prompt the user.
 */
export function getAskDecisions(
  decisions: InjectionDecision[]
): InjectionDecision[] {
  return filterByAction(decisions, "ask");
}

/**
 * Get all decisions that should be skipped.
 */
export function getSkipDecisions(
  decisions: InjectionDecision[]
): InjectionDecision[] {
  return filterByAction(decisions, "skip");
}
