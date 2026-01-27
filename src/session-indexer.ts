/**
 * ACR - Claude Code Session Indexer
 *
 * Indexes Claude Code session transcripts for ACR Tier 2 semantic search.
 * Supports incremental sync to avoid re-indexing unchanged files.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

import {
  SESSION_CONFIG,
  SessionIndexStateSchema,
  createEmptyIndexState,
  type SessionIndexState,
  type SyncOptions,
  type SyncResultWithEmbeddings,
} from "./session-types";

import {
  scanSessionFiles,
  parseSessionFile,
  toEmbeddingInputs,
  filterTurnsForEmbedding,
  type SessionFileInfo,
} from "./session-parser";

import { EmbeddingService } from "./embedding-service";
import { VectorStore } from "./vector-store";
import { indexEmbeddings, type IndexableInput } from "./embedding-indexer";
import { EMBEDDING_CONFIG } from "./embedding-types";

// ============================================================================
// State Management
// ============================================================================

/**
 * Load index state from file
 *
 * @param stateFile - Path to state file
 * @returns SessionIndexState, or empty state if file doesn't exist
 */
export async function loadIndexState(
  stateFile: string = SESSION_CONFIG.stateFile
): Promise<SessionIndexState> {
  try {
    const content = await readFile(stateFile, "utf-8");
    const json = JSON.parse(content);
    const result = SessionIndexStateSchema.safeParse(json);

    if (result.success) {
      return result.data;
    }
  } catch {
    // File doesn't exist or is invalid
  }

  return createEmptyIndexState();
}

/**
 * Save index state to file
 *
 * @param stateFile - Path to state file
 * @param state - State to save
 */
export async function saveIndexState(
  stateFile: string,
  state: SessionIndexState
): Promise<void> {
  const dir = dirname(stateFile);
  await mkdir(dir, { recursive: true });
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Check if a session file needs reindexing
 *
 * @param session - Session file info
 * @param state - Current index state
 * @returns true if file needs reindexing
 */
export function shouldReindexSession(
  session: SessionFileInfo,
  state: SessionIndexState
): boolean {
  const indexed = state.indexedSessions[session.sessionId];

  // New session
  if (!indexed) {
    return true;
  }

  // Modified since last index
  return session.mtime > indexed.lastModified;
}

/**
 * Get list of sessions that need indexing
 *
 * @param sessions - All session files
 * @param state - Current index state
 * @returns Sessions that need reindexing
 */
export function getChangedSessions(
  sessions: SessionFileInfo[],
  state: SessionIndexState
): SessionFileInfo[] {
  return sessions.filter((session) => shouldReindexSession(session, state));
}

// ============================================================================
// Sync Operations
// ============================================================================

/**
 * Sync session index with transcript files
 *
 * @param options - Sync options
 * @returns Sync result with statistics
 */
export async function syncSessionIndex(
  options: SyncOptions = {}
): Promise<SyncResultWithEmbeddings> {
  const startTime = Date.now();

  const result: SyncResultWithEmbeddings = {
    sessionsScanned: 0,
    sessionsProcessed: 0,
    turnsIndexed: 0,
    turnsEmbedded: 0,
    embeddingErrors: 0,
    durationMs: 0,
    fullReindex: options.fullReindex ?? false,
    errors: [],
  };

  // Load current state (or empty if full reindex)
  let state = options.fullReindex
    ? createEmptyIndexState()
    : await loadIndexState();

  // Scan for session files
  const allSessions = await scanSessionFiles();
  result.sessionsScanned = allSessions.length;

  // Find changed sessions
  const changedSessions = options.fullReindex
    ? allSessions
    : getChangedSessions(allSessions, state);

  // Collect all inputs for batch embedding
  const allInputs: IndexableInput[] = [];

  // Process each changed session
  for (const sessionInfo of changedSessions) {
    try {
      // Parse session file
      const session = await parseSessionFile(
        sessionInfo.filePath,
        SESSION_CONFIG.minContentLength
      );

      // Filter: include assistant responses, exclude trivial user questions
      const filteredTurns = filterTurnsForEmbedding(session.turns);

      if (filteredTurns.length === 0) {
        // Update state to avoid reprocessing
        state.indexedSessions[sessionInfo.sessionId] = {
          lastModified: sessionInfo.mtime,
          turnCount: 0,
          projectDir: sessionInfo.projectDir,
        };
        continue;
      }

      // Create filtered session for conversion
      const filteredSession = { ...session, turns: filteredTurns };

      // Convert to embedding inputs
      const sessionInputs = toEmbeddingInputs(filteredSession);

      // Convert to unified IndexableInput format
      const indexableInputs: IndexableInput[] = sessionInputs.map((s) => ({
        sourceId: s.sourceId,
        content: s.content,
        source: "session" as const,
        metadata: {
          sessionId: s.sessionId,
          projectDir: s.projectDir,
          role: s.role,
          cwd: s.cwd,
        },
        timestamp: s.timestamp,
      }));

      allInputs.push(...indexableInputs);

      result.sessionsProcessed++;
      result.turnsIndexed += indexableInputs.length;

      // Update state
      state.indexedSessions[sessionInfo.sessionId] = {
        lastModified: sessionInfo.mtime,
        turnCount: indexableInputs.length,
        projectDir: sessionInfo.projectDir,
      };
    } catch (error) {
      result.errors.push(
        `Failed to process ${sessionInfo.sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Generate embeddings if not dry run
  if (allInputs.length > 0 && !options.dryRun) {
    try {
      const embeddingService = new EmbeddingService();
      const vectorStore = new VectorStore(EMBEDDING_CONFIG.dbPath);
      await vectorStore.initialize();

      const embeddingResult = await indexEmbeddings(
        allInputs,
        embeddingService,
        vectorStore,
        { onProgress: options.onProgress }
      );

      result.turnsEmbedded = embeddingResult.embedded;
      result.embeddingErrors = embeddingResult.failed;

      if (embeddingResult.errors.length > 0) {
        result.errors.push(...embeddingResult.errors.slice(0, 5));
      }
    } catch (error) {
      result.embeddingErrors = allInputs.length;
      result.errors.push(
        `Embedding failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Update sync timestamp and save state
  state.lastSyncTimestamp = Date.now();
  await saveIndexState(SESSION_CONFIG.stateFile, state);

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Clear the session index
 *
 * @param clearEmbeddings - Also clear embeddings from vector store
 */
export async function clearSessionIndex(
  clearEmbeddings: boolean = false
): Promise<void> {
  await saveIndexState(SESSION_CONFIG.stateFile, createEmptyIndexState());

  if (clearEmbeddings) {
    try {
      const vectorStore = new VectorStore(EMBEDDING_CONFIG.dbPath);
      await vectorStore.initialize();
      await vectorStore.deleteBySource("session");
    } catch {
      // Vector store may not exist
    }
  }
}

/**
 * Get index status
 */
export async function getSessionIndexStatus(): Promise<{
  initialized: boolean;
  lastSyncTimestamp: number;
  sessionCount: number;
  turnCount: number;
}> {
  const state = await loadIndexState();

  const sessionCount = Object.keys(state.indexedSessions).length;
  const turnCount = Object.values(state.indexedSessions).reduce(
    (sum, s) => sum + s.turnCount,
    0
  );

  return {
    initialized: state.lastSyncTimestamp > 0,
    lastSyncTimestamp: state.lastSyncTimestamp,
    sessionCount,
    turnCount,
  };
}

// ============================================================================
// Session Parsing Utilities (for testing and direct parsing)
// ============================================================================

/**
 * Parsed JSONL entry
 */
export interface ParsedEntry {
  type: string;
  message?: string;
  summary?: {
    conversation_summary?: string;
    project?: string;
  };
  [key: string]: unknown;
}

/**
 * Session synopsis extracted from session history
 */
export interface SessionSynopsis {
  sessionId: string;
  projectPath: string;
  synopsis: string;
  createdAt: Date;
  messageCount: number;
}

/**
 * Parse JSONL content into entries
 *
 * @param content - JSONL string content
 * @returns Array of parsed entries
 */
export function parseSessionHistory(content: string): ParsedEntry[] {
  if (!content || content.trim() === "") {
    return [];
  }

  const entries: ParsedEntry[] = [];
  const lines = content.split("\n").filter((line) => line.trim() !== "");

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null) {
        entries.push(parsed as ParsedEntry);
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return entries;
}

/**
 * Extract synopsis from parsed session entries
 *
 * @param entries - Parsed JSONL entries
 * @param sessionId - Session identifier
 * @param projectPath - Project path
 * @returns SessionSynopsis or null if no content
 */
export function extractSynopsis(
  entries: ParsedEntry[],
  sessionId: string,
  projectPath: string
): SessionSynopsis | null {
  if (entries.length === 0) {
    return null;
  }

  // Find summary entries (prefer last one)
  const summaries = entries.filter((e) => e.type === "summary");
  const lastSummary = summaries.length > 0 ? summaries[summaries.length - 1] : null;

  let synopsis: string;

  if (lastSummary?.summary?.conversation_summary) {
    synopsis = lastSummary.summary.conversation_summary;
  } else {
    // Fall back to first user message
    const userMessages = entries.filter((e) => e.type === "user");
    if (userMessages.length > 0 && userMessages[0].message) {
      synopsis = userMessages[0].message;
    } else {
      synopsis = "No synopsis available";
    }
  }

  // Truncate long synopsis (max 500 chars)
  if (synopsis.length > 500) {
    synopsis = synopsis.slice(0, 497) + "...";
  }

  // Count messages (user + assistant)
  const messageCount = entries.filter(
    (e) => e.type === "user" || e.type === "assistant"
  ).length;

  return {
    sessionId,
    projectPath,
    synopsis,
    createdAt: new Date(),
    messageCount,
  };
}
