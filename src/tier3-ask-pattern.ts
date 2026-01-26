/**
 * ACR Tier 3 - Ask Pattern Generator
 *
 * Generates AskUserQuestion-compatible structures for user confirmation.
 * Implements FR-3 from F-003 spec.
 */

import type { ContextSource, AskPatternRequest, AskQuestion } from "./tier3-types";
import { extractPreview } from "./tier3-formatter";

// ============================================================================
// Ask Pattern Generation
// ============================================================================

/**
 * Generate an ask pattern for a single context source.
 *
 * Per spec FR-3:
 * - Question: "I found context about X from Y (Z days ago). Is this relevant?"
 * - Options: "Yes, include it", "No, skip it", "Show me first"
 */
export function generateAskPattern(
  entity: string,
  source: ContextSource,
  daysAgo: number = 0
): AskPatternRequest {
  const preview = extractPreview(source.content);
  const question = generateQuestion(entity, source.source, daysAgo);

  return {
    questions: [
      {
        header: "Context",
        question,
        options: [
          {
            label: "Yes, include it",
            description: "Add this context to current conversation",
          },
          {
            label: "No, skip it",
            description: "Don't include and don't ask again this session",
          },
          {
            label: "Show me first",
            description: "Preview the context before deciding",
          },
        ],
        multiSelect: false,
      },
    ],
    entity,
    source: source.source,
    daysAgo,
    preview,
  };
}

/**
 * Generate the question text for the ask pattern.
 */
export function generateQuestion(
  entity: string,
  source: string,
  daysAgo: number
): string {
  const sourceDisplay = formatSourceForDisplay(source);
  const timeDisplay = formatTimeAgo(daysAgo);

  return `I found context about "${entity}" from ${sourceDisplay}${timeDisplay}. Is this relevant?`;
}

/**
 * Generate an ask pattern for multiple sources.
 *
 * Used when there are several medium-confidence matches.
 */
export function generateMultiSourceAskPattern(
  entity: string,
  sources: ContextSource[]
): AskPatternRequest | null {
  if (sources.length === 0) {
    return null;
  }

  // Use the first source as the primary one
  const primarySource = sources[0];
  const preview = extractPreview(primarySource.content);

  // Build the question mentioning all sources
  const sourceList = sources
    .slice(0, 3)
    .map((s) => formatSourceForDisplay(s.source))
    .join(", ");

  const moreText =
    sources.length > 3 ? ` and ${sources.length - 3} more` : "";

  const question = `I found ${sources.length} relevant context items about "${entity}" from ${sourceList}${moreText}. Include them?`;

  return {
    questions: [
      {
        header: "Context",
        question,
        options: [
          {
            label: "Yes, include all",
            description: `Add all ${sources.length} context items`,
          },
          {
            label: "No, skip all",
            description: "Don't include any and don't ask again this session",
          },
          {
            label: "Let me choose",
            description: "Preview and select which to include",
          },
        ],
        multiSelect: false,
      },
    ],
    entity,
    source: primarySource.source,
    daysAgo: 0,
    preview,
  };
}

// ============================================================================
// Response Handling
// ============================================================================

/**
 * Possible user responses to ask pattern.
 */
export type AskResponse = "include" | "skip" | "preview" | "choose";

/**
 * Parse user's selected option into an AskResponse.
 */
export function parseAskResponse(selectedLabel: string): AskResponse {
  const label = selectedLabel.toLowerCase();

  if (label.includes("yes") || label.includes("include")) {
    return "include";
  }
  if (label.includes("no") || label.includes("skip")) {
    return "skip";
  }
  if (label.includes("show") || label.includes("preview")) {
    return "preview";
  }
  if (label.includes("choose") || label.includes("select")) {
    return "choose";
  }

  // Default to preview for unknown responses
  return "preview";
}

/**
 * Check if response indicates acceptance.
 */
export function isAcceptResponse(response: AskResponse): boolean {
  return response === "include";
}

/**
 * Check if response indicates rejection.
 */
export function isRejectResponse(response: AskResponse): boolean {
  return response === "skip";
}

/**
 * Check if response indicates need for more info.
 */
export function isPreviewResponse(response: AskResponse): boolean {
  return response === "preview" || response === "choose";
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a source path for display.
 *
 * Simplifies paths like "USER/CONTACTS/john-doe.md" to "Contacts (john-doe)"
 */
export function formatSourceForDisplay(source: string): string {
  // Handle USER/ paths
  if (source.toLowerCase().startsWith("user/")) {
    const parts = source.split("/");
    if (parts.length >= 3) {
      // USER/CONTACTS/john-doe.md -> Contacts (john-doe)
      const category = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
      const file = parts[parts.length - 1].replace(/\.[^/.]+$/, ""); // Remove extension
      return `${category} (${file})`;
    }
    if (parts.length === 2) {
      // USER/README.md -> User (README)
      const file = parts[1].replace(/\.[^/.]+$/, "");
      return `User (${file})`;
    }
  }

  // Handle session sources
  if (source.toLowerCase().includes("session")) {
    return "Session History";
  }

  // Handle Tana sources
  if (source.toLowerCase().includes("tana")) {
    return "Tana Notes";
  }

  // Default: just use the filename
  const filename = source.split("/").pop() || source;
  return filename.replace(/\.[^/.]+$/, ""); // Remove extension
}

/**
 * Format days ago for display.
 */
export function formatTimeAgo(daysAgo: number): string {
  if (daysAgo === 0) {
    return " (recently)";
  }
  if (daysAgo === 1) {
    return " (1 day ago)";
  }
  if (daysAgo < 7) {
    return ` (${daysAgo} days ago)`;
  }
  if (daysAgo < 30) {
    const weeks = Math.floor(daysAgo / 7);
    return weeks === 1 ? " (1 week ago)" : ` (${weeks} weeks ago)`;
  }
  if (daysAgo < 365) {
    const months = Math.floor(daysAgo / 30);
    return months === 1 ? " (1 month ago)" : ` (${months} months ago)`;
  }

  const years = Math.floor(daysAgo / 365);
  return years === 1 ? " (1 year ago)" : ` (${years} years ago)`;
}

/**
 * Calculate days ago from a timestamp.
 */
export function calculateDaysAgo(timestampMs: number): number {
  const now = Date.now();
  const diffMs = now - timestampMs;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if an ask pattern is valid.
 */
export function isValidAskPattern(pattern: AskPatternRequest): boolean {
  if (!pattern.questions || pattern.questions.length === 0) {
    return false;
  }

  for (const question of pattern.questions) {
    if (!question.question || !question.options || question.options.length < 2) {
      return false;
    }
    if (question.header.length > 12) {
      return false;
    }
  }

  return true;
}
