/**
 * ACR Tier 1 - Entity Extractor
 *
 * Extracts searchable entities from user prompts and context.
 * Combines proper nouns, project names, and file paths.
 */

import type { SearchContext } from "./types";
import { isStopword, isValidEntityLength } from "./config";

// ============================================================================
// T-2.1: Proper Noun Extraction
// ============================================================================

/**
 * Extract proper nouns (capitalized words) from prompt.
 * Filters stopwords and enforces minimum length.
 */
export function extractProperNouns(prompt: string): string[] {
  // Match capitalized words (start with uppercase, can be all caps for acronyms)
  const capitalizedPattern = /\b[A-Z][A-Za-z]*\b/g;
  const matches = prompt.match(capitalizedPattern) || [];

  // Filter and deduplicate
  const seen = new Set<string>();
  const result: string[] = [];

  for (const word of matches) {
    // Skip if stopword (case-insensitive check)
    if (isStopword(word)) continue;

    // Skip if doesn't meet length requirements
    if (!isValidEntityLength(word)) continue;

    // Skip duplicates
    if (seen.has(word)) continue;

    seen.add(word);
    result.push(word);
  }

  return result;
}

// ============================================================================
// T-2.2: Project Name Extraction
// ============================================================================

/**
 * Extract project name from current working directory path.
 * Returns the last path component (directory name).
 */
export function extractProjectName(cwd: string): string {
  // Remove trailing slash if present
  const normalized = cwd.replace(/\/+$/, "");

  // Handle root directory
  if (normalized === "" || normalized === "/") {
    return "";
  }

  // Extract last path component
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

// ============================================================================
// T-2.3: File Path Extraction
// ============================================================================

/**
 * Extract file paths mentioned in prompt.
 * Returns basenames (filename only) for use as search entities.
 */
export function extractFilePaths(prompt: string): string[] {
  // Match patterns that look like file paths:
  // - Absolute paths: /path/to/file.ext
  // - Relative paths: path/to/file.ext, ./file.ext, ../file.ext
  // - Simple filenames with extensions: file.ext
  const pathPattern =
    /(?:(?:\.{0,2}\/)?(?:[\w.-]+\/)*[\w.-]+\.[a-zA-Z]{1,10})/g;
  const matches = prompt.match(pathPattern) || [];

  // Extract basenames and deduplicate
  const seen = new Set<string>();
  const result: string[] = [];

  for (const path of matches) {
    // Extract basename
    const parts = path.split("/");
    const basename = parts[parts.length - 1];

    // Validate it looks like a file (has extension)
    if (!basename || !basename.includes(".")) continue;

    // Skip duplicates
    if (seen.has(basename)) continue;

    seen.add(basename);
    result.push(basename);
  }

  return result;
}

// ============================================================================
// Integration: Extract All Entities
// ============================================================================

/**
 * Extract all entity types and combine into SearchContext.
 * This is the main entry point for entity extraction.
 */
export function extractEntities(
  prompt: string,
  cwd: string,
  recentFiles: string[] = []
): SearchContext {
  // Collect entities from all sources
  const properNouns = extractProperNouns(prompt);
  const projectName = extractProjectName(cwd);
  const filePaths = extractFilePaths(prompt);

  // Combine and deduplicate
  const seen = new Set<string>();
  const entities: string[] = [];

  // Add proper nouns
  for (const noun of properNouns) {
    if (!seen.has(noun)) {
      seen.add(noun);
      entities.push(noun);
    }
  }

  // Add project name if valid
  if (projectName && !seen.has(projectName)) {
    seen.add(projectName);
    entities.push(projectName);

    // Also extract hyphen-separated components (e.g., "scuol-notify" -> "scuol", "notify")
    // This improves recall for projects like "kai-improvement-roadmap" matching "kai"
    if (projectName.includes("-")) {
      for (const part of projectName.split("-")) {
        // Capitalize first letter for better matching against proper nouns in USER/
        const capitalized = part.charAt(0).toUpperCase() + part.slice(1);
        if (
          capitalized.length >= 3 &&
          !seen.has(capitalized) &&
          !isStopword(capitalized)
        ) {
          seen.add(capitalized);
          entities.push(capitalized);
        }
      }
    }
  }

  // Add file paths
  for (const path of filePaths) {
    if (!seen.has(path)) {
      seen.add(path);
      entities.push(path);
    }
  }

  return {
    entities,
    workingDir: cwd,
    recentFiles,
    rawPrompt: prompt,
  };
}
