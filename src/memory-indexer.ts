/**
 * ACR F-006 - Memory Indexer
 *
 * Sync PAI's MEMORY directory structure to ACR semantic index.
 * Supports incremental and full reindex operations.
 */

import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { dirname } from "path";

import {
  type MemoryIndexState,
  type MemoryEntry,
  createEmptyIndexState,
  MemoryIndexStateSchema,
} from "./memory-types";
import {
  parseMemoryFile,
  scanAllMemoryDirectories,
  toEmbeddingInputs,
} from "./memory-parser";

import { EmbeddingService } from "./embedding-service";
import { VectorStore } from "./vector-store";
import { indexEmbeddings, type IndexableInput } from "./embedding-indexer";
import { EMBEDDING_CONFIG } from "./embedding-types";

// ============================================================================
// Types
// ============================================================================

/**
 * Progress callback type for sync operations
 */
export type SyncProgressCallback = (
  current: number,
  total: number,
  phase: string
) => void;

export interface MemorySyncConfig {
  /** Base directory for MEMORY files */
  baseDir: string;
  /** Subdirectories to scan */
  directories: string[];
  /** Path to state file */
  stateFile: string;
  /** Minimum content length to include */
  minContentLength: number;
  /** Batch size for embedding */
  batchSize: number;
  /** File extensions to include */
  fileExtensions: string[];
  /** Force full reindex */
  fullReindex?: boolean;
  /** Dry run - don't actually call Resona */
  dryRun?: boolean;
  /** Progress callback - receives (current, total, phase) */
  onProgress?: SyncProgressCallback;
}

export interface MemorySyncResult {
  /** Total files scanned */
  filesScanned: number;
  /** Files actually processed (new or modified) */
  filesProcessed: number;
  /** Entries sent to indexer */
  entriesIndexed: number;
  /** Any errors encountered */
  errors: string[];
  /** Duration in milliseconds */
  durationMs: number;
}

export interface MemorySyncResultWithEmbeddings extends MemorySyncResult {
  /** Entries successfully embedded */
  entriesEmbedded: number;
  /** Entries that failed to embed */
  embeddingErrors: number;
}

export interface ChangeDetectionResult {
  /** Files not in state (new) */
  newFiles: string[];
  /** Files with mtime > indexed mtime */
  modifiedFiles: string[];
  /** Files in state but not on disk */
  deletedFiles: string[];
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Load index state from file.
 * Returns empty state if file doesn't exist or is invalid.
 */
export async function loadIndexState(path: string): Promise<MemoryIndexState> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content);
    const validated = MemoryIndexStateSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    return createEmptyIndexState();
  } catch {
    return createEmptyIndexState();
  }
}

/**
 * Save index state to file.
 * Creates parent directories if needed.
 */
export async function saveIndexState(
  path: string,
  state: MemoryIndexState
): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2));
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Detect changes between current files and indexed state.
 */
export async function detectChanges(
  baseDir: string,
  directories: string[],
  state: MemoryIndexState
): Promise<ChangeDetectionResult> {
  const newFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const deletedFiles: string[] = [];

  // Scan all directories
  const filesByDir = await scanAllMemoryDirectories(baseDir, directories);

  // Collect all current files
  const currentFiles = new Set<string>();
  for (const files of filesByDir.values()) {
    for (const file of files) {
      currentFiles.add(file);
    }
  }

  // Check for new and modified files
  for (const filePath of currentFiles) {
    const indexed = state.indexedFiles[filePath];
    if (!indexed) {
      newFiles.push(filePath);
    } else {
      // Check if file has been modified
      try {
        const stats = await stat(filePath);
        if (stats.mtimeMs > indexed.lastModified) {
          modifiedFiles.push(filePath);
        }
      } catch {
        // File doesn't exist - will be caught in deleted check
      }
    }
  }

  // Check for deleted files
  for (const filePath of Object.keys(state.indexedFiles)) {
    if (!currentFiles.has(filePath)) {
      deletedFiles.push(filePath);
    }
  }

  return { newFiles, modifiedFiles, deletedFiles };
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Sync memory files to the semantic index.
 */
export async function syncMemoryIndex(
  config: MemorySyncConfig
): Promise<MemorySyncResultWithEmbeddings> {
  const startTime = Date.now();
  const result: MemorySyncResultWithEmbeddings = {
    filesScanned: 0,
    filesProcessed: 0,
    entriesIndexed: 0,
    entriesEmbedded: 0,
    embeddingErrors: 0,
    errors: [],
    durationMs: 0,
  };

  // Load existing state (or empty if full reindex)
  const state = config.fullReindex
    ? createEmptyIndexState()
    : await loadIndexState(config.stateFile);

  // Scan directories
  const filesByDir = await scanAllMemoryDirectories(
    config.baseDir,
    config.directories
  );

  // Collect all files
  const allFiles: string[] = [];
  for (const files of filesByDir.values()) {
    allFiles.push(...files);
  }
  result.filesScanned = allFiles.length;

  // Detect changes
  const changes = await detectChanges(
    config.baseDir,
    config.directories,
    state
  );

  // Files to process (new + modified)
  const filesToProcess = [...changes.newFiles, ...changes.modifiedFiles];

  // Parse and collect entries
  const entries: MemoryEntry[] = [];
  for (const filePath of filesToProcess) {
    const entry = await parseMemoryFile(filePath, config.minContentLength);
    if (entry) {
      entries.push(entry);
      result.filesProcessed++;
    }
  }

  // Convert to embedding inputs
  const embeddingInputs = toEmbeddingInputs(entries);
  result.entriesIndexed = embeddingInputs.length;

  // Generate embeddings (unless dry run)
  if (!config.dryRun && embeddingInputs.length > 0) {
    try {
      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(EMBEDDING_CONFIG.dbPath);
      await vectorStore.initialize();

      // Convert to unified IndexableInput format
      const indexableInputs: IndexableInput[] = embeddingInputs.map((m) => ({
        sourceId: m.sourceId,
        content: m.content,
        source: "memory" as const,
        metadata: {
          captureType: m.metadata.captureType,
          filePath: m.metadata.filePath,
        },
        timestamp: m.metadata.timestamp,
      }));

      const embeddingResult = await indexEmbeddings(
        indexableInputs,
        embeddingService,
        vectorStore,
        { onProgress: config.onProgress }
      );

      result.entriesEmbedded = embeddingResult.embedded;
      result.embeddingErrors = embeddingResult.failed;

      if (embeddingResult.errors.length > 0) {
        result.errors.push(...embeddingResult.errors.slice(0, 5));
      }
    } catch (error) {
      result.embeddingErrors = embeddingInputs.length;
      result.errors.push(
        `Embedding failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Update state
  const newState: MemoryIndexState = {
    lastSyncTimestamp: Date.now(),
    indexedFiles: { ...state.indexedFiles },
  };

  // Add/update processed files - use actual file mtime for change detection
  for (const entry of entries) {
    let lastModified = entry.timestamp;
    try {
      const stats = await stat(entry.filePath);
      lastModified = stats.mtimeMs;
    } catch {
      // Use entry timestamp if stat fails
    }
    newState.indexedFiles[entry.filePath] = {
      lastModified,
      captureType: entry.captureType,
    };
  }

  // Remove deleted files from state
  for (const deleted of changes.deletedFiles) {
    delete newState.indexedFiles[deleted];
  }

  // Always save state (even in dry run - we track what's been scanned)
  await saveIndexState(config.stateFile, newState);

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Clear the memory index.
 *
 * @param stateFile - Path to state file
 * @param clearEmbeddings - Also clear embeddings from vector store
 */
export async function clearMemoryIndex(
  stateFile: string,
  clearEmbeddings = false
): Promise<void> {
  await saveIndexState(stateFile, createEmptyIndexState());

  if (clearEmbeddings) {
    try {
      const vectorStore = new VectorStore(EMBEDDING_CONFIG.dbPath);
      await vectorStore.initialize();
      await vectorStore.deleteBySource("memory");
    } catch {
      // Ignore errors - vector store may not exist
    }
  }
}
