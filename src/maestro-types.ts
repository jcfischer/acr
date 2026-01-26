/**
 * ACR F-005 - Maestro Session Indexing Types
 *
 * Type definitions and Zod schemas for Maestro session history indexing.
 */

import { z } from "zod";
import { homedir } from "os";
import { join } from "path";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default configuration for Maestro indexing
 */
export const MAESTRO_CONFIG = {
  /** Directory containing Maestro history files */
  historyDir: join(
    homedir(),
    "Library/Application Support/maestro/history"
  ),
  /** State file for tracking indexed files */
  stateFile: join(homedir(), ".config/acr/maestro-index-state.json"),
  /** Minimum summary length to index */
  minSummaryLength: 10,
  /** Maximum entries per embedding batch */
  batchSize: 100,
  /** Minimum similarity for search results */
  minSimilarity: 0.70,
  /** Maximum sessions to return per query */
  maxResults: 5,
} as const;

// ============================================================================
// Entry Type (from Maestro history files)
// ============================================================================

/**
 * Entry type enum - AUTO (automated tasks) or USER (interactive tasks)
 */
export const MaestroEntryTypeSchema = z.enum(["AUTO", "USER"]);
export type MaestroEntryType = z.infer<typeof MaestroEntryTypeSchema>;

/**
 * Single entry from a Maestro session history file
 */
export const MaestroEntrySchema = z.object({
  /** Task description/summary */
  summary: z.string(),
  /** Unix timestamp in milliseconds */
  timestamp: z.number(),
  /** Entry type: AUTO or USER */
  type: MaestroEntryTypeSchema,
  /** Whether the task succeeded */
  success: z.boolean(),
});

export type MaestroEntry = z.infer<typeof MaestroEntrySchema>;

// ============================================================================
// History File Schema
// ============================================================================

/**
 * Complete Maestro history file structure
 */
export const MaestroHistoryFileSchema = z.object({
  entries: z.array(MaestroEntrySchema),
});

export type MaestroHistoryFile = z.infer<typeof MaestroHistoryFileSchema>;

// ============================================================================
// Embedding Input (internal representation)
// ============================================================================

/**
 * Input for embedding a Maestro entry into Resona
 */
export const MaestroEmbeddingInputSchema = z.object({
  /** The summary text to embed */
  content: z.string(),
  /** Source type - always 'maestro' */
  source: z.literal("maestro"),
  /** Unique identifier: maestro:{fileId}:{entryIndex} */
  sourceId: z.string(),
  /** Original session filename */
  sessionFile: z.string(),
  /** Timestamp as Date object */
  timestamp: z.date(),
  /** Entry type: AUTO or USER */
  entryType: MaestroEntryTypeSchema,
  /** Whether the task succeeded */
  success: z.boolean(),
  /** Working directory from session (optional) */
  workingDirectory: z.string().optional(),
});

export type MaestroEmbeddingInput = z.infer<typeof MaestroEmbeddingInputSchema>;

// ============================================================================
// Index State (for incremental sync)
// ============================================================================

/**
 * State of an indexed file
 */
export const IndexedFileStateSchema = z.object({
  /** Last modified timestamp of the file */
  lastModified: z.number().nonnegative(),
  /** Number of entries indexed from this file */
  entryCount: z.number().nonnegative(),
});

export type IndexedFileState = z.infer<typeof IndexedFileStateSchema>;

/**
 * Overall index state for tracking what's been indexed
 */
export const MaestroIndexStateSchema = z.object({
  /** Timestamp of last sync operation */
  lastSyncTimestamp: z.number().nonnegative(),
  /** Map of filename to indexed state */
  indexedFiles: z.record(z.string(), IndexedFileStateSchema),
});

export type MaestroIndexState = z.infer<typeof MaestroIndexStateSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty index state for first-time initialization
 */
export function createEmptyIndexState(): MaestroIndexState {
  return {
    lastSyncTimestamp: 0,
    indexedFiles: {},
  };
}

/**
 * Generate a unique sourceId for a Maestro entry
 *
 * @param sessionFile - The session history filename
 * @param entryIndex - Index of the entry within the file
 * @returns sourceId in format "maestro:{fileId}:{entryIndex}"
 */
export function generateSourceId(sessionFile: string, entryIndex: number): string {
  // Remove .json extension for fileId
  const fileId = sessionFile.replace(/\.json$/, "");
  return `maestro:${fileId}:${entryIndex}`;
}

/**
 * Create a MaestroEmbeddingInput from a raw entry
 *
 * @param entry - The MaestroEntry from history file
 * @param sessionFile - The session history filename
 * @param entryIndex - Index of the entry within the file
 * @param workingDirectory - Optional working directory
 * @returns MaestroEmbeddingInput ready for embedding
 */
export function createEmbeddingInput(
  entry: MaestroEntry,
  sessionFile: string,
  entryIndex: number,
  workingDirectory?: string
): MaestroEmbeddingInput {
  return {
    content: entry.summary,
    source: "maestro",
    sourceId: generateSourceId(sessionFile, entryIndex),
    sessionFile,
    timestamp: new Date(entry.timestamp),
    entryType: entry.type,
    success: entry.success,
    workingDirectory,
  };
}

// ============================================================================
// Sync Result Types
// ============================================================================

/**
 * Result of an indexing operation
 */
export const IndexResultSchema = z.object({
  /** Number of entries successfully indexed */
  indexed: z.number().nonnegative(),
  /** Number of entries skipped (already indexed or filtered) */
  skipped: z.number().nonnegative(),
  /** Number of errors encountered */
  errors: z.number().nonnegative(),
  /** Error messages if any */
  errorMessages: z.array(z.string()),
});

export type IndexResult = z.infer<typeof IndexResultSchema>;

/**
 * Result of a sync operation
 */
export const SyncResultSchema = z.object({
  /** Number of files processed */
  filesProcessed: z.number().nonnegative(),
  /** Number of new files indexed */
  filesIndexed: z.number().nonnegative(),
  /** Number of entries indexed */
  entriesIndexed: z.number().nonnegative(),
  /** Total time in milliseconds */
  durationMs: z.number().nonnegative(),
  /** Whether this was a full reindex */
  fullReindex: z.boolean(),
});

export type SyncResult = z.infer<typeof SyncResultSchema>;

/**
 * Status of the Maestro index
 */
export const IndexStatusSchema = z.object({
  /** Whether the index has ever been synced */
  initialized: z.boolean(),
  /** Timestamp of last sync */
  lastSyncTimestamp: z.number().nonnegative(),
  /** Number of files indexed */
  fileCount: z.number().nonnegative(),
  /** Total number of entries indexed */
  entryCount: z.number().nonnegative(),
});

export type IndexStatus = z.infer<typeof IndexStatusSchema>;

/**
 * Options for sync operation
 */
export const SyncOptionsSchema = z.object({
  /** Force full reindex instead of incremental */
  fullReindex: z.boolean().optional(),
  /** Custom history directory */
  historyDir: z.string().optional(),
  /** Verbose logging */
  verbose: z.boolean().optional(),
  /** Skip actual embedding (for testing/dry run) */
  dryRun: z.boolean().optional(),
});

export type SyncOptions = z.infer<typeof SyncOptionsSchema>;

/**
 * Progress callback type for sync operations
 */
export type SyncProgressCallback = (
  current: number,
  total: number,
  phase: string
) => void;

/**
 * Extended options including progress callback
 */
export interface SyncOptionsWithProgress extends SyncOptions {
  /** Progress callback - receives (current, total, phase) */
  onProgress?: SyncProgressCallback;
}

/**
 * Extended result including embedding stats
 */
export interface SyncResultWithEmbeddings extends SyncResult {
  /** Number of entries embedded (0 if dryRun) */
  entriesEmbedded: number;
  /** Number of embedding failures */
  embeddingErrors: number;
  /** Error messages if any */
  errors?: string[];
}
