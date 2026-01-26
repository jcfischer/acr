/**
 * ACR Tier 4 - Content Type Classification
 *
 * Classifies content sources to determine appropriate half-life.
 * Identity context persists longest, operational context fades fastest.
 */

import type { ContentType } from "./tier4-types";
import { ContentTypeSchema, HALF_LIFE_DAYS } from "./tier4-types";

// ============================================================================
// Path Pattern Matching
// ============================================================================

/**
 * Patterns for classifying content by file path.
 * More specific patterns are checked first.
 */
const PATH_PATTERNS: Array<{ pattern: RegExp; type: ContentType }> = [
  // Identity - highest priority, longest half-life
  { pattern: /daidentity\.md$/i, type: "identity" },
  { pattern: /algoprefs\.md$/i, type: "identity" },
  { pattern: /preferences\.md$/i, type: "identity" },

  // Contacts
  { pattern: /contacts?\//i, type: "contacts" },
  { pattern: /people\//i, type: "contacts" },

  // Projects (Telos)
  { pattern: /telos\/projects?\.md$/i, type: "projects" },
  { pattern: /projects?\//i, type: "projects" },

  // Learnings
  { pattern: /telos\/learned\.md$/i, type: "learnings" },
  { pattern: /learnings?\.md$/i, type: "learnings" },
  { pattern: /learning\//i, type: "learnings" },

  // Sessions (Maestro synopses)
  { pattern: /sessions?\//i, type: "sessions" },
  { pattern: /synops[ie]s?\.md$/i, type: "sessions" },
  { pattern: /history\.json$/i, type: "sessions" },

  // Operational - default for unmatched USER/ content
  { pattern: /work\//i, type: "operational" },
  { pattern: /tasks?\//i, type: "operational" },
  { pattern: /todo\.md$/i, type: "operational" },
];

/**
 * Source type patterns for Tier 2 results.
 */
const SOURCE_TYPE_MAP: Record<string, ContentType> = {
  user: "operational",        // Default for user content
  "user/identity": "identity",
  "user/contacts": "contacts",
  "user/projects": "projects",
  "user/learnings": "learnings",
  session: "sessions",
  tana: "operational",       // External sources decay fastest
};

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Classify content by file path.
 *
 * @param filePath File path (absolute or relative)
 * @returns Classified content type
 */
export function classifyByPath(filePath: string): ContentType {
  const normalizedPath = filePath.toLowerCase();

  // Check specific patterns first
  for (const { pattern, type } of PATH_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return type;
    }
  }

  // Default classification based on directory
  if (normalizedPath.includes("user/")) {
    return "operational"; // Generic user content
  }

  // Default to operational (fastest decay) for unknown content
  return "operational";
}

/**
 * Classify content by source type (from Tier 2).
 *
 * @param sourceType Source type string (e.g., "user", "session", "tana")
 * @returns Classified content type
 */
export function classifyBySourceType(sourceType: string): ContentType {
  const normalized = sourceType.toLowerCase();

  // Check exact match first
  if (normalized in SOURCE_TYPE_MAP) {
    return SOURCE_TYPE_MAP[normalized];
  }

  // Check prefix matches
  for (const [prefix, type] of Object.entries(SOURCE_TYPE_MAP)) {
    if (normalized.startsWith(prefix)) {
      return type;
    }
  }

  // Default to operational
  return "operational";
}

/**
 * Classify content with both path and source type hints.
 * Path takes precedence as it's more specific.
 *
 * @param filePath Optional file path
 * @param sourceType Optional source type
 * @returns Classified content type
 */
export function classifyContent(
  filePath?: string,
  sourceType?: string
): ContentType {
  // Path is most specific
  if (filePath) {
    return classifyByPath(filePath);
  }

  // Fall back to source type
  if (sourceType) {
    return classifyBySourceType(sourceType);
  }

  // Default
  return "operational";
}

// ============================================================================
// Half-Life Lookup
// ============================================================================

/**
 * Get the half-life for a file path.
 *
 * @param filePath File path
 * @returns Half-life in days
 */
export function getHalfLifeForPath(filePath: string): number {
  const contentType = classifyByPath(filePath);
  return HALF_LIFE_DAYS[contentType];
}

/**
 * Get the half-life for a source type.
 *
 * @param sourceType Source type string
 * @returns Half-life in days
 */
export function getHalfLifeForSourceType(sourceType: string): number {
  const contentType = classifyBySourceType(sourceType);
  return HALF_LIFE_DAYS[contentType];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if a string is a valid content type.
 *
 * @param value Value to check
 * @returns True if valid content type
 */
export function isValidContentType(value: string): value is ContentType {
  return ContentTypeSchema.safeParse(value).success;
}

/**
 * Parse a content type string, returning default if invalid.
 *
 * @param value Value to parse
 * @param defaultType Default if invalid
 * @returns Parsed content type
 */
export function parseContentType(
  value: string,
  defaultType: ContentType = "operational"
): ContentType {
  const result = ContentTypeSchema.safeParse(value);
  return result.success ? result.data : defaultType;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a human-readable description of a content type.
 */
export function getContentTypeDescription(type: ContentType): string {
  const descriptions: Record<ContentType, string> = {
    identity: "Core identity and preferences (180-day half-life)",
    contacts: "Contact and relationship information (90-day half-life)",
    projects: "Project context and goals (60-day half-life)",
    learnings: "Learned patterns and insights (45-day half-life)",
    sessions: "Session history and synopses (30-day half-life)",
    operational: "Task-specific operational context (14-day half-life)",
  };
  return descriptions[type];
}

/**
 * Get all content types sorted by half-life (longest first).
 */
export function getContentTypesByHalfLife(): ContentType[] {
  return (Object.keys(HALF_LIFE_DAYS) as ContentType[]).sort(
    (a, b) => HALF_LIFE_DAYS[b] - HALF_LIFE_DAYS[a]
  );
}
