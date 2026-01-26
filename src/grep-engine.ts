/**
 * ACR Tier 1 - Grep Engine
 *
 * File reading, binary detection, parallel grep, and context extraction.
 */

import { readFile, stat } from "fs/promises";
import type { EntityMatch } from "./types";
import { ACR_CONFIG } from "./config";

// ============================================================================
// T-3.1: File Reader with Timeout
// ============================================================================

/**
 * Read file content with timeout protection.
 * Returns null if file doesn't exist or read fails.
 */
export async function readFileWithTimeout(
  filePath: string,
  timeoutMs: number = ACR_CONFIG.grepTimeoutMs
): Promise<string | null> {
  try {
    // Check file size first
    const stats = await stat(filePath);
    if (stats.size > ACR_CONFIG.maxFileSizeBytes) {
      return null; // Skip large files
    }

    // Create timeout promise
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });

    // Race read against timeout
    const readPromise = readFile(filePath, "utf-8");
    const result = await Promise.race([readPromise, timeoutPromise]);

    return result;
  } catch {
    // File doesn't exist or read error
    return null;
  }
}

// ============================================================================
// Binary File Detection
// ============================================================================

// Common binary file signatures (magic bytes)
const BINARY_SIGNATURES = [
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46], // GIF
  [0x50, 0x4b, 0x03, 0x04], // ZIP/DOCX/XLSX
  [0x25, 0x50, 0x44, 0x46], // PDF
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O
  [0x00, 0x00, 0x00], // Various binary formats
];

/**
 * Check if file appears to be binary by examining magic bytes.
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    if (stats.size === 0) return false; // Empty files are text

    // Read first few bytes
    const buffer = await Bun.file(filePath).slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.length === 0) return false;

    // Check against known binary signatures
    for (const sig of BINARY_SIGNATURES) {
      if (sig.every((byte, i) => bytes[i] === byte)) {
        return true;
      }
    }

    // Check for null bytes (common in binary files)
    for (let i = 0; i < Math.min(bytes.length, 512); i++) {
      if (bytes[i] === 0) return true;
    }

    return false;
  } catch {
    return false; // Assume text on error
  }
}

// ============================================================================
// T-3.2: Parallel File Grep
// ============================================================================

/**
 * Grep a single file for entities.
 * Returns matches with line numbers and context.
 */
export async function grepFile(
  filePath: string,
  entities: string[]
): Promise<EntityMatch[]> {
  // Skip binary files
  if (await isBinaryFile(filePath)) {
    return [];
  }

  // Read file content
  const content = await readFileWithTimeout(filePath);
  if (content === null) {
    return [];
  }

  const matches: EntityMatch[] = [];
  const lines = content.split("\n");

  for (const entity of entities) {
    // Create case-insensitive pattern for searching
    const pattern = new RegExp(escapeRegex(entity), "gi");

    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        const lineNum = i + 1; // 1-indexed
        const snippet = extractContextWindow(
          content,
          lineNum,
          ACR_CONFIG.contextLines
        );

        matches.push({
          entity,
          source: filePath,
          snippet,
          line: lineNum,
          confidence: 0, // Will be scored later by match-scorer
        });

        // Reset regex lastIndex for next iteration
        pattern.lastIndex = 0;
      }
    }
  }

  return matches;
}

/**
 * Grep multiple files in parallel.
 */
export async function grepFiles(
  filePaths: string[],
  entities: string[]
): Promise<EntityMatch[]> {
  if (filePaths.length === 0 || entities.length === 0) {
    return [];
  }

  // Grep all files in parallel
  const results = await Promise.all(
    filePaths.map((path) => grepFile(path, entities))
  );

  // Flatten results
  return results.flat();
}

// ============================================================================
// T-3.3: Context Window Extraction
// ============================================================================

/**
 * Extract lines around a match for context.
 * @param content Full file content
 * @param lineNum 1-indexed line number of match
 * @param contextLines Number of lines before and after to include
 */
export function extractContextWindow(
  content: string,
  lineNum: number,
  contextLines: number
): string {
  const lines = content.split("\n");
  const idx = lineNum - 1; // Convert to 0-indexed

  // Calculate window bounds
  const start = Math.max(0, idx - contextLines);
  const end = Math.min(lines.length, idx + contextLines + 1);

  // Extract and join lines
  return lines.slice(start, end).join("\n");
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
