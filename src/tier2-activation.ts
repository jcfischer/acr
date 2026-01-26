/**
 * ACR Tier 2 - Activation Gate
 *
 * Determines when to trigger Tier 2 semantic search based on
 * Tier 1 confidence, result count, and explicit trigger phrases.
 */

import type { GrepResult } from "./types";
import type { ActivationDecision, Tier2Config } from "./tier2-types";
import { TIER2_CONFIG, isTriggerPhrase } from "./tier2-config";

// ============================================================================
// T-2.2: Explicit Trigger Detection
// ============================================================================

/**
 * Detect if a prompt contains explicit trigger phrases that should
 * force Tier 2 activation regardless of Tier 1 confidence.
 *
 * @param prompt User's prompt to check
 * @returns true if trigger phrase detected
 */
export function detectExplicitTrigger(prompt: string): boolean {
  return isTriggerPhrase(prompt);
}

// ============================================================================
// T-2.1: Activation Decision Logic
// ============================================================================

/**
 * Determine whether to activate Tier 2 semantic search.
 *
 * Activation conditions (in order of priority):
 * 1. Config disabled → don't activate
 * 2. Explicit trigger phrase → activate (explicit_request)
 * 3. No Tier 1 results → activate (no_results)
 * 4. Tier 1 confidence below threshold → activate (low_confidence)
 * 5. Otherwise → don't activate (disabled)
 *
 * @param tier1Result Result from Tier 1 grep
 * @param prompt User's prompt
 * @param config Optional config overrides
 * @returns ActivationDecision with shouldActivate, reason, and tier1Confidence
 */
export function shouldActivateTier2(
  tier1Result: GrepResult,
  prompt: string,
  config?: Partial<Tier2Config>
): ActivationDecision {
  const mergedConfig = { ...TIER2_CONFIG, ...config };
  const tier1Confidence = tier1Result.aggregateConfidence;

  // Check if disabled by config
  if (!mergedConfig.enabled) {
    return {
      shouldActivate: false,
      reason: "disabled",
      tier1Confidence,
    };
  }

  // Check for explicit trigger phrases (highest priority after disabled)
  if (detectExplicitTrigger(prompt)) {
    return {
      shouldActivate: true,
      reason: "explicit_request",
      tier1Confidence,
    };
  }

  // Check for no results
  if (tier1Result.matches.length === 0) {
    return {
      shouldActivate: true,
      reason: "no_results",
      tier1Confidence,
    };
  }

  // Check if confidence is below threshold
  if (tier1Confidence < mergedConfig.activationThreshold) {
    return {
      shouldActivate: true,
      reason: "low_confidence",
      tier1Confidence,
    };
  }

  // Default: don't activate
  return {
    shouldActivate: false,
    reason: "disabled",
    tier1Confidence,
  };
}
