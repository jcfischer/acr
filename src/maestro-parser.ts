/**
 * ACR F-005 - Maestro History Parser
 *
 * Parse Maestro session history files for indexing.
 * Handles malformed files gracefully with empty results.
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, basename } from "path";

import {
  MaestroHistoryFileSchema,
  MaestroEntrySchema,
  MAESTRO_CONFIG,
  createEmbeddingInput,
  type MaestroEntry,
  type MaestroEmbeddingInput,
} from "./maestro-types";

// ============================================================================
// File Parsing
// ============================================================================

/**
 * Parse a single Maestro history file.
 *
 * @param filePath - Path to the JSON history file
 * @returns Array of valid MaestroEntry objects, empty on error
 */
export async function parseMaestroHistoryFile(
  filePath: string
): Promise<MaestroEntry[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    const json = JSON.parse(content);

    // Validate the file structure
    const parsed = MaestroHistoryFileSchema.safeParse(json);
    if (!parsed.success) {
      // Try to salvage individual entries if file structure is invalid
      if (Array.isArray(json?.entries)) {
        return validateEntries(json.entries);
      }
      return [];
    }

    return parsed.data.entries;
  } catch (error) {
    // File doesn't exist, is unreadable, or contains invalid JSON
    return [];
  }
}

/**
 * Validate individual entries, filtering out invalid ones.
 *
 * @param entries - Array of potential entries
 * @returns Array of valid MaestroEntry objects
 */
function validateEntries(entries: unknown[]): MaestroEntry[] {
  const valid: MaestroEntry[] = [];

  for (const entry of entries) {
    const result = MaestroEntrySchema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    }
  }

  return valid;
}

/**
 * Check if a file is a valid Maestro history file.
 *
 * @param filePath - Path to check
 * @returns true if file is valid Maestro history
 */
export async function isValidMaestroFile(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf-8");
    const json = JSON.parse(content);
    const result = MaestroHistoryFileSchema.safeParse(json);
    return result.success;
  } catch {
    return false;
  }
}

// ============================================================================
// Directory Parsing
// ============================================================================

/**
 * Parse all history files in a directory.
 *
 * @param dirPath - Path to the history directory
 * @returns Map of filename to entries
 */
export async function parseHistoryDirectory(
  dirPath: string
): Promise<Map<string, MaestroEntry[]>> {
  const result = new Map<string, MaestroEntry[]>();

  try {
    const files = await readdir(dirPath);

    for (const file of files) {
      // Only process JSON files
      if (!file.endsWith(".json")) {
        continue;
      }

      const filePath = join(dirPath, file);

      // Skip directories
      try {
        const stats = await stat(filePath);
        if (stats.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      const entries = await parseMaestroHistoryFile(filePath);

      // Only add files that have valid entries
      if (entries.length > 0) {
        result.set(file, entries);
      }
    }
  } catch {
    // Directory doesn't exist or is unreadable
  }

  return result;
}

// ============================================================================
// Entry Filtering
// ============================================================================

/**
 * Filter entries to only include those suitable for indexing.
 *
 * Criteria:
 * - Summary length > minSummaryLength (default 10)
 *
 * @param entries - Array of MaestroEntry objects
 * @param minLength - Minimum summary length (default from config)
 * @returns Filtered array of indexable entries
 */
export function filterIndexableEntries(
  entries: MaestroEntry[],
  minLength: number = MAESTRO_CONFIG.minSummaryLength
): MaestroEntry[] {
  return entries.filter((entry) => entry.summary.length > minLength);
}

// ============================================================================
// Conversion to Embedding Inputs
// ============================================================================

/**
 * Convert entries to embedding inputs ready for Resona.
 *
 * @param entries - Array of MaestroEntry objects
 * @param sessionFile - The session filename (for sourceId)
 * @param workingDirectory - Optional working directory context
 * @returns Array of MaestroEmbeddingInput objects
 */
export function toEmbeddingInputs(
  entries: MaestroEntry[],
  sessionFile: string,
  workingDirectory?: string
): MaestroEmbeddingInput[] {
  return entries.map((entry, index) =>
    createEmbeddingInput(entry, sessionFile, index, workingDirectory)
  );
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Parse, filter, and convert a history file in one step.
 *
 * @param filePath - Path to history file
 * @param workingDirectory - Optional working directory context
 * @returns Array of MaestroEmbeddingInput ready for indexing
 */
export async function parseAndConvert(
  filePath: string,
  workingDirectory?: string
): Promise<MaestroEmbeddingInput[]> {
  const entries = await parseMaestroHistoryFile(filePath);
  const filtered = filterIndexableEntries(entries);
  return toEmbeddingInputs(filtered, basename(filePath), workingDirectory);
}

/**
 * Get file modification time.
 *
 * @param filePath - Path to file
 * @returns Modification time in ms, or 0 if file doesn't exist
 */
export async function getFileMtime(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
}
