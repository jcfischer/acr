/**
 * ACR - Claude Code Session Parser
 *
 * Parses JSONL session files from ~/.claude/projects/ into
 * structured content for embedding.
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, basename, dirname } from "path";

import {
  type ParsedTurn,
  type ParsedSession,
  type SessionEmbeddingInput,
  type AssistantContentBlock,
  UserEntrySchema,
  AssistantEntrySchema,
  SESSION_CONFIG,
  generateSourceId,
  extractProjectName,
} from "./session-types";

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Session file info
 */
export interface SessionFileInfo {
  /** Full file path */
  filePath: string;
  /** Session ID (filename without extension) */
  sessionId: string;
  /** Project directory name */
  projectDir: string;
  /** Last modified timestamp */
  mtime: number;
}

/**
 * Scan for all session files in the projects directory
 *
 * @param baseDir - Base directory to scan
 * @returns Array of session file info
 */
export async function scanSessionFiles(
  baseDir: string = SESSION_CONFIG.baseDir
): Promise<SessionFileInfo[]> {
  const sessions: SessionFileInfo[] = [];

  try {
    // List all project directories
    const projectDirs = await readdir(baseDir);

    for (const projectDir of projectDirs) {
      const projectPath = join(baseDir, projectDir);

      try {
        const projectStats = await stat(projectPath);
        if (!projectStats.isDirectory()) {
          continue;
        }

        // List all files in project directory
        const files = await readdir(projectPath);

        for (const file of files) {
          if (!file.endsWith(SESSION_CONFIG.fileExtension)) {
            continue;
          }

          const filePath = join(projectPath, file);

          try {
            const fileStats = await stat(filePath);
            if (fileStats.isFile()) {
              sessions.push({
                filePath,
                sessionId: file.replace(SESSION_CONFIG.fileExtension, ""),
                projectDir,
                mtime: fileStats.mtimeMs,
              });
            }
          } catch {
            // Skip files we can't stat
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }
  } catch {
    // Base directory doesn't exist
  }

  return sessions;
}

// ============================================================================
// JSONL Parsing
// ============================================================================

/**
 * Parse a single JSONL line
 *
 * @param line - JSON line to parse
 * @returns Parsed object or null if invalid
 */
function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Extract text content from user entry
 *
 * @param entry - Raw entry object
 * @returns String content if valid user prompt, null otherwise
 */
function extractUserContent(entry: Record<string, unknown>): string | null {
  const result = UserEntrySchema.safeParse(entry);
  if (!result.success) {
    return null;
  }

  const content = result.data.message.content;

  // Only index actual user prompts (strings), not tool results (arrays)
  if (typeof content === "string" && content.length > 0) {
    return content;
  }

  return null;
}

/**
 * Extract text content from assistant entry
 *
 * @param entry - Raw entry object
 * @returns Combined text content if valid, null otherwise
 */
function extractAssistantContent(entry: Record<string, unknown>): string | null {
  const result = AssistantEntrySchema.safeParse(entry);
  if (!result.success) {
    return null;
  }

  const blocks = result.data.message.content;
  const textParts: string[] = [];

  for (const block of blocks) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
    // Optionally include thinking content for more context
    // Uncomment if desired:
    // if (block.type === "thinking" && block.thinking) {
    //   textParts.push(block.thinking);
    // }
  }

  const combined = textParts.join("\n\n");
  return combined.length > 0 ? combined : null;
}

/**
 * Parse a session JSONL file into structured turns
 *
 * @param filePath - Path to the JSONL file
 * @param minContentLength - Minimum content length to include
 * @returns Parsed session with turns
 */
export async function parseSessionFile(
  filePath: string,
  minContentLength: number = SESSION_CONFIG.minContentLength
): Promise<ParsedSession> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  const sessionId = basename(filePath, SESSION_CONFIG.fileExtension);
  const projectDir = basename(dirname(filePath));

  const turns: ParsedTurn[] = [];
  let startTime: string | undefined;
  let endTime: string | undefined;

  for (const line of lines) {
    const entry = parseJsonLine(line);
    if (!entry) continue;

    const entryType = entry.type as string;
    const timestamp = entry.timestamp as string | undefined;
    const uuid = entry.uuid as string | undefined;
    const cwd = entry.cwd as string | undefined;
    const gitBranch = entry.gitBranch as string | undefined;
    const entrySessionId = (entry.sessionId as string) || sessionId;

    // Track time range
    if (timestamp) {
      if (!startTime || timestamp < startTime) {
        startTime = timestamp;
      }
      if (!endTime || timestamp > endTime) {
        endTime = timestamp;
      }
    }

    if (entryType === "user") {
      const content = extractUserContent(entry);
      if (content && content.length >= minContentLength && uuid) {
        turns.push({
          uuid,
          role: "user",
          content,
          timestamp: timestamp || new Date().toISOString(),
          cwd,
          gitBranch,
          sessionId: entrySessionId,
        });
      }
    } else if (entryType === "assistant") {
      const content = extractAssistantContent(entry);
      if (content && content.length >= minContentLength && uuid) {
        turns.push({
          uuid,
          role: "assistant",
          content,
          timestamp: timestamp || new Date().toISOString(),
          cwd,
          gitBranch,
          sessionId: entrySessionId,
        });
      }
    }
  }

  return {
    sessionId,
    filePath,
    projectDir,
    turns,
    startTime,
    endTime,
  };
}

// ============================================================================
// Embedding Input Conversion
// ============================================================================

/**
 * Convert parsed turns to embedding inputs
 *
 * @param session - Parsed session
 * @returns Array of embedding inputs
 */
export function toEmbeddingInputs(session: ParsedSession): SessionEmbeddingInput[] {
  const shortProjectName = extractProjectName(session.projectDir);

  return session.turns.map((turn) => ({
    sourceId: generateSourceId(shortProjectName, session.sessionId, turn.uuid),
    content: turn.content,
    source: "session" as const,
    sessionId: session.sessionId,
    projectDir: shortProjectName,
    role: turn.role,
    timestamp: new Date(turn.timestamp).getTime(),
    cwd: turn.cwd,
  }));
}

/**
 * Check if a user prompt is a trivial question that shouldn't be indexed.
 * Trivial questions match similar questions rather than substantive content.
 *
 * @param content - The user prompt content
 * @returns true if the prompt should be filtered out
 */
function isTrivialQuestion(content: string): boolean {
  const trimmed = content.trim();

  // Very short content (< 50 chars) is usually not substantive
  if (trimmed.length < 50) {
    return true;
  }

  // Questions ending with ? that are short-ish are often retrieval queries
  // like "do you remember...", "where did we...", "what was..."
  if (trimmed.endsWith("?") && trimmed.length < 150) {
    return true;
  }

  // Common question starters that indicate retrieval rather than content
  const trivialPatterns = [
    /^do you remember/i,
    /^where did we/i,
    /^what was the/i,
    /^can you find/i,
    /^search for/i,
    /^look for/i,
    /^find the/i,
    // Compaction/summarization prompts (Claude Code internal)
    /synopsize/i,
    /^summarize (the |our |this )?session/i,
    /^summarize (the |our |this )?recent work/i,
    /^continue from where we left/i,
    /^continue the conversation/i,
    /This session is being continued from a previous/i,
  ];

  for (const pattern of trivialPatterns) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Filter turns for embedding - include assistant responses and
 * substantive user content, exclude trivial questions.
 *
 * @param turns - Parsed turns
 * @param includeAssistant - Whether to include assistant turns (default: true)
 * @returns Filtered turns
 */
export function filterTurnsForEmbedding(
  turns: ParsedTurn[],
  includeAssistant: boolean = true
): ParsedTurn[] {
  return turns.filter((turn) => {
    if (turn.role === "assistant") {
      return includeAssistant;
    }

    // For user turns, filter out trivial questions
    return !isTrivialQuestion(turn.content);
  });
}
