/**
 * ACR F-005 - Maestro Session Indexer
 *
 * Indexes Maestro session history for ACR Tier 2 semantic search.
 * Supports incremental sync to avoid re-indexing unchanged files.
 */

import { readFile, writeFile, readdir, stat, mkdir } from "fs/promises";
import { join, dirname } from "path";

import {
  MaestroIndexStateSchema,
  createEmptyIndexState,
  MAESTRO_CONFIG,
  type MaestroIndexState,
  type IndexStatus,
  type SyncResult,
  type SyncOptions,
  type MaestroEmbeddingInput,
} from "./maestro-types";

import {
  parseMaestroHistoryFile,
  filterIndexableEntries,
  toEmbeddingInputs,
} from "./maestro-parser";

// ============================================================================
// State Management
// ============================================================================

/**
 * Load index state from file.
 *
 * @param stateFile - Path to state file
 * @returns MaestroIndexState, or empty state if file doesn't exist/is invalid
 */
export async function loadIndexState(
  stateFile: string
): Promise<MaestroIndexState> {
  try {
    const content = await readFile(stateFile, "utf-8");
    const json = JSON.parse(content);
    const result = MaestroIndexStateSchema.safeParse(json);

    if (result.success) {
      return result.data;
    }
  } catch {
    // File doesn't exist or is invalid
  }

  return createEmptyIndexState();
}

/**
 * Save index state to file.
 *
 * @param stateFile - Path to state file
 * @param state - State to save
 */
export async function saveIndexState(
  stateFile: string,
  state: MaestroIndexState
): Promise<void> {
  // Ensure parent directory exists
  const dir = dirname(stateFile);
  await mkdir(dir, { recursive: true });

  await writeFile(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Get current index status.
 *
 * @param stateFile - Path to state file
 * @returns IndexStatus with summary information
 */
export async function getMaestroIndexStatus(
  stateFile: string
): Promise<IndexStatus> {
  const state = await loadIndexState(stateFile);

  const fileCount = Object.keys(state.indexedFiles).length;
  const entryCount = Object.values(state.indexedFiles).reduce(
    (sum, file) => sum + file.entryCount,
    0
  );

  return {
    initialized: state.lastSyncTimestamp > 0,
    lastSyncTimestamp: state.lastSyncTimestamp,
    fileCount,
    entryCount,
  };
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Check if a file should be reindexed.
 *
 * @param filename - Name of the file
 * @param mtime - Current modification time
 * @param state - Current index state
 * @returns true if file needs reindexing
 */
export function shouldReindexFile(
  filename: string,
  mtime: number,
  state: MaestroIndexState
): boolean {
  const indexed = state.indexedFiles[filename];

  // New file
  if (!indexed) {
    return true;
  }

  // Modified since last index
  return mtime > indexed.lastModified;
}

/**
 * Information about a changed file.
 */
export interface ChangedFile {
  filename: string;
  filePath: string;
  mtime: number;
  isNew: boolean;
}

/**
 * Get list of changed files that need indexing.
 *
 * @param historyDir - Directory containing history files
 * @param state - Current index state
 * @returns Array of changed files
 */
export async function getChangedFiles(
  historyDir: string,
  state: MaestroIndexState
): Promise<ChangedFile[]> {
  const changed: ChangedFile[] = [];

  try {
    const files = await readdir(historyDir);

    for (const filename of files) {
      // Only process JSON files
      if (!filename.endsWith(".json")) {
        continue;
      }

      const filePath = join(historyDir, filename);

      try {
        const stats = await stat(filePath);
        if (stats.isDirectory()) {
          continue;
        }

        const mtime = stats.mtimeMs;

        if (shouldReindexFile(filename, mtime, state)) {
          changed.push({
            filename,
            filePath,
            mtime,
            isNew: !state.indexedFiles[filename],
          });
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Directory doesn't exist or is unreadable
  }

  return changed;
}

// ============================================================================
// Indexing Pipeline
// ============================================================================

/**
 * Index entries from a single file.
 *
 * Note: In the full implementation, this would call Resona to embed the entries.
 * For now, it just returns the entries that would be indexed.
 *
 * @param entries - Entries to index
 * @param onBatch - Optional callback for each batch
 * @returns Number of entries indexed
 */
async function indexEntries(
  entries: MaestroEmbeddingInput[],
  onBatch?: (batch: MaestroEmbeddingInput[]) => Promise<void>
): Promise<number> {
  if (entries.length === 0) {
    return 0;
  }

  // Process in batches
  const batchSize = MAESTRO_CONFIG.batchSize;
  let indexed = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    if (onBatch) {
      await onBatch(batch);
    }

    // In the full implementation, this would call Resona to embed
    // For now, we just count them
    indexed += batch.length;
  }

  return indexed;
}

/**
 * Sync Maestro index with history files.
 *
 * @param historyDir - Directory containing history files
 * @param stateFile - Path to state file
 * @param options - Sync options
 * @returns SyncResult with statistics
 */
export async function syncMaestroIndex(
  historyDir: string,
  stateFile: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const startTime = Date.now();

  // Load current state
  let state = options.fullReindex
    ? createEmptyIndexState()
    : await loadIndexState(stateFile);

  // Find changed files
  const changedFiles = await getChangedFiles(historyDir, state);

  let filesProcessed = 0;
  let filesIndexed = 0;
  let entriesIndexed = 0;

  // Process each changed file
  for (const changed of changedFiles) {
    filesProcessed++;

    try {
      // Parse and filter entries
      const entries = await parseMaestroHistoryFile(changed.filePath);
      const filtered = filterIndexableEntries(entries);

      if (filtered.length === 0) {
        // Update state even for empty files to avoid reprocessing
        state.indexedFiles[changed.filename] = {
          lastModified: changed.mtime,
          entryCount: 0,
        };
        continue;
      }

      // Convert to embedding inputs
      const inputs = toEmbeddingInputs(filtered, changed.filename);

      // Index the entries
      const indexed = await indexEntries(inputs);

      // Update state
      state.indexedFiles[changed.filename] = {
        lastModified: changed.mtime,
        entryCount: indexed,
      };

      filesIndexed++;
      entriesIndexed += indexed;
    } catch (error) {
      // Log but continue with other files
      if (options.verbose) {
        console.warn(`Failed to index ${changed.filename}:`, error);
      }
    }
  }

  // Update sync timestamp
  state.lastSyncTimestamp = Date.now();

  // Save state
  await saveIndexState(stateFile, state);

  return {
    filesProcessed,
    filesIndexed,
    entriesIndexed,
    durationMs: Date.now() - startTime,
    fullReindex: options.fullReindex ?? false,
  };
}

/**
 * Clear the Maestro index.
 *
 * @param stateFile - Path to state file
 */
export async function clearMaestroIndex(stateFile: string): Promise<void> {
  // In full implementation, would also clear entries from Resona/LanceDB
  await saveIndexState(stateFile, createEmptyIndexState());
}

// ============================================================================
// CLI-friendly Functions
// ============================================================================

/**
 * Run incremental sync with default paths.
 *
 * @param options - Sync options
 * @returns SyncResult
 */
export async function runMaestroSync(
  options: SyncOptions = {}
): Promise<SyncResult> {
  return syncMaestroIndex(
    options.historyDir ?? MAESTRO_CONFIG.historyDir,
    MAESTRO_CONFIG.stateFile,
    options
  );
}

/**
 * Get index status with default path.
 *
 * @returns IndexStatus
 */
export async function runMaestroStatus(): Promise<IndexStatus> {
  return getMaestroIndexStatus(MAESTRO_CONFIG.stateFile);
}

/**
 * Clear index with default path.
 */
export async function runMaestroClear(): Promise<void> {
  return clearMaestroIndex(MAESTRO_CONFIG.stateFile);
}
