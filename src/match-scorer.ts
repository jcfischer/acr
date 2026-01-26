/**
 * ACR Tier 1 - Match Scorer
 *
 * Scores matches based on match type: exact, word boundary, partial.
 */

import type { EntityMatch } from "./types";
import { MATCH_SCORES } from "./config";

// ============================================================================
// T-4.1: Match Scoring
// ============================================================================

/**
 * Score a single match based on how well entity matches the context.
 *
 * Scoring rules:
 * - Exact match (same case): 1.0
 * - Word boundary match (whole word, different case): 0.8 - 0.1 = 0.7
 * - Partial match (substring): 0.6
 * - Case insensitive penalty: -0.1
 *
 * @param entity The entity that was searched for
 * @param matchedText The actual text that was matched in the file
 * @param context The surrounding context (snippet)
 * @returns Confidence score 0.0 - 1.0
 */
export function scoreMatch(
  entity: string,
  matchedText: string,
  context: string
): number {
  // Check if entity appears in context at all
  const entityLower = entity.toLowerCase();
  const contextLower = context.toLowerCase();

  if (!contextLower.includes(entityLower)) {
    return 0;
  }

  // Check for exact case-sensitive match
  if (context.includes(entity)) {
    // Check if it's a whole word match
    const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(entity)}\\b`);
    if (wordBoundaryRegex.test(context)) {
      return MATCH_SCORES.exact; // 1.0
    }
    // Partial match (substring within word)
    return MATCH_SCORES.partial; // 0.6
  }

  // Case-insensitive match
  const wordBoundaryRegexCI = new RegExp(`\\b${escapeRegex(entity)}\\b`, "i");
  if (wordBoundaryRegexCI.test(context)) {
    // Word boundary match with case difference
    return MATCH_SCORES.wordBoundary + MATCH_SCORES.caseInsensitivePenalty; // 0.8 - 0.1 = 0.7
  }

  // Partial case-insensitive match
  return MATCH_SCORES.partial + MATCH_SCORES.caseInsensitivePenalty; // 0.6 - 0.1 = 0.5
}

/**
 * Score an array of matches and return sorted by confidence.
 * Creates new array - does not mutate input.
 */
export function scoreMatches(matches: EntityMatch[]): EntityMatch[] {
  if (matches.length === 0) {
    return [];
  }

  // Score each match
  const scored = matches.map((match) => ({
    ...match,
    confidence: scoreMatch(match.entity, match.entity, match.snippet),
  }));

  // Sort by confidence descending
  scored.sort((a, b) => b.confidence - a.confidence);

  return scored;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape special regex characters in string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
