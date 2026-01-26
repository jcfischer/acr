/**
 * ACR Tier 3 - Token Budget Management
 *
 * Manages token allocation for ACR context.
 * Implements FR-4 from F-003 spec.
 *
 * Uses a simple approximation for cl100k_base tokenizer:
 * - Average ~4 characters per token
 * - 20% overcount for safety margin on error
 */

import type { ContextSource, Tier3Config } from "./tier3-types";
import { createDefaultTier3Config } from "./tier3-types";

// ============================================================================
// Token Counting
// ============================================================================

/**
 * Approximate token count for text.
 *
 * Uses ~4 chars/token approximation for cl100k_base.
 * This is conservative - real count may be lower.
 *
 * Per spec NFR: On token counting error, use conservative estimate (overcount by 20%)
 */
export function countTokens(text: string): number {
  if (!text) return 0;

  // Base approximation: ~4 chars per token
  const baseCount = Math.ceil(text.length / 4);

  // Add 20% safety margin per spec
  return Math.ceil(baseCount * 1.2);
}

/**
 * Count tokens for multiple strings.
 */
export function countTokensMultiple(texts: string[]): number {
  return texts.reduce((sum, text) => sum + countTokens(text), 0);
}

// ============================================================================
// Budget Enforcement
// ============================================================================

/**
 * Result of budget enforcement.
 */
export interface BudgetEnforcementResult {
  /** Sources that fit within budget */
  includedSources: ContextSource[];
  /** Total tokens of included sources */
  totalTokens: number;
  /** Whether any sources were truncated/excluded */
  truncated: boolean;
  /** Number of sources excluded */
  excludedCount: number;
}

/**
 * Enforce token budget on a list of context sources.
 *
 * Per spec FR-4:
 * - Maximum 2000 tokens allocated for ACR context
 * - Sort by confidence descending
 * - Include highest confidence items first
 * - Truncate last item if partial fit
 *
 * @param sources Context sources (should already have tokenCount set)
 * @param config Configuration with maxTokenBudget
 * @returns BudgetEnforcementResult with included sources
 */
export function enforceTokenBudget(
  sources: ContextSource[],
  config: Tier3Config = createDefaultTier3Config()
): BudgetEnforcementResult {
  if (sources.length === 0) {
    return {
      includedSources: [],
      totalTokens: 0,
      truncated: false,
      excludedCount: 0,
    };
  }

  const maxBudget = config.maxTokenBudget;

  // Sort by priority descending, then confidence descending
  const sorted = [...sources].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.confidence - a.confidence;
  });

  const included: ContextSource[] = [];
  let totalTokens = 0;
  let truncated = false;

  for (const source of sorted) {
    const newTotal = totalTokens + source.tokenCount;

    if (newTotal <= maxBudget) {
      // Fits completely
      included.push(source);
      totalTokens = newTotal;
    } else if (totalTokens < maxBudget) {
      // Partial fit - try to truncate content
      const remainingBudget = maxBudget - totalTokens;
      const truncatedSource = truncateSource(source, remainingBudget);

      if (truncatedSource) {
        included.push(truncatedSource);
        totalTokens += truncatedSource.tokenCount;
      }
      truncated = true;
      break;
    } else {
      // No more budget
      truncated = true;
      break;
    }
  }

  return {
    includedSources: included,
    totalTokens,
    truncated,
    excludedCount: sources.length - included.length,
  };
}

/**
 * Truncate a source's content to fit within a token budget.
 *
 * Returns null if the source can't be meaningfully truncated.
 */
export function truncateSource(
  source: ContextSource,
  maxTokens: number
): ContextSource | null {
  // Minimum meaningful content: ~20 tokens
  if (maxTokens < 20) {
    return null;
  }

  // Approximate character limit from token limit
  // Using 4 chars/token and accounting for the 20% safety margin
  const charLimit = Math.floor((maxTokens * 4) / 1.2);

  if (charLimit < 50) {
    return null;
  }

  const truncatedContent = source.content.slice(0, charLimit - 3) + "...";

  return {
    ...source,
    content: truncatedContent,
    tokenCount: countTokens(truncatedContent),
  };
}

// ============================================================================
// Budget Checking
// ============================================================================

/**
 * Check if a single source fits within remaining budget.
 */
export function fitsInBudget(
  source: ContextSource,
  currentTotal: number,
  maxBudget: number
): boolean {
  return currentTotal + source.tokenCount <= maxBudget;
}

/**
 * Calculate remaining budget.
 */
export function remainingBudget(
  currentTotal: number,
  maxBudget: number
): number {
  return Math.max(0, maxBudget - currentTotal);
}

/**
 * Check if budget is exhausted.
 */
export function isBudgetExhausted(
  currentTotal: number,
  maxBudget: number
): boolean {
  return currentTotal >= maxBudget;
}

// ============================================================================
// Source Token Counting
// ============================================================================

/**
 * Add token counts to sources that don't have them.
 */
export function addTokenCounts(sources: ContextSource[]): ContextSource[] {
  return sources.map((source) => ({
    ...source,
    tokenCount: source.tokenCount || countTokens(source.content),
  }));
}

/**
 * Get total token count for a list of sources.
 */
export function getTotalTokenCount(sources: ContextSource[]): number {
  return sources.reduce((sum, source) => sum + source.tokenCount, 0);
}

// ============================================================================
// Debug Helpers
// ============================================================================

/**
 * Get budget summary for debugging.
 */
export function getBudgetSummary(
  sources: ContextSource[],
  config: Tier3Config = createDefaultTier3Config()
): {
  totalSources: number;
  totalTokens: number;
  maxBudget: number;
  overBudget: boolean;
  overBudgetBy: number;
} {
  const totalTokens = getTotalTokenCount(sources);
  const maxBudget = config.maxTokenBudget;

  return {
    totalSources: sources.length,
    totalTokens,
    maxBudget,
    overBudget: totalTokens > maxBudget,
    overBudgetBy: Math.max(0, totalTokens - maxBudget),
  };
}
