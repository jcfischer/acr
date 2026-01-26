/**
 * ACR F-006 - Memory Parser
 *
 * Parse markdown files from PAI's MEMORY directory structure.
 * Extracts frontmatter metadata, content, and converts to embedding inputs.
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, basename } from "path";
import { parse as parseYaml } from "yaml";

import {
  type MemoryEntry,
  type MemoryEmbeddingInput,
  type MemoryCaptureType,
  generateSourceId,
  captureTypeFromPath,
} from "./memory-types";

// ============================================================================
// Frontmatter Extraction
// ============================================================================

/**
 * Extract YAML frontmatter from markdown content.
 * Returns parsed frontmatter object and remaining body.
 */
export function extractFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!content || !content.startsWith("---")) {
    return { frontmatter: {}, body: content };
  }

  // Find closing marker (must be at start of line)
  const closingMatch = content.match(/\n---\s*\n/);
  if (!closingMatch || closingMatch.index === undefined) {
    return { frontmatter: {}, body: content };
  }

  const yamlContent = content.slice(4, closingMatch.index); // Skip opening "---\n"
  const body = content.slice(closingMatch.index + closingMatch[0].length);

  try {
    const parsed = parseYaml(yamlContent);
    return {
      frontmatter: typeof parsed === "object" && parsed !== null ? parsed : {},
      body: body.trim(),
    };
  } catch {
    // Malformed YAML - return empty frontmatter
    return { frontmatter: {}, body: content };
  }
}

// ============================================================================
// Timestamp Parsing
// ============================================================================

/**
 * Parse timestamp from frontmatter value.
 * Supports:
 * - "YYYY-MM-DD HH:mm:ss" (space-separated)
 * - "YYYY-MM-DDTHH:mm:ssZ" (ISO format)
 * - "YYYY-MM-DD" (date only)
 * - Numeric string (Unix timestamp in ms)
 */
export function parseFrontmatterTimestamp(value: string): number | null {
  if (!value || value.trim() === "") {
    return null;
  }

  const trimmed = value.trim();

  // Check for numeric timestamp
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    return isNaN(num) ? null : num;
  }

  // Try parsing as date string
  // Handle "YYYY-MM-DD HH:mm:ss" format by converting to ISO
  const spaceFormatMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/
  );
  if (spaceFormatMatch) {
    const isoString = `${spaceFormatMatch[1]}T${spaceFormatMatch[2]}`;
    const date = new Date(isoString);
    return isNaN(date.getTime()) ? null : date.getTime();
  }

  // Try standard Date parsing (ISO format, date-only, etc.)
  const date = new Date(trimmed);
  return isNaN(date.getTime()) ? null : date.getTime();
}

// ============================================================================
// Title Extraction
// ============================================================================

/**
 * Extract title from markdown content or use filename as fallback.
 * Looks for first H1 heading (# Title).
 */
export function extractTitle(content: string, filename: string): string {
  // Look for first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fallback to filename (strip extension and date prefix)
  const stem = basename(filename, ".md");
  // Remove common date prefixes like "2026-01-04_" or "20260104T"
  const withoutDatePrefix = stem.replace(/^\d{4}-\d{2}-\d{2}[_-]?/, "");
  return withoutDatePrefix || stem;
}

// ============================================================================
// File Parsing
// ============================================================================

/**
 * Parse a single memory file into a MemoryEntry.
 * Returns null if file doesn't exist or content is below minimum length.
 */
export async function parseMemoryFile(
  filePath: string,
  minContentLength: number = 50
): Promise<MemoryEntry | null> {
  try {
    const content = await readFile(filePath, "utf-8");

    // Check minimum content length
    if (content.length < minContentLength) {
      return null;
    }

    const { frontmatter, body } = extractFrontmatter(content);

    // Determine capture type from frontmatter or path
    let captureType: MemoryCaptureType | null = null;
    if (
      frontmatter.capture_type &&
      typeof frontmatter.capture_type === "string"
    ) {
      const ft = frontmatter.capture_type.toUpperCase();
      if (ft === "LEARNING" || ft === "DECISION" || ft === "RESEARCH") {
        captureType = ft as MemoryCaptureType;
      }
    }
    if (!captureType) {
      captureType = captureTypeFromPath(filePath);
    }
    if (!captureType) {
      captureType = "LEARNING"; // Default fallback
    }

    // Parse timestamp from frontmatter or use file mtime
    let timestamp: number;
    if (frontmatter.timestamp) {
      const parsed = parseFrontmatterTimestamp(String(frontmatter.timestamp));
      if (parsed) {
        timestamp = parsed;
      } else {
        const stats = await stat(filePath);
        timestamp = stats.mtimeMs;
      }
    } else {
      const stats = await stat(filePath);
      timestamp = stats.mtimeMs;
    }

    // Extract title
    const title = extractTitle(body || content, basename(filePath));

    // Get session ID if present
    const sessionId =
      frontmatter.session_id && typeof frontmatter.session_id === "string"
        ? frontmatter.session_id
        : undefined;

    return {
      filePath,
      captureType,
      timestamp,
      title,
      content: body || content,
      sessionId,
    };
  } catch {
    // File doesn't exist or can't be read
    return null;
  }
}

// ============================================================================
// Directory Scanning
// ============================================================================

/**
 * Recursively scan a directory for .md files.
 * Returns array of absolute file paths.
 */
export async function scanMemoryDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        const subFiles = await scanMemoryDirectory(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }

  return files;
}

/**
 * Scan multiple memory directories.
 * Returns map of directory name to file paths.
 */
export async function scanAllMemoryDirectories(
  baseDir: string,
  directories: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  for (const dir of directories) {
    const fullPath = join(baseDir, dir);
    const files = await scanMemoryDirectory(fullPath);
    result.set(dir, files);
  }

  return result;
}

// ============================================================================
// Embedding Input Conversion
// ============================================================================

/**
 * Convert memory entries to embedding inputs.
 * Generates source IDs in format: memory:{type}:{filename}
 */
export function toEmbeddingInputs(entries: MemoryEntry[]): MemoryEmbeddingInput[] {
  return entries.map((entry) => {
    const filename = basename(entry.filePath);
    const sourceId = generateSourceId(entry.captureType, filename);

    return {
      sourceId,
      content: entry.content,
      metadata: {
        captureType: entry.captureType,
        timestamp: entry.timestamp,
        filePath: entry.filePath,
      },
    };
  });
}
