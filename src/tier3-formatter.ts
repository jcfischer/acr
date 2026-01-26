/**
 * ACR Tier 3 - Context Formatter
 *
 * Formats retrieved context for injection into Claude sessions.
 * Implements FR-2 from F-003 spec.
 */

import type { EntityMatch } from "./types";
import type { RankedResult } from "./tier2-types";
import type { ContextSource, FormattedContext } from "./tier3-types";
import { getSourcePriority } from "./tier3-types";

// ============================================================================
// Context Source Creation
// ============================================================================

/**
 * Convert a Tier 1 EntityMatch to a ContextSource.
 */
export function entityMatchToContextSource(
  match: EntityMatch,
  tokenCount: number
): ContextSource {
  return {
    content: match.snippet,
    source: match.source,
    confidence: match.confidence,
    tokenCount,
    priority: getSourcePriority(match.source),
    tier: "tier1",
  };
}

/**
 * Convert a Tier 2 RankedResult to a ContextSource.
 */
export function rankedResultToContextSource(
  result: RankedResult,
  tokenCount: number
): ContextSource {
  return {
    content: result.content,
    source: result.sourceId,
    confidence: result.similarity,
    tokenCount,
    priority: getSourcePriority(result.sourceId),
    tier: "tier2",
  };
}

// ============================================================================
// ACR Context Tag Formatting
// ============================================================================

/**
 * Format a single context source as an ACR XML tag.
 *
 * Output format per spec FR-2:
 * <acr-context source="USER/CONTACTS/john-doe.md" confidence="0.85">
 * Content here...
 * </acr-context>
 */
export function formatSingleContext(source: ContextSource): string {
  const confidenceStr = source.confidence.toFixed(2);
  return `<acr-context source="${escapeXmlAttribute(source.source)}" confidence="${confidenceStr}" tier="${source.tier}">
${source.content.trim()}
</acr-context>`;
}

/**
 * Format multiple context sources into a single block.
 *
 * Sources are sorted by priority (highest first) and then by confidence.
 */
export function formatMultipleContexts(sources: ContextSource[]): string {
  if (sources.length === 0) {
    return "";
  }

  // Sort by priority descending, then confidence descending
  const sorted = [...sources].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.confidence - a.confidence;
  });

  return sorted.map(formatSingleContext).join("\n\n");
}

/**
 * Format a truncation indicator.
 *
 * Per spec FR-4:
 * [context: truncated, showing 3/7 matches]
 */
export function formatTruncationIndicator(
  included: number,
  total: number
): string {
  return `[context: truncated, showing ${included}/${total} matches]`;
}

// ============================================================================
// Main Formatting Function
// ============================================================================

/**
 * Format context sources into a FormattedContext.
 *
 * This function assumes token counting and budget enforcement
 * have already been done - it just formats what it's given.
 */
export function createFormattedContext(
  sources: ContextSource[],
  truncated: boolean,
  totalAvailable: number
): FormattedContext {
  if (sources.length === 0) {
    return {
      content: "",
      totalTokens: 0,
      truncated: false,
      sourcesIncluded: 0,
      sourcesTotal: totalAvailable,
      sources: [],
    };
  }

  // Build the formatted content
  let content = formatMultipleContexts(sources);

  // Add truncation indicator if needed
  if (truncated) {
    content += `\n\n${formatTruncationIndicator(sources.length, totalAvailable)}`;
  }

  // Calculate total tokens
  const totalTokens = sources.reduce((sum, s) => sum + s.tokenCount, 0);

  return {
    content,
    totalTokens,
    truncated,
    sourcesIncluded: sources.length,
    sourcesTotal: totalAvailable,
    sources,
  };
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Remove duplicate content from sources.
 *
 * Uses content similarity (exact match after normalization) to detect duplicates.
 * Keeps the source with higher priority/confidence.
 */
export function deduplicateSources(sources: ContextSource[]): ContextSource[] {
  const seen = new Map<string, ContextSource>();

  for (const source of sources) {
    const key = normalizeContent(source.content);

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, source);
    } else {
      // Keep the one with higher priority, or higher confidence if same priority
      if (
        source.priority > existing.priority ||
        (source.priority === existing.priority &&
          source.confidence > existing.confidence)
      ) {
        seen.set(key, source);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Merge sources from Tier 1 and Tier 2, removing duplicates.
 *
 * Per spec scenario 4:
 * - Duplicates removed (same content from different sources)
 * - Sources prioritized: USER/ > session > Tana
 */
export function mergeSources(
  tier1Sources: ContextSource[],
  tier2Sources: ContextSource[]
): ContextSource[] {
  // Combine all sources
  const allSources = [...tier1Sources, ...tier2Sources];

  // Deduplicate
  const deduplicated = deduplicateSources(allSources);

  // Sort by priority descending, then confidence descending
  return deduplicated.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.confidence - a.confidence;
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape special characters for XML attribute values.
 */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Normalize content for deduplication comparison.
 *
 * - Lowercases
 * - Removes extra whitespace
 * - Trims
 */
function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract a preview snippet from content.
 *
 * @param content Full content
 * @param maxLength Maximum characters for preview (default 200)
 */
export function extractPreview(content: string, maxLength: number = 200): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength - 3) + "...";
}
