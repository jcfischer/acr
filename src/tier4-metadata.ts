/**
 * ACR Tier 4 - Metadata Parsing
 *
 * Extracts timestamps and TTL metadata from content and files.
 * Supports YAML frontmatter, file stats, and inline metadata.
 */

import { stat } from "fs/promises";
import type { ContentMetadata, ContentType } from "./tier4-types";
import { classifyByPath } from "./tier4-content-type";

// ============================================================================
// Frontmatter Parsing
// ============================================================================

/**
 * Pattern to match YAML frontmatter at start of file.
 * Matches: ---\n...\n---
 */
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

/**
 * Pattern to match key: value pairs in frontmatter.
 */
const FRONTMATTER_FIELD_REGEX = /^(\w+):\s*(.+)$/gm;

/**
 * Extract frontmatter from content string.
 *
 * @param content File content
 * @returns Parsed frontmatter fields or null if none found
 */
export function extractFrontmatter(
  content: string
): Record<string, string> | null {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return null;
  }

  const frontmatterContent = match[1];
  const fields: Record<string, string> = {};

  let fieldMatch;
  while ((fieldMatch = FRONTMATTER_FIELD_REGEX.exec(frontmatterContent))) {
    const [, key, value] = fieldMatch;
    fields[key.toLowerCase()] = value.trim();
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Parse a date string from frontmatter.
 *
 * Supports:
 * - ISO 8601: 2024-01-15, 2024-01-15T10:30:00Z
 * - Unix timestamp (ms): 1705312200000
 *
 * @param value Date string
 * @returns Parsed Date or null
 */
export function parseFrontmatterDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  // Try ISO 8601
  const isoDate = new Date(value);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try Unix timestamp
  const timestamp = parseInt(value, 10);
  if (!isNaN(timestamp)) {
    // Assume milliseconds if > 10 billion (after year 2001 in seconds)
    const ms = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
    return new Date(ms);
  }

  return null;
}

/**
 * Parse TTL value from frontmatter.
 *
 * Supports:
 * - Numbers: 0, 30, 90
 * - Strings: "permanent", "default", "30d", "90 days"
 *
 * @param value TTL string
 * @returns Parsed TTL number (0=permanent, -1=default, N=days) or undefined
 */
export function parseTTL(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  // Already a number
  if (typeof value === "number") {
    return value;
  }

  const normalized = value.toLowerCase().trim();

  // Special values
  if (normalized === "permanent" || normalized === "never") {
    return 0;
  }
  if (normalized === "default" || normalized === "auto") {
    return -1;
  }

  // Parse "30d" or "30 days" format
  const daysMatch = normalized.match(/^(\d+)\s*(?:d|days?)?$/);
  if (daysMatch) {
    return parseInt(daysMatch[1], 10);
  }

  return undefined;
}

// ============================================================================
// File Stats
// ============================================================================

/**
 * Get file timestamps from filesystem.
 *
 * @param filePath Path to file
 * @returns { created, updated } dates or null if file doesn't exist
 */
export async function getFileTimestamps(
  filePath: string
): Promise<{ created: Date; updated: Date } | null> {
  try {
    const stats = await stat(filePath);
    return {
      created: stats.birthtime,
      updated: stats.mtime,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Full Metadata Extraction
// ============================================================================

/**
 * Extract full content metadata from file content and path.
 *
 * Priority for dates:
 * 1. Frontmatter created/updated fields
 * 2. File system timestamps
 * 3. Current date as fallback
 *
 * @param content File content (for frontmatter parsing)
 * @param filePath File path (for type classification and stats)
 * @param fileStats Optional pre-fetched file stats
 * @returns ContentMetadata
 */
export async function extractMetadata(
  content: string,
  filePath: string,
  fileStats?: { created: Date; updated: Date }
): Promise<ContentMetadata> {
  // Parse frontmatter
  const frontmatter = extractFrontmatter(content);

  // Get file timestamps if not provided
  const stats = fileStats ?? (await getFileTimestamps(filePath));

  // Determine created date
  let created: Date = new Date();
  if (frontmatter?.created) {
    const parsed = parseFrontmatterDate(frontmatter.created);
    if (parsed) created = parsed;
  } else if (stats?.created) {
    created = stats.created;
  }

  // Determine updated date
  let updated: Date = new Date();
  if (frontmatter?.updated) {
    const parsed = parseFrontmatterDate(frontmatter.updated);
    if (parsed) updated = parsed;
  } else if (stats?.updated) {
    updated = stats.updated;
  }

  // Parse TTL
  const ttl = frontmatter?.ttl ? parseTTL(frontmatter.ttl) : undefined;

  // Parse preserve reason
  const preserveReason = frontmatter?.preservereason ?? frontmatter?.preserve_reason;

  // Classify content type
  const contentType = classifyByPath(filePath);

  return {
    created,
    updated,
    ttl,
    contentType,
    preserveReason,
  };
}

/**
 * Extract metadata synchronously (without file stats).
 * Use when you already have content and don't need filesystem access.
 *
 * @param content File content
 * @param filePath File path (for classification)
 * @param referenceDate Date to use for created/updated if not in frontmatter
 * @returns ContentMetadata
 */
export function extractMetadataSync(
  content: string,
  filePath: string,
  referenceDate: Date = new Date()
): ContentMetadata {
  const frontmatter = extractFrontmatter(content);

  // Determine created date
  let created = referenceDate;
  if (frontmatter?.created) {
    const parsed = parseFrontmatterDate(frontmatter.created);
    if (parsed) created = parsed;
  }

  // Determine updated date
  let updated = referenceDate;
  if (frontmatter?.updated) {
    const parsed = parseFrontmatterDate(frontmatter.updated);
    if (parsed) updated = parsed;
  }

  // Parse TTL
  const ttl = frontmatter?.ttl ? parseTTL(frontmatter.ttl) : undefined;

  // Parse preserve reason
  const preserveReason = frontmatter?.preservereason ?? frontmatter?.preserve_reason;

  // Classify content type
  const contentType = classifyByPath(filePath);

  return {
    created,
    updated,
    ttl,
    contentType,
    preserveReason,
  };
}

// ============================================================================
// Metadata Validation
// ============================================================================

/**
 * Create a minimal ContentMetadata with defaults.
 *
 * @param contentType Content type
 * @param referenceDate Reference date for timestamps
 * @returns ContentMetadata with sensible defaults
 */
export function createDefaultMetadata(
  contentType: ContentType,
  referenceDate: Date = new Date()
): ContentMetadata {
  return {
    created: referenceDate,
    updated: referenceDate,
    contentType,
  };
}

/**
 * Check if content should be treated as permanent.
 *
 * @param metadata Content metadata
 * @returns True if TTL=0 (permanent)
 */
export function isPermanent(metadata: ContentMetadata): boolean {
  return metadata.ttl === 0;
}

/**
 * Check if content uses default decay policy.
 *
 * @param metadata Content metadata
 * @returns True if no TTL override (uses default half-life)
 */
export function usesDefaultDecay(metadata: ContentMetadata): boolean {
  return metadata.ttl === undefined || metadata.ttl === -1;
}

/**
 * Check if content has explicit expiration.
 *
 * @param metadata Content metadata
 * @returns True if TTL > 0 (explicit expiration in N days)
 */
export function hasExplicitExpiration(metadata: ContentMetadata): boolean {
  return metadata.ttl !== undefined && metadata.ttl > 0;
}

/**
 * Calculate expiration date for content with explicit TTL.
 *
 * @param metadata Content metadata
 * @returns Expiration date or null if no explicit TTL
 */
export function getExpirationDate(metadata: ContentMetadata): Date | null {
  if (!hasExplicitExpiration(metadata) || metadata.ttl === undefined) {
    return null;
  }

  const expirationMs =
    metadata.created.getTime() + metadata.ttl * 24 * 60 * 60 * 1000;
  return new Date(expirationMs);
}

/**
 * Check if content has expired based on explicit TTL.
 *
 * @param metadata Content metadata
 * @param referenceDate Reference date (default: now)
 * @returns True if content has expired
 */
export function isExpired(
  metadata: ContentMetadata,
  referenceDate: Date = new Date()
): boolean {
  const expiration = getExpirationDate(metadata);
  if (!expiration) {
    return false; // No explicit expiration
  }
  return referenceDate > expiration;
}
