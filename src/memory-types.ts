/**
 * ACR F-006 - PAI Memory Indexing Types
 *
 * Type definitions and Zod schemas for indexing PAI's
 * ~/.claude/MEMORY directory structure.
 */

import { z } from "zod";
import { join } from "path";
import { homedir } from "os";

// ============================================================================
// Capture Type
// ============================================================================

/**
 * Types of content captured in MEMORY directory
 */
export const MemoryCaptureTypeSchema = z.enum(["LEARNING", "DECISION", "RESEARCH"]);
export type MemoryCaptureType = z.infer<typeof MemoryCaptureTypeSchema>;

// ============================================================================
// Memory Entry
// ============================================================================

/**
 * A parsed memory file entry
 */
export const MemoryEntrySchema = z.object({
  /** Absolute path to the file */
  filePath: z.string(),
  /** Type of capture (LEARNING, DECISION, RESEARCH) */
  captureType: MemoryCaptureTypeSchema,
  /** Unix timestamp in milliseconds */
  timestamp: z.number(),
  /** Session ID from frontmatter (optional) */
  sessionId: z.string().optional(),
  /** Title extracted from first heading or filename */
  title: z.string(),
  /** Full markdown content */
  content: z.string(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

// ============================================================================
// Embedding Input
// ============================================================================

/**
 * Metadata for embedding input
 */
export const MemoryEmbeddingMetadataSchema = z.object({
  captureType: MemoryCaptureTypeSchema,
  timestamp: z.number(),
  filePath: z.string(),
});

/**
 * Input format for embedding service
 */
export const MemoryEmbeddingInputSchema = z.object({
  /** Source ID in format memory:{type}:{filename} */
  sourceId: z.string(),
  /** Content to embed */
  content: z.string(),
  /** Metadata for the entry */
  metadata: MemoryEmbeddingMetadataSchema,
});
export type MemoryEmbeddingInput = z.infer<typeof MemoryEmbeddingInputSchema>;

// ============================================================================
// Index State
// ============================================================================

/**
 * State for a single indexed file
 */
export const MemoryFileStateSchema = z.object({
  /** Last modified timestamp of the file */
  lastModified: z.number(),
  /** Capture type of the file */
  captureType: z.string(),
});
export type MemoryFileState = z.infer<typeof MemoryFileStateSchema>;

/**
 * Persistent state for the memory index
 */
export const MemoryIndexStateSchema = z.object({
  /** Timestamp of last sync operation */
  lastSyncTimestamp: z.number(),
  /** Map of filename to file state */
  indexedFiles: z.record(z.string(), MemoryFileStateSchema),
});
export type MemoryIndexState = z.infer<typeof MemoryIndexStateSchema>;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default configuration for memory indexing
 */
export const MEMORY_CONFIG = {
  /** Base directory for MEMORY */
  baseDir: join(homedir(), ".claude/MEMORY"),
  /** Subdirectories to index */
  directories: ["Learning", "Decisions", "Research", "Work"],
  /** Path to persistent state file */
  stateFile: join(homedir(), ".config/acr/memory-index-state.json"),
  /** Minimum content length to index */
  minContentLength: 50,
  /** Batch size for embedding operations */
  batchSize: 50,
  /** File extensions to process */
  fileExtensions: [".md"],
};

// ============================================================================
// Source ID Functions
// ============================================================================

/**
 * Generate a source ID for a memory entry
 *
 * @param captureType - Type of capture (LEARNING, DECISION, RESEARCH)
 * @param filename - Filename (with or without .md extension)
 * @returns Source ID in format memory:{type}:{filename_stem}
 */
export function generateSourceId(
  captureType: MemoryCaptureType,
  filename: string
): string {
  // Remove .md extension if present
  const stem = filename.replace(/\.md$/, "");
  return `memory:${captureType}:${stem}`;
}

/**
 * Parse a source ID into its components
 *
 * @param sourceId - Source ID to parse
 * @returns Object with captureType and filename, or null if invalid
 */
export function parseSourceId(
  sourceId: string
): { captureType: MemoryCaptureType; filename: string } | null {
  if (!sourceId.startsWith("memory:")) {
    return null;
  }

  const parts = sourceId.split(":");
  if (parts.length < 3) {
    return null;
  }

  const captureType = parts[1];
  // Handle filenames with colons by joining remaining parts
  const filename = parts.slice(2).join(":");

  // Validate capture type
  const typeResult = MemoryCaptureTypeSchema.safeParse(captureType);
  if (!typeResult.success) {
    return null;
  }

  return { captureType: typeResult.data, filename };
}

/**
 * Create an empty index state
 *
 * @returns Empty MemoryIndexState
 */
export function createEmptyIndexState(): MemoryIndexState {
  return {
    lastSyncTimestamp: 0,
    indexedFiles: {},
  };
}

/**
 * Infer capture type from file path
 *
 * @param filePath - Path to the file
 * @returns Capture type or null if not determinable
 */
export function captureTypeFromPath(filePath: string): MemoryCaptureType | null {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.includes("/learning/") || lowerPath.includes("/learning")) {
    return "LEARNING";
  }
  if (lowerPath.includes("/decisions/") || lowerPath.includes("/decisions")) {
    return "DECISION";
  }
  if (lowerPath.includes("/research/") || lowerPath.includes("/research")) {
    return "RESEARCH";
  }

  return null;
}
