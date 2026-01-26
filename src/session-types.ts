/**
 * ACR - Claude Code Session Indexing Types
 *
 * Type definitions and Zod schemas for indexing Claude Code
 * session transcripts from ~/.claude/projects/.
 */

import { z } from "zod";
import { homedir } from "os";
import { join } from "path";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default configuration for session indexing
 */
export const SESSION_CONFIG = {
  /** Base directory containing project session directories */
  baseDir: join(homedir(), ".claude/projects"),
  /** State file for tracking indexed sessions */
  stateFile: join(homedir(), ".config/acr/session-index-state.json"),
  /** Minimum content length to index */
  minContentLength: 20,
  /** Maximum entries per embedding batch */
  batchSize: 50,
  /** File extension for session files */
  fileExtension: ".jsonl",
} as const;

// ============================================================================
// JSONL Entry Types
// ============================================================================

/**
 * Type of JSONL entry in session file
 */
export const SessionEntryTypeSchema = z.enum([
  "user",
  "assistant",
  "progress",
  "queue-operation",
  "file-history-snapshot",
]);
export type SessionEntryType = z.infer<typeof SessionEntryTypeSchema>;

/**
 * User message content - can be string (prompt) or array (tool results)
 */
export const UserMessageContentSchema = z.union([
  z.string(),
  z.array(z.object({
    type: z.string(),
    tool_use_id: z.string().optional(),
    content: z.unknown().optional(),
  })),
]);

/**
 * Assistant message content block
 */
export const AssistantContentBlockSchema = z.object({
  type: z.enum(["text", "thinking", "tool_use"]),
  text: z.string().optional(),
  thinking: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
});
export type AssistantContentBlock = z.infer<typeof AssistantContentBlockSchema>;

/**
 * Base session entry structure
 */
export const SessionEntryBaseSchema = z.object({
  type: SessionEntryTypeSchema,
  sessionId: z.string().optional(),
  uuid: z.string().optional(),
  timestamp: z.string().optional(),
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
});

/**
 * User entry in session file
 */
export const UserEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal("user"),
  message: z.object({
    role: z.literal("user"),
    content: UserMessageContentSchema,
  }),
});
export type UserEntry = z.infer<typeof UserEntrySchema>;

/**
 * Assistant entry in session file
 */
export const AssistantEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal("assistant"),
  message: z.object({
    role: z.literal("assistant"),
    content: z.array(AssistantContentBlockSchema),
  }),
});
export type AssistantEntry = z.infer<typeof AssistantEntrySchema>;

// ============================================================================
// Parsed Content
// ============================================================================

/**
 * A parsed conversation turn from the session
 */
export const ParsedTurnSchema = z.object({
  /** UUID of the entry */
  uuid: z.string(),
  /** Type: user or assistant */
  role: z.enum(["user", "assistant"]),
  /** The extracted text content */
  content: z.string(),
  /** Timestamp as ISO string */
  timestamp: z.string(),
  /** Working directory during this turn */
  cwd: z.string().optional(),
  /** Git branch if available */
  gitBranch: z.string().optional(),
  /** Session ID */
  sessionId: z.string(),
});
export type ParsedTurn = z.infer<typeof ParsedTurnSchema>;

/**
 * A parsed session with extracted conversation content
 */
export const ParsedSessionSchema = z.object({
  /** Session ID (filename stem) */
  sessionId: z.string(),
  /** Full file path */
  filePath: z.string(),
  /** Project directory from path */
  projectDir: z.string(),
  /** Extracted conversation turns */
  turns: z.array(ParsedTurnSchema),
  /** First timestamp in session */
  startTime: z.string().optional(),
  /** Last timestamp in session */
  endTime: z.string().optional(),
});
export type ParsedSession = z.infer<typeof ParsedSessionSchema>;

// ============================================================================
// Embedding Input
// ============================================================================

/**
 * Input for embedding a session turn
 */
export const SessionEmbeddingInputSchema = z.object({
  /** Source ID: session:{projectDir}:{sessionId}:{uuid} */
  sourceId: z.string(),
  /** Content to embed */
  content: z.string(),
  /** Source type */
  source: z.literal("session"),
  /** Session ID */
  sessionId: z.string(),
  /** Project directory name */
  projectDir: z.string(),
  /** Role: user or assistant */
  role: z.enum(["user", "assistant"]),
  /** Timestamp as unix ms */
  timestamp: z.number(),
  /** Working directory */
  cwd: z.string().optional(),
});
export type SessionEmbeddingInput = z.infer<typeof SessionEmbeddingInputSchema>;

// ============================================================================
// Index State
// ============================================================================

/**
 * State of an indexed session file
 */
export const IndexedSessionStateSchema = z.object({
  /** Last modified timestamp of the file */
  lastModified: z.number().nonnegative(),
  /** Number of turns indexed from this file */
  turnCount: z.number().nonnegative(),
  /** Project directory */
  projectDir: z.string(),
});
export type IndexedSessionState = z.infer<typeof IndexedSessionStateSchema>;

/**
 * Overall index state for session tracking
 */
export const SessionIndexStateSchema = z.object({
  /** Timestamp of last sync operation */
  lastSyncTimestamp: z.number().nonnegative(),
  /** Map of session filename to indexed state */
  indexedSessions: z.record(z.string(), IndexedSessionStateSchema),
});
export type SessionIndexState = z.infer<typeof SessionIndexStateSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty index state
 */
export function createEmptyIndexState(): SessionIndexState {
  return {
    lastSyncTimestamp: 0,
    indexedSessions: {},
  };
}

/**
 * Generate a source ID for a session turn
 *
 * @param projectDir - Project directory name
 * @param sessionId - Session ID
 * @param uuid - Turn UUID
 * @returns Source ID in format session:{projectDir}:{sessionId}:{uuid}
 */
export function generateSourceId(
  projectDir: string,
  sessionId: string,
  uuid: string
): string {
  return `session:${projectDir}:${sessionId}:${uuid}`;
}

/**
 * Parse a source ID into components
 *
 * @param sourceId - Source ID to parse
 * @returns Parsed components or null if invalid
 */
export function parseSourceId(
  sourceId: string
): { projectDir: string; sessionId: string; uuid: string } | null {
  if (!sourceId.startsWith("session:")) {
    return null;
  }

  const parts = sourceId.split(":");
  if (parts.length < 4) {
    return null;
  }

  return {
    projectDir: parts[1],
    sessionId: parts[2],
    uuid: parts.slice(3).join(":"),
  };
}

/**
 * Extract project directory name from full path
 *
 * @param projectPath - Full path like /Users/fischer/.claude/projects/-Users-fischer-work-acr
 * @returns Short name like "acr" or "work-acr"
 */
export function extractProjectName(projectPath: string): string {
  // Get the last segment
  const segment = projectPath.split("/").pop() || "";

  // Remove the leading path prefix pattern (e.g., "-Users-fischer-work-")
  const match = segment.match(/-Users-[^-]+-(?:work-)?(.+)$/);
  if (match) {
    return match[1];
  }

  // Fallback: just return last segment
  return segment;
}

// ============================================================================
// Sync Result Types
// ============================================================================

/**
 * Result of sync operation
 */
export const SyncResultSchema = z.object({
  /** Number of session files scanned */
  sessionsScanned: z.number().nonnegative(),
  /** Number of session files processed (new or modified) */
  sessionsProcessed: z.number().nonnegative(),
  /** Number of turns indexed */
  turnsIndexed: z.number().nonnegative(),
  /** Duration in milliseconds */
  durationMs: z.number().nonnegative(),
  /** Whether this was a full reindex */
  fullReindex: z.boolean(),
  /** Errors encountered */
  errors: z.array(z.string()),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

/**
 * Extended result with embedding stats
 */
export interface SyncResultWithEmbeddings extends SyncResult {
  /** Turns successfully embedded */
  turnsEmbedded: number;
  /** Embedding failures */
  embeddingErrors: number;
}

/**
 * Sync options
 */
export interface SyncOptions {
  /** Force full reindex */
  fullReindex?: boolean;
  /** Verbose logging */
  verbose?: boolean;
  /** Dry run - don't embed */
  dryRun?: boolean;
  /** Progress callback */
  onProgress?: (current: number, total: number, phase: string) => void;
}
